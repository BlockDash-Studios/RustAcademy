import { GradingResultStatus } from '../interfaces/grading-result-status.enum';
import { IGradingResult, RubricEntry } from '../interfaces/grading-result.interface';

/**
 * Represents a persisted grading result for a submission.
 *
 * One submission can have multiple grading results over time (e.g. re-grades
 * after revision), but only one result is considered "current" — the most
 * recently created one.  The repository exposes `findLatestBySubmissionId`
 * for this purpose.
 */
export class GradingResultEntity implements IGradingResult {
  id: string;

  /** The submission this result belongs to */
  submissionId: string;

  /** ID of the instructor/grader who produced this result */
  graderId: string;

  /** Overall pass/fail/partial outcome */
  status: GradingResultStatus;

  /** Numeric score awarded (0–maxScore) */
  score: number;

  /** Maximum achievable score for the task */
  maxScore: number;

  /** Student-facing feedback */
  feedback: string;

  /** Internal notes only visible to instructors */
  privateNotes?: string;

  /** Optional per-criterion rubric breakdown */
  rubric?: RubricEntry[];

  /** Timestamp when grading was performed */
  gradedAt: Date;

  createdAt: Date;
  updatedAt: Date;

  constructor(partial: Partial<GradingResultEntity>) {
    Object.assign(this, partial);
    this.status = this.status ?? GradingResultStatus.FAIL;
    this.score = this.score ?? 0;
    this.maxScore = this.maxScore ?? 100;
    this.feedback = this.feedback ?? '';
    this.gradedAt = this.gradedAt ?? new Date();
    this.createdAt = this.createdAt ?? new Date();
    this.updatedAt = this.updatedAt ?? new Date();
  }

  /** Computed percentage score (0–100), rounded to 2 decimal places */
  get percentage(): number {
    if (this.maxScore === 0) return 0;
    return Math.round((this.score / this.maxScore) * 10000) / 100;
  }

  /** Whether the student passed (status is PASS) */
  get passed(): boolean {
    return this.status === GradingResultStatus.PASS;
  }
}
