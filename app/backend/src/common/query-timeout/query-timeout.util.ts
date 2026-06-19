import { Logger } from '@nestjs/common';

/**
 * Query timeout configuration with sensible defaults.
 * Each tier allows progressively longer execution times.
 */
export interface QueryTimeoutConfig {
  /** Timeout for simple single-row queries (ms). Default: 500ms */
  simple: number;
  /** Timeout for filtered list queries (ms). Default: 2000ms */
  list: number;
  /** Timeout for complex joins or aggregations (ms). Default: 5000ms */
  complex: number;
  /** Timeout for background/batch operations (ms). Default: 30000ms */
  batch: number;
}

/**
 * Default timeout thresholds optimized for dashboard responsiveness.
 */
export const DEFAULT_TIMEOUTS: QueryTimeoutConfig = {
  simple: 500,
  list: 2000,
  complex: 5000,
  batch: 30000,
};

/**
 * Error indicating a query exceeded its timeout threshold.
 */
export class QueryTimeoutError extends Error {
  constructor(
    public readonly queryType: string,
    public readonly timeoutMs: number,
    message?: string,
  ) {
    super(
      message ||
        `Query of type '${queryType}' exceeded timeout of ${timeoutMs}ms`,
    );
    this.name = 'QueryTimeoutError';
  }
}

/**
 * Result wrapper indicating whether a query succeeded or degraded.
 */
export interface QueryResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  degraded: boolean;
  executionTimeMs: number;
  timedOut: boolean;
}

/**
 * Options for executing a query with timeout handling.
 */
export interface QueryExecutionOptions {
  /** Query type for timeout selection and logging. */
  queryType: keyof QueryTimeoutConfig;
  /** Optional custom timeout override (ms). */
  timeoutMs?: number;
  /** Whether to return degraded result on timeout vs. throwing. */
  degrade: boolean;
  /** Logger instance for query metrics. */
  logger?: Logger;
  /** Optional operation name for logging. */
  operationName?: string;
}

/**
 * Wraps a Supabase query builder or promise with timeout handling.
 *
 * Features:
 * - Enforces per-query timeout thresholds (simple, list, complex, batch)
 * - Logs execution time for performance monitoring
 * - Optionally returns degraded results instead of throwing on timeout
 * - Helps detect N+1 queries and performance regressions
 *
 * @example
 * const result = await executeWithTimeout(
 *   async () => client.from('users').select().limit(20),
 *   {
 *     queryType: 'list',
 *     degrade: true,
 *     operationName: 'list_users_dashboard',
 *   },
 *   DEFAULT_TIMEOUTS,
 * );
 *
 * if (!result.success) {
 *   logger.warn(`Query failed: ${result.error?.message}`);
 *   // Return cached result or empty data
 * } else if (result.degraded) {
 *   logger.info(`Query degraded (timed out): ${result.executionTimeMs}ms`);
 * }
 */
export async function executeWithTimeout<T>(
  queryFn: () => Promise<T>,
  options: QueryExecutionOptions,
  config: QueryTimeoutConfig = DEFAULT_TIMEOUTS,
): Promise<QueryResult<T>> {
  const startTime = Date.now();
  const timeoutMs = options.timeoutMs ?? config[options.queryType];
  const logger = options.logger || new Logger('QueryTimeout');

  let timeoutHandle: NodeJS.Timeout | null = null;
  let timedOut = false;

  try {
    // Create a promise that rejects after timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        const err = new QueryTimeoutError(
          options.queryType,
          timeoutMs,
          `${options.operationName || 'Query'} timed out after ${timeoutMs}ms`,
        );
        reject(err);
      }, timeoutMs);
    });

    // Race the actual query against the timeout
    const data = await Promise.race([queryFn(), timeoutPromise]);

    const executionTimeMs = Date.now() - startTime;
    clearTimeout(timeoutHandle!);

    logger.debug(
      `Query succeeded [${options.queryType}] ${options.operationName || ''}: ${executionTimeMs}ms (threshold: ${timeoutMs}ms)`,
    );

    return {
      success: true,
      data,
      degraded: false,
      executionTimeMs,
      timedOut: false,
    };
  } catch (error) {
    const executionTimeMs = Date.now() - startTime;
    clearTimeout(timeoutHandle!);

    if (error instanceof QueryTimeoutError) {
      logger.warn(
        `Query timeout [${options.queryType}] ${options.operationName || ''}: ${executionTimeMs}ms (threshold: ${timeoutMs}ms)`,
      );

      if (options.degrade) {
        return {
          success: false,
          error,
          degraded: true,
          executionTimeMs,
          timedOut: true,
        };
      }
    }

    logger.error(
      `Query failed [${options.queryType}] ${options.operationName || ''}: ${error instanceof Error ? error.message : String(error)}`,
    );

    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
      degraded: false,
      executionTimeMs,
      timedOut: error instanceof QueryTimeoutError,
    };
  }
}

/**
 * Batch execute multiple queries with timeout handling.
 * Returns results in order, with failures captured per query.
 *
 * @example
 * const results = await executeBatchWithTimeout(
 *   [
 *     () => client.from('events').select().limit(100),
 *     () => client.from('users').select().limit(50),
 *   ],
 *   'list',
 *   { degrade: true },
 *   config,
 * );
 */
export async function executeBatchWithTimeout<T>(
  queryFns: Array<() => Promise<T>>,
  queryType: keyof QueryTimeoutConfig,
  options: Omit<QueryExecutionOptions, 'queryType'>,
  config?: QueryTimeoutConfig,
): Promise<QueryResult<T>[]> {
  return Promise.all(
    queryFns.map((fn, idx) =>
      executeWithTimeout(fn, { ...options, queryType, operationName: `batch_query_${idx}` }, config),
    ),
  );
}
