export interface ClaimableSubmission {
  submissionId: string;
  claimedBy?: string;
  claimedAt?: Date;
}

export class AlreadyClaimedError extends Error {
  constructor(submissionId: string) {
    super(`Submission ${submissionId} is already claimed`);
  }
}

/**
 * Atomically claims a submission for review. Callers must pass the
 * current record read within the same transaction/lock to avoid races.
 */
export function claimForReview(
  current: ClaimableSubmission,
  reviewerId: string,
): ClaimableSubmission {
  if (current.claimedBy && current.claimedBy !== reviewerId) {
    throw new AlreadyClaimedError(current.submissionId);
  }
  return { ...current, claimedBy: reviewerId, claimedAt: new Date() };
}
