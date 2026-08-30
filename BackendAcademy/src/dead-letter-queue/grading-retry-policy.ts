export interface RetryPolicyConfig {
  maxAttempts: number;
  baseDelayMs: number;
}

export const DEFAULT_GRADING_RETRY_POLICY: RetryPolicyConfig = {
  maxAttempts: 5,
  baseDelayMs: 2000,
};

export interface DeadLetterEntry {
  jobId: string;
  attempts: number;
  lastError: string;
  context: Record<string, unknown>;
}

/** Returns true while a failed grading job should still be retried. */
export function shouldRetry(
  attempts: number,
  policy: RetryPolicyConfig = DEFAULT_GRADING_RETRY_POLICY,
): boolean {
  return attempts < policy.maxAttempts;
}

/** Builds the dead-letter record for a permanently failed grading job. */
export function toDeadLetterEntry(
  jobId: string,
  attempts: number,
  lastError: string,
  context: Record<string, unknown> = {},
): DeadLetterEntry {
  return { jobId, attempts, lastError, context };
}
