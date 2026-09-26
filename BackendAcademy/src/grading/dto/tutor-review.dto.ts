import { IsIn, IsInt, IsNotEmpty, IsString, Max, Min, ValidateIf } from 'class-validator';
import { TutorDecision } from '../grading.types';

export class TutorReviewDto {
  /**
   * The reviewing tutor's id. There is no auth guard in BackendAcademy yet, so
   * identity is carried on the request body (as elsewhere in this service); it
   * is still recorded verbatim on the override for auditability.
   */
  @IsString()
  @IsNotEmpty()
  tutorId: string;

  @IsIn(['confirm', 'override'])
  decision: TutorDecision;

  /** Required for an override: the tutor's replacement score. */
  @ValidateIf((dto: TutorReviewDto) => dto.decision === 'override')
  @IsInt()
  @Min(0)
  @Max(100)
  score?: number;

  /** Required for an override: why the AI pre-score was changed. */
  @ValidateIf((dto: TutorReviewDto) => dto.decision === 'override')
  @IsString()
  @IsNotEmpty()
  reason?: string;
}
