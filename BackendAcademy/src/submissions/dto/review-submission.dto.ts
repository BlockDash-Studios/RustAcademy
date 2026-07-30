import { IsIn, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { SubmissionStatus } from '../interfaces/submission-status.enum';

/**
 * Payload sent by a tutor when reviewing a submission.
 */
export class ReviewSubmissionDto {
  /**
   * The new status to assign.
   * Must be one of: approved, rejected, needs_revision.
   * Submitting `pending` is not allowed here — tutors can only move
   * submissions forward in the workflow.
   */
  @IsIn([
    SubmissionStatus.APPROVED,
    SubmissionStatus.REJECTED,
    SubmissionStatus.NEEDS_REVISION,
  ])
  status: SubmissionStatus.APPROVED | SubmissionStatus.REJECTED | SubmissionStatus.NEEDS_REVISION;

  /** Optional written feedback visible to the learner. */
  @IsOptional()
  @IsString()
  feedback?: string;

  /**
   * Optional numeric score (0–100).
   * Only meaningful for APPROVED submissions but accepted for all.
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  score?: number;
}
