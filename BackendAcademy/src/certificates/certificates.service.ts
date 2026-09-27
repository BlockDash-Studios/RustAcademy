import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CertificateCriteria,
  CertificateEligibilityCheck,
  DEFAULT_CERTIFICATE_MIN_SCORE,
  RecordTaskResultInput,
  RegisterCertificateCriteriaInput,
  TaskResult,
} from './certificates.types';

/**
 * Certification eligibility checks (BE-042).
 *
 * Computes whether a learner qualifies for a `certificate_nft` mint: every task
 * the course requires must have a recorded final score, and every one of those
 * scores must meet the course's minimum. `checkEligibility` is the read path the
 * certificate minting job calls before it mints; `recordTaskResult` is how the
 * grading pipeline feeds final scores in.
 *
 * In-memory like the other BackendAcademy services, so the storage can be
 * swapped for a repository later without changing callers. A task may be
 * attempted more than once: only the learner's best score is kept, so a retake
 * can lift a task above the bar but never lower the certificate.
 */
@Injectable()
export class CertificatesService {
  private readonly courses = new Map<string, CertificateCriteria>();
  /** `userId|courseId` → `taskId` → the learner's best task result. */
  private readonly results = new Map<string, Map<string, TaskResult>>();

  // ── Course criteria ───────────────────────────────────────────────────────

  /** Registers what a course's certificate requires: tasks and minimum score. */
  registerCourse(input: RegisterCertificateCriteriaInput): CertificateCriteria {
    if (this.courses.has(input.courseId)) {
      throw new ConflictException(`Certificate criteria for "${input.courseId}" already exist`);
    }

    const taskIds = [...new Set(input.taskIds ?? [])];
    if (taskIds.length === 0) {
      throw new BadRequestException({
        error: `Course "${input.courseId}" needs at least one task to certify.`,
        code: 'INSUFFICIENT_CERTIFICATE_CRITERIA',
      });
    }

    const minScore = input.minScore ?? DEFAULT_CERTIFICATE_MIN_SCORE;
    this.assertScore(minScore, 'minScore');

    const criteria: CertificateCriteria = { courseId: input.courseId, taskIds, minScore };
    this.courses.set(criteria.courseId, criteria);
    return { ...criteria, taskIds: [...criteria.taskIds] };
  }

  getCourse(courseId: string): CertificateCriteria {
    const criteria = this.courses.get(courseId);
    if (!criteria) {
      throw new NotFoundException({
        error: `No certificate criteria registered for course "${courseId}".`,
        code: 'CERTIFICATE_CRITERIA_NOT_FOUND',
      });
    }
    return { ...criteria, taskIds: [...criteria.taskIds] };
  }

  listCourses(): CertificateCriteria[] {
    return [...this.courses.values()].map((criteria) => ({
      ...criteria,
      taskIds: [...criteria.taskIds],
    }));
  }

  // ── Task results ──────────────────────────────────────────────────────────

  /**
   * Records a learner's final score for one required task. The best score wins,
   * so the call is safe to replay when a submission is re-graded.
   */
  recordTaskResult(input: RecordTaskResultInput): TaskResult {
    const criteria = this.getCourse(input.courseId);
    if (!criteria.taskIds.includes(input.taskId)) {
      throw new NotFoundException({
        error: `Task "${input.taskId}" is not required by course "${input.courseId}".`,
        code: 'CERTIFICATE_TASK_NOT_REQUIRED',
      });
    }

    this.assertScore(input.score, 'score');

    const key = this.resultKey(input.userId, input.courseId);
    const byTask = this.results.get(key) ?? new Map<string, TaskResult>();
    const existing = byTask.get(input.taskId);
    if (existing && existing.score >= input.score) return { ...existing };

    const result: TaskResult = {
      userId: input.userId,
      courseId: input.courseId,
      taskId: input.taskId,
      score: input.score,
      passed: input.score >= criteria.minScore,
      recordedAt: new Date().toISOString(),
    };
    byTask.set(input.taskId, result);
    this.results.set(key, byTask);
    return { ...result };
  }

  /** The learner's recorded results for a course, keyed back to the criteria. */
  getTaskResults(userId: string, courseId: string): TaskResult[] {
    const criteria = this.getCourse(courseId);
    const byTask = this.results.get(this.resultKey(userId, courseId));
    return criteria.taskIds
      .map((taskId) => byTask?.get(taskId))
      .filter((result): result is TaskResult => Boolean(result))
      .map((result) => ({ ...result }));
  }

  // ── Eligibility ───────────────────────────────────────────────────────────

  /**
   * The minting job's eligibility check. Eligible only when every required task
   * has a score at or above the course minimum.
   */
  checkEligibility(userId: string, courseId: string): CertificateEligibilityCheck {
    const criteria = this.getCourse(courseId);
    const byTask = this.results.get(this.resultKey(userId, courseId)) ?? new Map<string, TaskResult>();

    const tasks = criteria.taskIds
      .map((taskId) => byTask.get(taskId))
      .filter((result): result is TaskResult => Boolean(result))
      .map((result) => ({ ...result }));

    const missing = criteria.taskIds.filter((taskId) => !byTask.has(taskId));
    const failed = tasks.filter((result) => !result.passed).map((result) => result.taskId);

    const reasons: string[] = [];
    if (missing.length > 0) {
      reasons.push(`No graded result for task(s): ${missing.join(', ')}.`);
    }
    if (failed.length > 0) {
      reasons.push(
        `Task(s) scored below the minimum of ${criteria.minScore}: ${failed.join(', ')}.`,
      );
    }

    const eligible = reasons.length === 0;
    const averageScore =
      tasks.length === 0
        ? null
        : Math.round(tasks.reduce((total, result) => total + result.score, 0) / tasks.length);

    return {
      userId,
      courseId,
      eligible,
      status: eligible ? 'eligible' : 'ineligible',
      minScore: criteria.minScore,
      tasksRequired: criteria.taskIds.length,
      tasksPassed: tasks.filter((result) => result.passed).length,
      averageScore,
      finalScore: eligible ? averageScore : null,
      tasks,
      reasons,
      checkedAt: new Date().toISOString(),
    };
  }

  /**
   * Every learner with a recorded result for the course, filtered to those the
   * job may mint. This is the batch form of `checkEligibility`.
   */
  listEligibleLearners(courseId: string): CertificateEligibilityCheck[] {
    this.getCourse(courseId);
    const suffix = `|${courseId}`;
    const userIds = [...this.results.keys()]
      .filter((key) => key.endsWith(suffix))
      .map((key) => key.slice(0, -suffix.length));

    return userIds
      .map((userId) => this.checkEligibility(userId, courseId))
      .filter((check) => check.eligible);
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private assertScore(score: number, field: string): void {
    if (!Number.isInteger(score) || score < 0 || score > 100) {
      throw new BadRequestException({
        error: `"${field}" must be an integer between 0 and 100.`,
        code: 'INVALID_CERTIFICATE_SCORE',
      });
    }
  }

  private resultKey(userId: string, courseId: string): string {
    return `${userId}|${courseId}`;
  }
}
