/**
 * Query timeout utilities for graceful degradation under load.
 *
 * These utilities ensure that slow queries fail fast with helpful error codes
 * rather than hanging indefinitely or blocking the dashboard.
 */

export interface QueryTimeoutOptions {
  /** Query timeout in milliseconds. Default: 5000ms (5s) */
  timeoutMs?: number;
  /** Whether to return partial results on timeout. Default: true for pagination */
  allowPartialResults?: boolean;
  /** Fallback limit if timeout occurs (should be < requested limit) */
  fallbackLimit?: number;
}

export class QueryTimeoutError extends Error {
  constructor(
    message: string,
    public readonly originalError?: Error,
  ) {
    super(message);
    this.name = 'QueryTimeoutError';
  }
}

export class PartialResultsError extends Error {
  constructor(
    message: string,
    public readonly resultsSoFar: any[] = [],
  ) {
    super(message);
    this.name = 'PartialResultsError';
  }
}

/**
 * Wrap a query promise with a timeout.
 *
 * @param queryPromise - The database query promise
 * @param options - Timeout configuration
 * @returns Promise that resolves to query results or rejects with QueryTimeoutError on timeout
 *
 * @example
 * const results = await withQueryTimeout(
 *   db.select(...),
 *   { timeoutMs: 5000 }
 * );
 */
export async function withQueryTimeout<T>(
  queryPromise: Promise<T>,
  options: QueryTimeoutOptions = {},
): Promise<T> {
  const { timeoutMs = 5000 } = options;

  return Promise.race([
    queryPromise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new QueryTimeoutError(
              `Query exceeded timeout of ${timeoutMs}ms. Consider using cursor pagination or narrower filters.`,
            ),
          ),
        timeoutMs,
      ),
    ),
  ]);
}

/**
 * Execute a query with exponential backoff retry logic.
 *
 * Useful for transient timeouts or connection errors.
 *
 * @param queryFn - Function that returns a query promise
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @param initialDelayMs - Initial backoff delay in milliseconds (default: 100)
 *
 * @example
 * const results = await withRetry(
 *   () => db.select(...),
 *   { maxRetries: 3, initialDelayMs: 100 }
 * );
 */
export async function withRetry<T>(
  queryFn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelayMs: number = 100,
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await queryFn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on the last attempt or for non-retryable errors
      if (attempt === maxRetries) {
        break;
      }

      // Exponential backoff: delay = initialDelayMs * (2 ^ attempt)
      const delayMs = initialDelayMs * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError || new Error('Query failed after retries');
}

/**
 * Configure default query timeout for a service/module.
 *
 * This allows services to set reasonable defaults based on their SLA.
 */
export class QueryTimeoutConfig {
  static readonly DEFAULTS = {
    /** Dashboard endpoints: 5 seconds (user-facing, should be fast) */
    DASHBOARD: 5000,
    /** API endpoints: 10 seconds (public API, more lenient) */
    API: 10000,
    /** Background jobs: 30 seconds (batch processing, more time) */
    BACKGROUND_JOB: 30000,
    /** Bulk operations: 60 seconds (large exports, heavy lifting) */
    BULK_OPERATION: 60000,
  } as const;

  private static instance: QueryTimeoutConfig;
  private customTimeouts: Map<string, number> = new Map();

  private constructor() {}

  static getInstance(): QueryTimeoutConfig {
    if (!QueryTimeoutConfig.instance) {
      QueryTimeoutConfig.instance = new QueryTimeoutConfig();
    }
    return QueryTimeoutConfig.instance;
  }

  /**
   * Set a custom timeout for a specific operation.
   */
  setCustomTimeout(operationName: string, timeoutMs: number): void {
    this.customTimeouts.set(operationName, timeoutMs);
  }

  /**
   * Get the effective timeout for an operation.
   */
  getTimeout(operationName: string, defaultTimeoutMs: number): number {
    return this.customTimeouts.get(operationName) ?? defaultTimeoutMs;
  }
}

/**
 * Decorator for NestJS controller methods to add automatic timeout handling.
 *
 * @example
 * @Controller('api')
 * export class MyController {
 *   @Get('items')
 *   @QueryTimeout(5000)  // 5 second timeout
 *   async getItems() {
 *     // ... your code
 *   }
 * }
 */
export function QueryTimeout(timeoutMs: number = 5000) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      try {
        return await withQueryTimeout(originalMethod.apply(this, args), {
          timeoutMs,
        });
      } catch (error) {
        if (error instanceof QueryTimeoutError) {
          // Return a gracefully degraded response instead of throwing
          return {
            error: 'query_timeout',
            message: `Query took too long. Please use narrower filters or pagination.`,
            statusCode: 504, // Gateway Timeout
          };
        }
        throw error;
      }
    };

    return descriptor;
  };
}
