import { GradingResultStatus } from '../interfaces/grading-result-status.enum';
import { RubricEntry } from '../interfaces/grading-result.interface';

/**
 * DTO for saving a grading result against a submission.
 *
 * Used by instructors/graders when submitting scores and feedback
 * via POST /submissions/:id/grade.
 */
export class SaveGradingResultDto {
  /** ID of the instructor/grader submitting the result */
  graderId: string;

  /** Overall outcome of the grade */
  status: GradingResultStatus;

  /** Numeric score achieved (must be 0 ≤ score ≤ maxScore) */
  score: number;

  /** Maximum achievable score for this task */
  maxScore: number;

  /** Student-facing written feedback */
  feedback: string;

  /** Private notes visible only to instructors (optional) */
  privateNotes?: string;

  /** Per-criterion rubric breakdown (optional) */
  rubric?: RubricEntry[];
}
