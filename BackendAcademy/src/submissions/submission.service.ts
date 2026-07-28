import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ChallengesService } from '../challenges/challenges.service';
import { MonitoringService } from '../monitoring/monitoring.service';
import { SubmissionEntity } from './submission.entity';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { UpdateSubmissionDto } from './dto/update-submission.dto';
import { SaveDraftDto } from './dto/save-draft.dto';
import { SubmissionStatus } from './interfaces/submission-status.enum';

@Injectable()
export class SubmissionService {
  private readonly submissions: Map<string, SubmissionEntity> = new Map();

  constructor(
    private readonly challengesService: ChallengesService,
    private readonly monitoringService: MonitoringService,
  ) {}

  async create(dto: CreateSubmissionDto): Promise<SubmissionEntity> {
    // Check whether the target task is a challenge and enforce the attempt
    // limit before accepting the submission.
    this.verifyChallengeAttemptLimit(dto.taskId, dto.userId);

    const submission = new SubmissionEntity({
      id: crypto.randomUUID(),
      ...dto,
    });
    this.submissions.set(submission.id, submission);

    // Record the attempt when the submission targets a challenge.
    this.recordChallengeAttempt(dto.taskId, dto.userId);

    return submission;
  }

  async findAll(): Promise<SubmissionEntity[]> {
    return Array.from(this.submissions.values());
  }

  async findById(id: string): Promise<SubmissionEntity | null> {
    return this.submissions.get(id) || null;
  }

  async findByTaskId(taskId: string): Promise<SubmissionEntity[]> {
    return Array.from(this.submissions.values()).filter(
      s => s.taskId === taskId,
    );
  }

  async findByUserId(userId: string): Promise<SubmissionEntity[]> {
    return Array.from(this.submissions.values()).filter(
      s => s.userId === userId,
    );
  }

  async findByStatus(status: SubmissionStatus): Promise<SubmissionEntity[]> {
    return Array.from(this.submissions.values()).filter(
      s => s.status === status,
    );
  }

  async update(
    id: string,
    dto: UpdateSubmissionDto,
  ): Promise<SubmissionEntity | null> {
    const submission = this.submissions.get(id);
    if (!submission) return null;
    Object.assign(submission, dto, { updatedAt: new Date() });

    if (dto.status === SubmissionStatus.APPROVED || dto.status === SubmissionStatus.REJECTED) {
      submission.reviewedAt = submission.reviewedAt || new Date();
    }

    return submission;
  }

  async review(
    id: string,
    reviewerId: string,
    status: SubmissionStatus,
    feedback?: string,
    score?: number,
  ): Promise<SubmissionEntity> {
    const submission = this.submissions.get(id);
    if (!submission) throw new NotFoundException('Submission not found');
    submission.status = status;
    submission.reviewedBy = reviewerId;
    submission.reviewedAt = new Date();
    submission.updatedAt = new Date();
    if (feedback !== undefined) submission.feedback = feedback;
    if (score !== undefined) submission.score = score;
    return submission;
  }

  async remove(id: string): Promise<boolean> {
    return this.submissions.delete(id);
  }

  // ---------------------------------------------------------------------------
  // Draft support
  // ---------------------------------------------------------------------------

  /**
   * Create or update a draft submission.
   *
   * If an existing draft already exists for the same `userId` + `taskId`
   * combination it is updated in-place (idempotent upsert). Otherwise a new
   * draft entity is created with `status = DRAFT` and `isDraft = true`.
   *
   * @returns The saved (or updated) draft entity.
   */
  async saveDraft(dto: SaveDraftDto): Promise<SubmissionEntity> {
    // Check for an existing draft for this user/task to allow upsert behaviour
    const existing = Array.from(this.submissions.values()).find(
      s => s.userId === dto.userId && s.taskId === dto.taskId && s.isDraft,
    );

    if (existing) {
      // Update fields that were provided
      if (dto.content !== undefined) existing.content = dto.content;
      if (dto.fileUrl !== undefined) existing.fileUrl = dto.fileUrl;
      existing.draftSavedAt = new Date();
      existing.updatedAt = new Date();
      return existing;
    }

    const draft = new SubmissionEntity({
      id: crypto.randomUUID(),
      taskId: dto.taskId,
      userId: dto.userId,
      content: dto.content ?? '',
      fileUrl: dto.fileUrl,
      status: SubmissionStatus.DRAFT,
      isDraft: true,
      draftSavedAt: new Date(),
    });

    this.submissions.set(draft.id, draft);
    return draft;
  }

