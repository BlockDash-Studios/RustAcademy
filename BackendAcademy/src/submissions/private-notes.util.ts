export interface GradingResultInternal {
  submissionId: string;
  status: string;
  score?: number;
  feedback?: string;
  privateNotes?: string;
}

export interface LearnerFacingGradingResult {
  submissionId: string;
  status: string;
  score?: number;
  feedback?: string;
}

/**
 * Strips grader-only fields (e.g. privateNotes) before a result is
 * serialized into a learner-facing response DTO.
 */
export function toLearnerFacingResult(
  result: GradingResultInternal,
): LearnerFacingGradingResult {
  const { submissionId, status, score, feedback } = result;
  return { submissionId, status, score, feedback };
}
