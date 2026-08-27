export type GradingResultStatus = 'PENDING' | 'FINAL' | 'SUPERSEDED';

export interface ExistingGradingResult {
  status: GradingResultStatus;
  version: number;
}

export class DuplicateFinalResultError extends Error {
  constructor(submissionId: string) {
    super(`Final grading result already exists for submission ${submissionId}`);
  }
}

/**
 * Rejects a new final grading result if one already exists, preventing
 * conflicting outcomes from repeated callbacks or multiple graders.
 */
export function assertCanFinalize(
  submissionId: string,
  existing: ExistingGradingResult | undefined,
): void {
  if (existing?.status === 'FINAL') {
    throw new DuplicateFinalResultError(submissionId);
  }
}
