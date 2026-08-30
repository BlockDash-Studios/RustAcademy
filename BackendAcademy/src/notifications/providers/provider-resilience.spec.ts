/**
 * Tests for provider resilience utilities — Issue #674
 *
 * Covers timeout, retry classification, exponential-backoff retry,
 * circuit-breaker state machine, and the combined `resilientCall` helper.
 */
import {
  withTimeout,
  TimeoutError,
  isRetryable,
  HttpStatusError,
  withRetry,
  CircuitBreaker,
  CircuitOpenError,
  resilientCall,
} from './provider-resilience';

// ── helpers ──────────────────────────────────────────────────────────────────

/** Resolves after `ms` milliseconds. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── withTimeout ───────────────────────────────────────────────────────────────

describe('withTimeout', () => {
  it('resolves when the promise completes in time', async () => {
    const result = await withTimeout(() => Promise.resolve(42), 500);
    expect(result).toBe(42);
  });

  it('throws TimeoutError when the promise exceeds the limit', async () => {
    await expect(
      withTimeout(() => delay(200).then(() => 'late'), 50, 'test-op'),
    ).rejects.toThrow(TimeoutError);
  });

  it('includes the label in the TimeoutError message', async () => {
    await expect(
      withTimeout(() => delay(200), 10, 'my-label'),
    ).rejects.toThrow(/my-label timed out/);
  });

  it('re-throws non-timeout errors from the inner promise', async () => {
    await expect(
      withTimeout(() => Promise.reject(new Error('inner')), 500),
    ).rejects.toThrow('inner');
  });
});

// ── isRetryable ───────────────────────────────────────────────────────────────

describe('isRetryable', () => {
  it('returns false for TimeoutError', () => {
    expect(isRetryable(new TimeoutError('timed out'))).toBe(false);
  });

  it('returns false for 400 Bad Request', () => {
    expect(isRetryable(new HttpStatusError(400))).toBe(false);
  });

  it('returns false for 404 Not Found', () => {
    expect(isRetryable(new HttpStatusError(404))).toBe(false);
  });

  it('returns true for 429 Too Many Requests', () => {
    expect(isRetryable(new HttpStatusError(429))).toBe(true);
  });

  it('returns true for 500 Internal Server Error', () => {
    expect(isRetryable(new HttpStatusError(500))).toBe(true);
  });

  it('returns true for generic network Error', () => {
    expect(isRetryable(new Error('ECONNRESET'))).toBe(true);
  });
});

// ── withRetry ─────────────────────────────────────────────────────────────────

describe('withRetry', () => {
  it('succeeds on the first attempt without retrying', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, { maxAttempts: 3 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on transient error and succeeds on second attempt', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error('network blip'))
      .mockResolvedValue('ok');

    const result = await withRetry(fn, {
      maxAttempts: 3,
      initialDelayMs: 0,
    });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('re-throws after maxAttempts transient failures', async () => {
    const err = new Error('persistent failure');
    const fn = jest.fn().mockRejectedValue(err);

    await expect(
      withRetry(fn, { maxAttempts: 3, initialDelayMs: 0 }),
    ).rejects.toThrow('persistent failure');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does NOT retry non-retryable errors (e.g. 404)', async () => {
    const err = new HttpStatusError(404);
    const fn = jest.fn().mockRejectedValue(err);

    await expect(
      withRetry(fn, { maxAttempts: 3, initialDelayMs: 0 }),
    ).rejects.toBeInstanceOf(HttpStatusError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry TimeoutError', async () => {
    const err = new TimeoutError('timed out');
    const fn = jest.fn().mockRejectedValue(err);

    await expect(
      withRetry(fn, { maxAttempts: 3, initialDelayMs: 0 }),
    ).rejects.toBeInstanceOf(TimeoutError);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

// ── CircuitBreaker ────────────────────────────────────────────────────────────

describe('CircuitBreaker', () => {
  let cb: CircuitBreaker;

  beforeEach(() => {
    cb = new CircuitBreaker('test', {
      failureThreshold: 3,
      recoveryTimeoutMs: 100, // short for tests
      halfOpenProbes: 1,
    });
  });

  it('starts in CLOSED state', () => {
    expect(cb.metrics.state).toBe('CLOSED');
    expect(cb.isOpen).toBe(false);
  });

  it('stays CLOSED after fewer failures than the threshold', async () => {
    const fail = jest.fn().mockRejectedValue(new Error('err'));
    for (let i = 0; i < 2; i++) {
      await cb.execute(fail).catch(() => undefined);
    }
    expect(cb.metrics.state).toBe('CLOSED');
  });

  it('opens after reaching the failure threshold', async () => {
    const fail = jest.fn().mockRejectedValue(new Error('err'));
    for (let i = 0; i < 3; i++) {
      await cb.execute(fail).catch(() => undefined);
    }
    expect(cb.metrics.state).toBe('OPEN');
    expect(cb.isOpen).toBe(true);
  });

  it('rejects immediately with CircuitOpenError when OPEN', async () => {
    const fail = jest.fn().mockRejectedValue(new Error('err'));
    for (let i = 0; i < 3; i++) {
      await cb.execute(fail).catch(() => undefined);
    }

    const directCall = jest.fn().mockResolvedValue('should not run');
    await expect(cb.execute(directCall)).rejects.toBeInstanceOf(CircuitOpenError);
    expect(directCall).not.toHaveBeenCalled();
  });

  it('transitions to HALF_OPEN after the recovery timeout', async () => {
    const fail = jest.fn().mockRejectedValue(new Error('err'));
    for (let i = 0; i < 3; i++) {
      await cb.execute(fail).catch(() => undefined);
    }
    expect(cb.metrics.state).toBe('OPEN');

    // Wait for recovery timeout
    await delay(150);

    // Execute a probe — this transitions to HALF_OPEN then lets the probe through
    const success = jest.fn().mockResolvedValue('probe ok');
    await cb.execute(success);
    expect(cb.metrics.state).toBe('CLOSED');
  });

  it('closes after a successful probe in HALF_OPEN', async () => {
    const fail = jest.fn().mockRejectedValue(new Error('err'));
    for (let i = 0; i < 3; i++) {
      await cb.execute(fail).catch(() => undefined);
    }
    await delay(150);

    await cb.execute(jest.fn().mockResolvedValue('ok'));
    expect(cb.metrics.state).toBe('CLOSED');
    expect(cb.metrics.failures).toBe(0);
  });

  it('re-opens when the HALF_OPEN probe fails', async () => {
    const fail = jest.fn().mockRejectedValue(new Error('err'));
    for (let i = 0; i < 3; i++) {
      await cb.execute(fail).catch(() => undefined);
    }
    await delay(150);

    await cb.execute(fail).catch(() => undefined);
    expect(cb.metrics.state).toBe('OPEN');
  });

  it('records success and failure counts', async () => {
    const ok = jest.fn().mockResolvedValue(1);
    const bad = jest.fn().mockRejectedValue(new Error('err'));

    await cb.execute(ok);
    await cb.execute(ok);
    await cb.execute(bad).catch(() => undefined);

    expect(cb.metrics.successes).toBe(2);
    expect(cb.metrics.failures).toBe(1);
  });

  it('reset() returns the circuit to CLOSED with zeroed counters', async () => {
    const fail = jest.fn().mockRejectedValue(new Error('err'));
    for (let i = 0; i < 3; i++) {
      await cb.execute(fail).catch(() => undefined);
    }
    expect(cb.metrics.state).toBe('OPEN');

    cb.reset();
    expect(cb.metrics.state).toBe('CLOSED');
    expect(cb.metrics.failures).toBe(0);
    expect(cb.metrics.successes).toBe(0);
  });
});

// ── resilientCall ─────────────────────────────────────────────────────────────

describe('resilientCall', () => {
  it('executes and returns the result when everything is healthy', async () => {
    const cb = new CircuitBreaker('r-test', { failureThreshold: 5 });
    const fn = jest.fn().mockResolvedValue('result');

    const value = await resilientCall(fn, cb, 1_000, {}, 'test');
    expect(value).toBe('result');
  });

  it('retries on transient errors then succeeds', async () => {
    const cb = new CircuitBreaker('r-test', { failureThreshold: 10 });
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new HttpStatusError(503))
      .mockResolvedValue('recovered');

    const result = await resilientCall(fn, cb, 1_000, { initialDelayMs: 0 });
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws CircuitOpenError when the circuit is open', async () => {
    const cb = new CircuitBreaker('r-test', {
      failureThreshold: 1,
      recoveryTimeoutMs: 60_000,
    });
    const fail = jest.fn().mockRejectedValue(new Error('err'));

    // Trip the circuit
    await cb.execute(fail).catch(() => undefined);
    expect(cb.metrics.state).toBe('OPEN');

    const fn = jest.fn().mockResolvedValue('should not run');
    await expect(
      resilientCall(fn, cb, 1_000, { maxAttempts: 1 }),
    ).rejects.toBeInstanceOf(CircuitOpenError);
    expect(fn).not.toHaveBeenCalled();
  });
});