  /**
   * Return all draft submissions for a given user.
   */
  async findDraftsByUserId(userId: string): Promise<SubmissionEntity[]> {
    return Array.from(this.submissions.values()).filter(
      s => s.userId === userId && s.isDraft,
    );
  }

  /**
   * Promote a draft submission to a regular (PENDING) submission.
   *
   * The `isDraft` flag is cleared, `draftSavedAt` is nulled out, and the
   * status is set to `PENDING` so the submission enters the normal review
   * workflow.
   *
   * @throws NotFoundException   if no submission with the given ID exists.
   * @throws BadRequestException if the submission is not currently a draft.
   */
  async publishDraft(id: string): Promise<SubmissionEntity> {
    const submission = this.submissions.get(id);
    if (!submission) {
      throw new NotFoundException(`Submission ${id} not found`);
    }
    if (!submission.isDraft) {
      throw new BadRequestException(
        `Submission ${id} is not a draft and cannot be published`,
      );
    }

    // Enforce the attempt limit before allowing the draft to be published
    // as a submission. The learner is effectively submitting when they
    // publish their draft.
    this.verifyChallengeAttemptLimit(submission.taskId, submission.userId);

    submission.isDraft = false;
    submission.draftSavedAt = undefined;
    submission.status = SubmissionStatus.PENDING;
    submission.submittedAt = new Date();
    submission.updatedAt = new Date();

    // Record the attempt when the submission targets a challenge.
    this.recordChallengeAttempt(submission.taskId, submission.userId);

    return submission;
  }

  // ---------------------------------------------------------------------------
  // Attempt limit helpers
  // ---------------------------------------------------------------------------

  /**
   * Check whether the given task is a known challenge. If so, verify that
   * the learner has not exhausted their allowed attempts.
   *
   * This method treats any taskId that starts with "challenge-" as a challenge
   * task, which aligns with the convention used in the `ChallengesService`.
   *
   * @throws BadRequestException when the attempt limit has been exceeded.
   */
  private verifyChallengeAttemptLimit(taskId: string, learnerId: string): void {
    if (!this.isChallengeTask(taskId)) return;

    const info = this.challengesService.checkAttemptLimit(taskId, learnerId);
    if (!info.allowed) {
      this.monitoringService.recordDomainEvent(
        'attempt_limit_exceeded',
        'submissions',
      );
      throw new BadRequestException({
        error: 'ATTEMPT_LIMIT_EXCEEDED',
        message: `Maximum attempts (${info.max}) exhausted for challenge "${info.challengeId}"`,
        ...info,
      });
    }
  }

  /**
   * Record an attempt for the learner on the challenge task, if applicable.
   *
   * This is called after `verifyChallengeAttemptLimit` has already confirmed
   * the user is within their allowed limit, so `recordAttempt` is guaranteed
   * to succeed. No try/catch is needed.
   */
  private recordChallengeAttempt(taskId: string, learnerId: string): void {
    if (!this.isChallengeTask(taskId)) return;

    this.challengesService.recordAttempt(taskId, learnerId);
    this.monitoringService.recordDomainEvent('challenge_attempt_recorded', 'submissions');
  }

  /**
   * Decide whether a taskId references a challenge.
   *
   * This heuristic checks for the `challenge-` prefix convention.
   *
   * @todo Replace this heuristic with a proper challenge to task lookup when a
   *       challenge entity or registry is available (e.g. a database table
   *       that maps challenge IDs to task IDs).
   */
  private isChallengeTask(taskId: string): boolean {
    return taskId?.toLowerCase().startsWith('challenge-');
  }
}
