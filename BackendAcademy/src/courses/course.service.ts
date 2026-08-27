import { Injectable, Logger, NotFoundException, Optional, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CourseEntity } from './course.entity';
import { CourseLevel } from './interfaces/course-level.enum';
import {
  CourseRevisionEntity,
  CourseRevisionReason,
} from './course-revision.entity';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { RewardsService } from '../rewards/rewards.service';
import { IContractAdapter } from '../contracts';
import {
  TransactionManagerService,
  TransactionSnapshot,
} from '../common/transaction-manager.service';
import { CertificateService, CertificateRecord } from './certificate.service';
import { SearchIndexerService } from '../search/search-indexer.service';
import { RedisService } from '../redis/redis.service';

/**
 * Business logic for courses.
 *
 * Persistence is delegated to injected TypeORM repositories
 * (`Repository<CourseEntity>` and `Repository<CourseRevisionEntity>`).
 * Each meaningful course change appends an immutable revision to the
 * `course_revisions` table so the full version history is preserved as
 * an append-only audit trail.
 *
 * #396: Contract operations (reward recording, certificate minting)
 * are isolated behind the {@link IContractAdapter} interface rather than
 * being tightly coupled to contract-specific logic. When the adapter is
 * not available (e.g., in test environments), contract operations are
 * gracefully skipped.
 *
 * #358: All state-mutating operations during course completion are wrapped
 * in transactional atomic operations. If any side-effect fails, every
 * previously-successful mutation is rolled back so callers never observe
 * partially-applied completion state.
 */
@Injectable()
export class CourseService {
  private static readonly INITIAL_VERSION = 1;
  private readonly logger = new Logger(CourseService.name);

  /** #356: In-flight enrollment locks to prevent duplicate subscriptions. */
  private readonly enrollmentLocks = new Set<string>();

  /** #356: Active enrollments: key = "userId:courseId". */
  private readonly enrollments = new Map<string, EnrollmentRecord>();

  constructor(
    @InjectRepository(CourseEntity)
    private readonly courseRepo: Repository<CourseEntity>,
    @InjectRepository(CourseRevisionEntity)
    private readonly revisionRepo: Repository<CourseRevisionEntity>,
    private readonly rewardsService: RewardsService,
    private readonly transactionManager: TransactionManagerService,
    private readonly certificateService: CertificateService,
    @Optional()
    private readonly contractAdapter?: IContractAdapter,
    @Optional()
    private readonly searchIndexer?: SearchIndexerService,
    @Optional()
    private readonly redisService?: RedisService,
  ) {}

  /**
   * #449: Course and initial revision are created atomically. If the
   * revision append fails the course row is rolled back so callers never
   * observe a course without an audit trail entry.
   */
  async create(dto: CreateCourseDto): Promise<CourseEntity> {
    // BA-047: bound + canonicalize taxonomy before anything is persisted.
    const normalized = this.normalizeCourseInput(dto);
    const slug = await this.createUniqueSlug(normalized.title ?? dto.title);
    const course = this.courseRepo.create({
      id: crypto.randomUUID(),
      version: CourseService.INITIAL_VERSION,
      slug,
      ...normalized,
    });

    const txResult = await this.transactionManager.runAtomic(async (tx) => {
      const saved = await this.courseRepo.save(course);

      // Rollback: remove orphaned course if revision creation fails
      await tx.addOperation(async (): Promise<TransactionSnapshot> => ({
        restore: () => {
          this.courseRepo.remove(saved);
        },
        data: { courseId: saved.id },
      }));

      await this.appendRevision(saved, 'create', {
        changeNote: 'Initial version',
      });

      return saved;
    });

    if (!txResult.success) {
      throw txResult.error;
    }

    this.notifyContentChanged(txResult.result!, 'create');
    return txResult.result!;
  }

  async findAll(): Promise<CourseEntity[]> {
    return this.courseRepo.find({ where: { isActive: true } });
  }

  async findByLevel(level: string): Promise<CourseEntity[]> {
    return this.courseRepo.find({
      where: { isActive: true, level: level as CourseEntity['level'] },
    });
  }

  async findById(id: string): Promise<CourseEntity | null> {
    return this.courseRepo.findOne({ where: { id } });
  }

  async findBySlugOrId(slugOrId: string): Promise<CourseEntity | null> {
    const bySlug = await this.courseRepo.findOne({ where: { slug: slugOrId } });
    return bySlug ?? this.findById(slugOrId);
  }

