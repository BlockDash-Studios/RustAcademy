import {
  AiProviderError,
  AiProviderErrorCode,
  AiRetryPolicy,
  DEFAULT_AI_RETRY_POLICY,
} from '../interfaces/ai-provider.interface';

export type SleepFn = (ms: number) => Promise<void>;

const defaultSleep: SleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Classify an unknown thrown value into an {@link AiProviderError}.
 *
 * BA-078: transient failures (HTTP 429, 5xx, or network-level errors) are
 * marked retryable; everything else (4xx, malformed payloads, credential
 * issues) is not. The returned error message never includes raw vendor
 * payloads or credentials.
 */
export function classifyProviderError(
  err: unknown,
  provider: string,
): AiProviderError {
  if (err instanceof AiProviderError) {
    return err;
  }

  // Axios-style errors carry an optional HTTP response.
  const axiosLike = err as {
    response?: { status?: number; data?: unknown };
    request?: unknown;
    message?: string;
  };

  if (axiosLike?.response) {
    const status = axiosLike.response.status;
    if (status === 429) {
      return new AiProviderError(
        AiProviderErrorCode.RATE_LIMITED,
        `${provider} provider rate limited the request (HTTP 429)`,
        { status, retryable: true },
      );
    }
    if (status !== undefined && status >= 500) {
      return new AiProviderError(
        AiProviderErrorCode.UPSTREAM_ERROR,
        `${provider} provider returned an upstream error (HTTP ${status})`,
        { status, retryable: true },
      );
    }
    // 4xx responses are configuration/request errors — do not retry.
    return new AiProviderError(
      AiProviderErrorCode.UPSTREAM_ERROR,
      `${provider} provider rejected the request (HTTP ${status ?? 'unknown'})`,
      { status, retryable: false },
    );
  }

  // No HTTP response: the request never reached the provider (DNS, TLS,
  // connection reset, …). These are transient and worth retrying.
  if (axiosLike?.request !== undefined || axiosLike?.message) {
    return new AiProviderError(
      AiProviderErrorCode.UPSTREAM_ERROR,
      `${provider} provider is unreachable (network error)`,
      { retryable: true },
    );
  }

  return new AiProviderError(
    AiProviderErrorCode.UPSTREAM_ERROR,
    `${provider} provider call failed`,
    { retryable: false },
  );
}

/**
 * Compute the backoff delay for attempt `attempt` (1-based), with full
 * jitter so concurrent retries don't stampede the vendor.
 */
export function backoffDelay(
  attempt: number,
  policy: AiRetryPolicy = DEFAULT_AI_RETRY_POLICY,
): number {
  const exponential = policy.baseDelayMs * 2 ** (attempt - 1);
  const capped = Math.min(exponential, policy.maxDelayMs);
  // Full jitter: random value in [0, capped) keeps retries spread out.
  return Math.floor(Math.random() * capped);
}

/**
 * Run `fn` with a bounded retry policy (BA-078).
 *
 * - Only retryable failures ({@link AiProviderError.retryable}) are retried.
 * - The number of attempts is capped by `policy.maxAttempts`.
 * - Delay between attempts uses exponential backoff with jitter, capped at
 *   `policy.maxDelayMs`.
 * - The final error is re-thrown with the consumed attempt count attached;
 *   its message stays sanitized (no provider internals).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  policy: AiRetryPolicy = DEFAULT_AI_RETRY_POLICY,
  sleep: SleepFn = defaultSleep,
  provider: string = 'AI',
): Promise<T> {
  let attempt = 0;

  // Validate the policy so misconfiguration fails fast instead of looping.
  const maxAttempts = Math.max(0, Math.floor(policy.maxAttempts));
  const baseDelayMs = Math.max(0, policy.baseDelayMs);
  const maxDelayMs = Math.max(0, policy.maxDelayMs);

  for (;;) {
    try {
      return await fn();
    } catch (err) {
      const error = classifyProviderError(err, provider);
      const canRetry = error.retryable && attempt < maxAttempts;
      if (!canRetry) {
        throw new AiProviderError(error.code, error.message, {
          status: error.status,
          retryable: error.retryable,
          attempts: error.attempts ?? attempt,
        });
      }
      attempt += 1;
      const delay = backoffDelay(attempt, {
        maxAttempts,
        baseDelayMs,
        maxDelayMs,
      });
      await sleep(delay);
    }
  }
}
