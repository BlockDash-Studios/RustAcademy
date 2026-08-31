/**
 * Provider Resilience Utilities — Issue #674
 *
 * Provides timeout wrapping, exponential-backoff retry, and a simple
 * circuit-breaker for all notification providers so that a slow or
 * failing external service cannot block batches or exhaust worker threads.
 */

// ── Timeout ──────────────────────────────────────────────────────────────────

/**
 * Wraps a promise in a hard-timeout race.
 *
 * @param fn      - A factory that returns the promise to execute.
 * @param ms      - Timeout in milliseconds.
 * @param label   - Descriptive label used in the rejection message.
 * @returns The resolved value of `fn`, or throws a `TimeoutError`.
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  ms: number,
  label = 'operation',
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new TimeoutError(`${label} timed out after ${ms} ms`)),
      ms,
    );

    fn().then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/** Thrown when a provider call exceeds its configured time limit. */
export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

// ── Retry classification ─────────────────────────────────────────────────────

/**
 * Determines whether a given error should be retried.
 *
 * Transient failures (network errors, 429 / 5xx HTTP status) are retried.
 * Permanent failures (4xx except 429, `TimeoutError`) are NOT retried
 * because retrying will not help.
 */
export function isRetryable(err: unknown): boolean {
  if (err instanceof TimeoutError) return false;
  if (err instanceof HttpStatusError) {
    // 429 Too Many Requests is retryable (rate-limited, back off and retry)
    if (err.status === 429) return true;
    // 4xx (except 429) are permanent client errors — no point retrying
    if (err.status >= 400 && err.status < 500) return false;
    // 5xx server errors are transient
    return true;
  }
  // Network-level errors (no response) are transient
  return true;
}

/** Thrown to carry an HTTP status code through the retry logic. */
export class HttpStatusError extends Error {
  constructor(
    public readonly status: number,
    message?: string,
  ) {
    super(message ?? `HTTP ${status}`);
    this.name = 'HttpStatusError';
  }
}

// ── Exponential back-off retry ────────────────────────────────────────────────

export interface RetryOptions {
  /** Maximum number of attempts (first call + retries). Default: 3 */
  maxAttempts?: number;
  /** Initial back-off delay in milliseconds. Default: 200 */
  initialDelayMs?: number;
  /** Multiplier applied to the delay after each failure. Default: 2 */
  backoffFactor?: number;
  /** Upper bound on the calculated delay. Default: 5 000 */
  maxDelayMs?: number;
}

const RETRY_DEFAULTS: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelayMs: 200,
  backoffFactor: 2,
  maxDelayMs: 5_000,
};

/**
 * Retries `fn` with exponential back-off when the thrown error is
 * classified as transient by `isRetryable`.
 *
 * Non-retryable errors are re-thrown immediately.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const { maxAttempts, initialDelayMs, backoffFactor, maxDelayMs } = {
    ...RETRY_DEFAULTS,
    ...options,
  };

  let delay = initialDelayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const last = attempt === maxAttempts;
      if (last || !isRetryable(err)) throw err;

      await sleep(delay);
      delay = Math.min(delay * backoffFactor, maxDelayMs);
    }
  }

  // TypeScript path — never reached
  throw new Error('Retry loop exhausted without result or error');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Circuit breaker ───────────────────────────────────────────────────────────

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  /** Number of consecutive failures before opening the circuit. Default: 5 */
  failureThreshold?: number;
  /** How long (ms) the circuit stays OPEN before allowing a probe. Default: 30 000 */
  recoveryTimeoutMs?: number;
  /** Maximum calls permitted in HALF_OPEN before deciding. Default: 1 */
  halfOpenProbes?: number;
}

const CB_DEFAULTS: Required<CircuitBreakerOptions> = {
  failureThreshold: 5,
  recoveryTimeoutMs: 30_000,
  halfOpenProbes: 1,
};

export interface CircuitBreakerMetrics {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureAt?: Date;
  openedAt?: Date;
}