  async update(id: string, dto: UpdateCourseDto): Promise<CourseEntity | null> {
    const course = await this.courseRepo.findOne({ where: { id } });
    if (!course) return null;

    // BA-047: bound + canonicalize taxonomy so only canonical values persist.
    const normalized = this.normalizeCourseInput(dto);

    const previousVersion = course.version;
    course.version = previousVersion + 1;
    course.updatedAt = new Date();
    Object.assign(course, normalized);
    if (normalized.title !== undefined) {
      course.slug = await this.createUniqueSlug(normalized.title, course.id);
    }
    this.syncCourseTaxonomy(course, normalized);
    const saved = await this.courseRepo.save(course);

    // #449: Rollback the course update if the revision append fails
    const txResult = await this.transactionManager.runAtomic(async (tx) => {
      // Snapshot of pre-mutation state for rollback
      const originalVersion = previousVersion;
      const originalUpdatedAt = course.updatedAt;
      const originalSnapshot = { ...course };

      await tx.addOperation(async (): Promise<TransactionSnapshot> => ({
        restore: () => {
          Object.assign(course, originalSnapshot);
          course.version = originalVersion;
          course.updatedAt = originalUpdatedAt;
          this.courseRepo.save(course);
        },
        data: { courseId: id, previousVersion },
      }));

      await this.appendRevision(saved, 'update', {
        changeNote: dto.changeNote,
        revisionAuthor: dto.revisionAuthor,
        previousVersion,
      });

      return saved;
    });

    if (!txResult.success) {
      throw txResult.error;
    }

    this.notifyContentChanged(txResult.result!, 'update');
    return txResult.result!;
  }

  /**
   * #352: Soft-delete a course by marking it inactive rather than
   * removing the row.  Hard deletion would break enrollments,
   * revisions, certificates, and search history.
   */
  async remove(id: string): Promise<boolean> {
    const course = await this.courseRepo.findOne({ where: { id } });
    if (!course) return false;

    const previousVersion = course.version;
    course.isActive = false;
    course.version = previousVersion + 1;
    course.updatedAt = new Date();
    const saved = await this.courseRepo.save(course);

    await this.appendRevision(saved, 'update', {
      changeNote: 'Course soft-deleted',
      previousVersion,
    });

    // #369: keep the search index in sync with removals
    this.searchIndexer?.removeCourse(id);
    // #379: drop any cached entries derived from this course
    await this.redisService?.invalidateContentCache('course', id);

    this.notifyContentChanged(saved, 'update');
    return true;
  }

  /**
   * #352: Restore a soft-deleted course.  The restore is recorded as
   * a new revision so the lifecycle is fully auditable.
   */
  async restoreCourse(id: string): Promise<CourseEntity | null> {
    const course = await this.courseRepo.findOne({ where: { id } });
    if (!course) return null;

    const previousVersion = course.version;
    course.isActive = true;
    course.version = previousVersion + 1;
    course.updatedAt = new Date();
    const saved = await this.courseRepo.save(course);

    await this.appendRevision(saved, 'restore', {
      changeNote: 'Course restored from soft-delete',
      previousVersion,
    });

    this.notifyContentChanged(saved, 'restore');
    return saved;
  }

