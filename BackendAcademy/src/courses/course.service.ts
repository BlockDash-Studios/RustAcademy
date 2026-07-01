import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CourseEntity } from './course.entity';
import {
  CourseRevisionEntity,
  CourseRevisionReason,
} from './course-revision.entity';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { RewardsService } from '../rewards/rewards.service';

/**
 * Business logic for courses.
 *
 * Persistence is delegated to injected TypeORM repositories
 * (`Repository<CourseEntity>` and `Repository<CourseRevisionEntity>`).
 * Each meaningful course change appends an immutable revision to the
 * `course_revisions` table so the full version history is preserved as
 * an append-only audit trail.
 */
@Injectable()
export class CourseService {
  /**
   * Baseline version assigned to brand-new courses.  Kept as a private
   * constant so the initial version can never drift away from `1`.
   */
  private static readonly INITIAL_VERSION = 1;

  constructor(
    @InjectRepository(CourseEntity)
    private readonly courseRepo: Repository<CourseEntity>,
    @InjectRepository(CourseRevisionEntity)
    private readonly revisionRepo: Repository<CourseRevisionEntity>,
    private readonly rewardsService: RewardsService,
  ) {}

  async create(dto: CreateCourseDto): Promise<CourseEntity> {
    const course = this.courseRepo.create({
      id: crypto.randomUUID(),
      version: CourseService.INITIAL_VERSION,
      ...dto,
    });
    const saved = await this.courseRepo.save(course);
    await this.appendRevision(saved, 'create', {
      changeNote: 'Initial version',
    });
    return saved;
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

  async update(id: string, dto: UpdateCourseDto): Promise<CourseEntity | null> {
    const course = await this.courseRepo.findOne({ where: { id } });
    if (!course) return null;

    const previousVersion = course.version;
    course.version = previousVersion + 1;
    course.updatedAt = new Date();
    Object.assign(course, dto);
    this.syncCourseTaxonomy(course, dto);
    const saved = await this.courseRepo.save(course);

    await this.appendRevision(saved, 'update', {
      changeNote: dto.changeNote,
      revisionAuthor: dto.revisionAuthor,
      previousVersion,
    });
    return saved;
  }

  async remove(id: string): Promise<boolean> {
    const course = await this.courseRepo.findOne({ where: { id } });
    if (!course) return false;
    await this.courseRepo.remove(course);
    // Revisions are intentionally retained so admins can audit what content
    // was previously published even after the parent course row is gone.
    return true;
  }

  // ---------------------------------------------------------------------------
  // Revision history API
  // ---------------------------------------------------------------------------

  /**
   * Returns the full revision history for a course, ordered by version ascending.
   * Revisions remain queryable even after the parent course has been removed
   * so the audit trail can still be inspected.
   */
  async getRevisions(courseId: string): Promise<CourseRevisionEntity[]> {
    return this.revisionRepo.find({
      where: { courseId },
      order: { version: 'ASC' },
    });
  }

  /**
   * Returns the latest revision for a course, or null when no revisions exist.
   */
  async getLatestRevision(
    courseId: string,
  ): Promise<CourseRevisionEntity | null> {
    return this.revisionRepo.findOne({
      where: { courseId },
      order: { version: 'DESC' },
    });
  }

  /**
   * Returns a specific revision by its numeric version for a given course.
   * Returns null when the revision cannot be found.
   */
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

  /**
   * Restores the content of a course to a previous revision.  The restore
   * operation itself is recorded as a new revision so the audit trail
   * remains append-only and the current version always points at the
   * latest revision.
   */
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
    return saved;
  }

  /**
   * Returns the total number of revisions recorded for a course.
   */
  async getRevisionCount(courseId: string): Promise<number> {
    return this.revisionRepo.count({ where: { courseId } });
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  /**
   * Persist a new revision snapshot of the course and update the course's
   * `latestRevisionId` pointer in one round-trip each.
   *
   * Returns the saved revision so callers can read its id without an extra
   * query.  Revisions are immutable once recorded.
   *
   * Persistence order is forced by FK constraints: the course must exist
   * before the revision that references it can be inserted.
   */
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

  async completeCourse(id: string, userId: string) {
    const course = await this.courseRepo.findOne({ where: { id } });
    if (!course) {
      throw new NotFoundException(`Course with ID ${id} not found.`);
    }

    // Reward the user for completing the course
    const xpReward = course.xpReward || 50; // Default to 50 XP if not specified
    const result = this.rewardsService.recordActivity(userId, new Date(), xpReward);

    return {
      message: 'Course completed successfully',
      courseId: id,
      userId,
      xpAwarded: xpReward,
      progression: result,
    };
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
}