/**
 * A simple three-state circuit breaker.
 *
 * States:
 *  - CLOSED  — normal operation; failures are counted.
 *  - OPEN    — calls are rejected immediately; entered when the failure
 *              threshold is reached.
 *  - HALF_OPEN — a limited probe is allowed after `recoveryTimeoutMs`;
 *                a success closes the circuit, any failure reopens it.
 */
export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures = 0;
  private successes = 0;
  private halfOpenProbeCount = 0;
  private openedAt?: Date;
  private lastFailureAt?: Date;

  private readonly opts: Required<CircuitBreakerOptions>;

  constructor(
    public readonly name: string,
    options: CircuitBreakerOptions = {},
  ) {
    this.opts = { ...CB_DEFAULTS, ...options };
  }

  /** Whether the circuit breaker is currently preventing calls. */
  get isOpen(): boolean {
    return this.state === 'OPEN' || this.state === 'HALF_OPEN';
  }

  /** Current observable metrics snapshot. */
  get metrics(): CircuitBreakerMetrics {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureAt: this.lastFailureAt,
      openedAt: this.openedAt,
    };
  }

  /**
   * Executes `fn` through the circuit breaker.
   *
   * - OPEN:      throws `CircuitOpenError` immediately.
   * - HALF_OPEN: allows a limited probe call; records the outcome.
   * - CLOSED:    executes normally; transitions to OPEN on threshold breach.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      const elapsed = Date.now() - (this.openedAt?.getTime() ?? 0);
      if (elapsed >= this.opts.recoveryTimeoutMs) {
        this.transitionTo('HALF_OPEN');
      } else {
        throw new CircuitOpenError(
          `Circuit "${this.name}" is OPEN (${Math.round((this.opts.recoveryTimeoutMs - elapsed) / 1000)} s until probe)`,
        );
      }
    }

    if (
      this.state === 'HALF_OPEN' &&
      this.halfOpenProbeCount >= this.opts.halfOpenProbes
    ) {
      throw new CircuitOpenError(
        `Circuit "${this.name}" is HALF_OPEN — probe already in-flight`,
      );
    }

    if (this.state === 'HALF_OPEN') {
      this.halfOpenProbeCount++;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  /** Resets the circuit to CLOSED (e.g., for testing). */
  reset(): void {
    this.transitionTo('CLOSED');
    this.failures = 0;
    this.successes = 0;
    this.halfOpenProbeCount = 0;
    this.openedAt = undefined;
    this.lastFailureAt = undefined;
  }

  private onSuccess(): void {
    this.successes++;
    if (this.state === 'HALF_OPEN') {
      this.transitionTo('CLOSED');
      this.failures = 0;
      this.halfOpenProbeCount = 0;
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureAt = new Date();

    if (this.state === 'HALF_OPEN') {
      // Probe failed — reopen immediately
      this.transitionTo('OPEN');
      this.halfOpenProbeCount = 0;
      return;
    }

    if (this.failures >= this.opts.failureThreshold) {
      this.transitionTo('OPEN');
    }
  }

  private transitionTo(next: CircuitState): void {
    this.state = next;
    if (next === 'OPEN') {
      this.openedAt = new Date();
    }
  }
}

/** Thrown when a call is rejected because the circuit is OPEN. */
export class CircuitOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitOpenError';
  }
}

// ── Combined helper ───────────────────────────────────────────────────────────

/**
 * Composes timeout, retry, and circuit-breaker into a single call.
 *
 * Execution order:
 *   circuit breaker → retry loop → timeout per attempt
 *
 * This ensures:
 * - No call is made when the circuit is open.
 * - Each individual attempt has a bounded duration.
 * - Transient failures trigger automatic back-off retries.
 * - The circuit opens after too many consecutive failures.
 */
export async function resilientCall<T>(
  fn: () => Promise<T>,
  breaker: CircuitBreaker,
  timeoutMs: number,
  retryOpts: RetryOptions = {},
  label = 'provider call',
): Promise<T> {
  return breaker.execute(() =>
    withRetry(
      () => withTimeout(fn, timeoutMs, label),
      retryOpts,
    ),
  );
}