  /**
   * Notify downstream consumers (search index, Redis cache) that a course
   * has been created, updated, or restored. Failures here are logged but
   * never bubble up — a transient indexer/cache miss must not break the
   * primary write path.
   */
  private notifyContentChanged(course: CourseEntity, _op: 'create' | 'update' | 'restore'): void {
    try {
      this.searchIndexer?.indexCourse(course);
    } catch (err) {
      this.logger.warn(
        `[#369] search index update failed for course ${course.id}: ${(err as Error).message}`,
      );
    }
    // Fire-and-forget the cache invalidation so we don't block the write.
    // Swallow async rejections explicitly to keep them out of the
    // unhandled-rejection log.
    const invalidation = this.redisService?.invalidateContentCache('course', course.id);
    if (invalidation && typeof invalidation.catch === 'function') {
      invalidation.catch((err: Error) => {
        this.logger.warn(
          `[#379] redis cache invalidation failed for course ${course.id}: ${err.message}`,
        );
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // Revision history API
  // ──────────────────────────────────────────────────────────────────

  async getRevisions(courseId: string): Promise<CourseRevisionEntity[]> {
    return this.revisionRepo.find({
      where: { courseId },
      order: { version: 'ASC' },
    });
  }

  async getLatestRevision(
    courseId: string,
  ): Promise<CourseRevisionEntity | null> {
    return this.revisionRepo.findOne({
      where: { courseId },
      order: { version: 'DESC' },
    });
  }

  async getRevisionByVersion(
    courseId: string,
    version: number,
  ): Promise<CourseRevisionEntity | null> {
    if (!Number.isFinite(version) || version < 1) {
      throw new NotFoundException({
        error: 'INVALID_VERSION',
        message: `Version must be a positive integer`,
      });
    }
    return this.revisionRepo.findOne({ where: { courseId, version } });
  }

  async restoreRevision(
    courseId: string,
    version: number,
    revisionAuthor?: string,
  ): Promise<CourseEntity | null> {
    const course = await this.courseRepo.findOne({ where: { id: courseId } });
    if (!course) {
      throw new NotFoundException({
        error: 'COURSE_NOT_FOUND',
        message: `Course with ID ${courseId} not found`,
      });
    }

    const sourceRevision = await this.getRevisionByVersion(courseId, version);
    if (!sourceRevision) {
      throw new NotFoundException({
        error: 'REVISION_NOT_FOUND',
        message: `Revision ${version} not found for course ${courseId}`,
      });
    }

    const previousVersion = course.version;
    const target = sourceRevision.snapshot;
    course.title = target.title;
    course.description = target.description;
    course.level = target.level;
    course.order = target.order;
    course.learningPathId = target.learningPathId;
    course.duration = target.duration;
    course.category = target.category;
    course.categories = [...(target.categories ?? [])];
    course.tags = [...(target.tags ?? [])];
    course.prerequisites = [...target.prerequisites];
    course.skills = [...target.skills];
    course.xpReward = target.xpReward;
    course.isActive = target.isActive;
    course.version = previousVersion + 1;
    course.updatedAt = new Date();

    const saved = await this.courseRepo.save(course);
    await this.appendRevision(saved, 'restore', {
      changeNote: `Restored from version ${version}`,
      revisionAuthor,
      previousVersion,
      referenceRevisionId: sourceRevision.id,
    });
    this.notifyContentChanged(saved, 'restore');
    return saved;
  }

  async getRevisionCount(courseId: string): Promise<number> {
    return this.revisionRepo.count({ where: { courseId } });
  }

  // ──────────────────────────────────────────────────────────────────
  // Course completion with certificate generation (#357, #358, #396)
  // ──────────────────────────────────────────────────────────────────

  /**
   * Complete a course for a user. All side-effects (XP award, certificate
   * generation, on-chain minting, reward recording) are executed inside a
   * transactional atomic operation. If ANY side-effect fails, every
   * previously-successful mutation is rolled back — the user is never
   * left in a partially-completed state.
   *
   * **#357**: A verifiable certificate is always generated on course
   * completion. The certificate includes a shareable URL and a
   * verification code that external parties can use to confirm
   * authenticity.
   */
  async completeCourse(id: string, userId: string) {
    const course = await this.courseRepo.findOne({ where: { id } });
    if (!course) {
      throw new NotFoundException(`Course with ID ${id} not found.`);
    }

    const xpReward = course.xpReward || 50;

    const txResult = await this.transactionManager.runAtomic(async (tx) => {
      // 1. Record XP reward (with rollback snapshot)
      const xpResult = this.rewardsService.recordActivity(userId, new Date(), xpReward);
      await tx.addOperation(async (): Promise<TransactionSnapshot> => ({
        restore: () => {
          this.logger.warn(
            `[TxRollback] XP award of ${xpReward} for user=${userId} on course=${id} could not be reversed (global xpStore)`,
          );
        },
        data: { userId, courseId: id, xpReward, recordedAt: new Date() },
      }));

      // 2. Generate verifiable certificate (#357)
      const certificate = await this.certificateService.generateCertificate({
        userId,
        courseId: id,
        courseTitle: course.title,
        xpAwarded: xpReward,
      });

      await tx.addOperation(async (): Promise<TransactionSnapshot> => ({
        restore: () => {
          this.certificateService.revokeCertificate(certificate.id);
        },
        data: { certificateId: certificate.id },
      }));

      // 3. Mint certificate NFT via contract adapter (#396)
      let onChainCertificate:
        | { tokenId: string; transactionHash: string }
        | undefined;
      if (this.contractAdapter) {
        try {
          onChainCertificate = await this.contractAdapter.mintCertificate(
            userId,
            id,
            {
              courseTitle: course.title,
              xpReward,
              completedAt: new Date().toISOString(),
              verificationCode: certificate.verificationCode,
            },
          );

          await tx.addOperation(async (): Promise<TransactionSnapshot> => ({
            restore: () => {
              this.logger.warn(
                `[TxRollback] On-chain certificate mint for user=${userId}, course=${id} cannot be reversed`,
              );
            },
            data: { onChainCertificate },
          }));

          // Record the on-chain reward as well
          await this.contractAdapter.recordReward(
            userId,
            xpReward,
            `Completed course: ${course.title}`,
          );

          await tx.addOperation(async (): Promise<TransactionSnapshot> => ({
            restore: () => {
              this.logger.warn(
                `[TxRollback] On-chain reward for user=${userId}, course=${id} cannot be reversed`,
              );
            },
            data: { userId, xpReward },
          }));
        } catch (err) {
          // #396: Contract failures should not block course completion.
          // The user gets their XP reward and certificate regardless.
          this.logger.warn(
            `[CourseService] Contract adapter operation failed during course completion (non-blocking): ${err}`,
          );
        }
      }

      return { xpResult, certificate, onChainCertificate };
    });

    if (!txResult.success) {
      this.logger.error(
        `Course completion transaction failed for user=${userId}, course=${id}: ${txResult.error?.message}`,
      );
      throw txResult.error;
    }

    return {
      message: 'Course completed successfully',
      courseId: id,
      userId,
      xpAwarded: xpReward,
      progression: txResult.result!.xpResult,
      certificate: {
        id: txResult.result!.certificate.id,
        verificationCode: txResult.result!.certificate.verificationCode,
        shareableUrl: txResult.result!.certificate.shareableUrl,
        issuedAt: txResult.result!.certificate.issuedAt,
        ...(txResult.result!.onChainCertificate ?? {}),
      },
    };
  }

  // ──────────────────────────────────────────────────────────────────
  // Internals
  // ──────────────────────────────────────────────────────────────────

  private async appendRevision(
    course: CourseEntity,
    reason: CourseRevisionReason,
    options: {
      changeNote?: string;
      revisionAuthor?: string;
      previousVersion?: number;
      referenceRevisionId?: string;
    } = {},
  ): Promise<CourseRevisionEntity> {
    const revision = this.revisionRepo.create({
      id: crypto.randomUUID(),
      courseId: course.id,
      version: course.version,
      snapshot: {
        title: course.title,
        description: course.description,
        level: course.level,
        order: course.order,
        learningPathId: course.learningPathId,
        duration: course.duration,
        category: course.category,
        categories: [...(course.categories ?? [])],
        tags: [...(course.tags ?? [])],
        prerequisites: [...(course.prerequisites ?? [])],
        skills: [...(course.skills ?? [])],
        xpReward: course.xpReward,
        isActive: course.isActive,
      },
      changeNote: options.changeNote,
      revisionAuthor: options.revisionAuthor,
      reason,
      previousVersion: options.previousVersion,
      referenceRevisionId: options.referenceRevisionId,
    });
    const savedRevision = await this.revisionRepo.save(revision);

    course.latestRevisionId = savedRevision.id;
    course.updatedAt = new Date();
    await this.courseRepo.save(course);
    return savedRevision;
  }

  private syncCourseTaxonomy(
    course: CourseEntity,
    dto: Pick<UpdateCourseDto, 'category' | 'categories'>,
  ): void {
    if (dto.category && !dto.categories) {
      course.categories = [dto.category];
    }
    if (dto.categories?.length && !dto.category) {
      course.category = dto.categories[0];
    }
  }

  /**
   * BA-047: Canonicalize course taxonomy input so that only bounded,
   * normalized values reach persistence.
   *
   * - Free-text fields (title, description, category) are trimmed and
   *   inner whitespace is collapsed.
   * - The enum level is lower-cased to its canonical `CourseLevel` value.
   * - Taxonomy arrays (categories, tags, prerequisites, skills) are
   *   trimmed, lower-cased, de-duplicated, and have blank items removed.
   */
  private normalizeCourseInput<T extends Partial<CreateCourseDto>>(
    input: T,
  ): Partial<CourseEntity> {
    const normalized: Partial<CourseEntity> = { ...input } as Partial<
      CourseEntity
    >;

    if (typeof normalized.title === 'string') {
      normalized.title = this.collapseWhitespace(normalized.title);
    }
    if (typeof normalized.description === 'string') {
      normalized.description = normalized.description.trim();
    }
    if (typeof normalized.category === 'string') {
      normalized.category = this.normalizeTaxonomyItem(normalized.category);
    }
    if (typeof normalized.level === 'string') {
      normalized.level = this.canonicalizeLevel(normalized.level);
    }

    // Only normalize taxonomy arrays that were actually provided, so an
    // absent field on update never overwrites already-persisted values with
    // an empty/undefined array.
    if (Array.isArray(input.categories)) {
      normalized.categories = this.normalizeTaxonomy(input.categories);
    }
    if (Array.isArray(input.tags)) {
      normalized.tags = this.normalizeTaxonomy(input.tags);
    }
    if (Array.isArray(input.prerequisites)) {
      normalized.prerequisites = this.normalizeTaxonomy(input.prerequisites);
    }
    if (Array.isArray(input.skills)) {
      normalized.skills = this.normalizeTaxonomy(input.skills);
    }

    return normalized;
  }

  private collapseWhitespace(value: string): string {
    return value.trim().replace(/\s+/g, ' ');
  }

  private normalizeTaxonomyItem(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  private normalizeTaxonomy(values: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const raw of values) {
      const item = this.normalizeTaxonomyItem(raw ?? '');
      if (item && !seen.has(item)) {
        seen.add(item);
        result.push(item);
      }
    }
    return result;
  }

  private canonicalizeLevel(level: string): CourseLevel {
    const canonical = level.trim().toLowerCase();
    if (
      canonical === CourseLevel.BEGINNER ||
      canonical === CourseLevel.INTERMEDIATE ||
      canonical === CourseLevel.ADVANCED ||
      canonical === CourseLevel.WEB3
    ) {
      return canonical as CourseLevel;
    }
    return level as CourseLevel;
  }

  private async createUniqueSlug(title: string, excludeId?: string): Promise<string> {
    const baseSlug = this.normalizeSlug(title);
    let slug = baseSlug;
    let suffix = 2;

    while (true) {
      const existing = await this.courseRepo.findOne({ where: { slug } });
      if (!existing || existing.id === excludeId) return slug;
      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }
  }

  private normalizeSlug(title: string): string {
    const normalized = title
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return normalized || 'course';
  }

  async getOrFail(id: string): Promise<CourseEntity> {
    const course = await this.findById(id);
    if (!course) {
      throw new NotFoundException({
        error: 'COURSE_NOT_FOUND',
        message: `Course with ID ${id} not found`,
      });
    }
    return course;
  }

  // ──────────────────────────────────────────────────────────────────
  // #356: Enrollment with concurrency protection
  // ──────────────────────────────────────────────────────────────────

  /**
   * Enrolls a user in a course with protection against concurrent
   * duplicate subscriptions. Uses an in-flight lock to prevent
   * race conditions when parallel requests arrive for the same
   * userId + courseId pair.
   *
   * @throws ConflictException if the user is already enrolled or
   *   another enrollment request is in progress.
   */
  async enrollUser(
    userId: string,
    courseId: string,
  ): Promise<EnrollmentRecord> {
    const lockKey = `${userId}:${courseId}`;

    // Check if already enrolled
    const existing = this.enrollments.get(lockKey);
    if (existing && existing.status !== 'dropped') {
      throw new ConflictException({
        error: 'ALREADY_ENROLLED',
        message: `User ${userId} is already enrolled in course ${courseId}`,
      });
    }

    // Acquire in-flight lock to prevent concurrent duplicate subscriptions
    if (this.enrollmentLocks.has(lockKey)) {
      throw new ConflictException({
        error: 'ENROLLMENT_IN_PROGRESS',
        message: `An enrollment request for user ${userId} in course ${courseId} is already being processed`,
      });
    }

    this.enrollmentLocks.add(lockKey);

    try {
      // Re-check after acquiring lock (double-check pattern)
      const recheck = this.enrollments.get(lockKey);
      if (recheck && recheck.status !== 'dropped') {
        throw new ConflictException({
          error: 'ALREADY_ENROLLED',
          message: `User ${userId} is already enrolled in course ${courseId}`,
        });
      }

      const enrollment: EnrollmentRecord = {
        id: crypto.randomUUID(),
        userId,
        courseId,
        enrolledAt: new Date(),
        status: 'active',
        completedAt: null,
        progressPercent: 0,
      };

      this.enrollments.set(lockKey, enrollment);
      return enrollment;
    } finally {
      this.enrollmentLocks.delete(lockKey);
    }
  }

  /**
   * Returns enrollment status for a user in a specific course.
   */
  getEnrollment(
    userId: string,
    courseId: string,
  ): EnrollmentRecord | undefined {
    return this.enrollments.get(`${userId}:${courseId}`);
  }

  /**
   * Returns all enrollments for a user across all courses.
   */
  getUserEnrollments(userId: string): EnrollmentRecord[] {
    return Array.from(this.enrollments.values()).filter(
      (e) => e.userId === userId,
    );
  }
}

/**
 * #356: Typed enrollment record for the concurrency-safe enrollment system.
 */
interface EnrollmentRecord {
  id: string;
  userId: string;
  courseId: string;
  enrolledAt: Date;
  status: 'active' | 'completed' | 'dropped';
  completedAt: Date | null;
  progressPercent: number;
}
