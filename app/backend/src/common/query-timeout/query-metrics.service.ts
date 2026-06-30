import { Injectable, Logger } from '@nestjs/common';
import { QueryResult } from './query-timeout.util';

/**
 * Query metrics structure for tracking performance.
 */
export interface QueryMetrics {
  totalExecutions: number;
  totalTimeMs: number;
  timeouts: number;
  degraded: number;
  failures: number;
  minTimeMs: number;
  maxTimeMs: number;
}

/**
 * Metrics collector for query performance monitoring.
 * Tracks timeout events, slow queries, and helps identify performance regressions.
 *
 * Use this to:
 * - Monitor query performance trends
 * - Detect N+1 queries
 * - Trigger alerts on excessive timeouts
 * - Feed metrics into dashboards
 */
@Injectable()
export class QueryMetricsService {
  private readonly logger = new Logger(QueryMetricsService.name);
  private readonly metrics = new Map<string, QueryMetrics>();

  /**
   * Record a query execution result for metrics collection.
   */
  recordQuery(
    operationName: string,
    result: QueryResult<unknown>,
  ): void {
    let metrics = this.metrics.get(operationName);
    if (!metrics) {
      metrics = {
        totalExecutions: 0,
        totalTimeMs: 0,
        timeouts: 0,
        degraded: 0,
        failures: 0,
        minTimeMs: Infinity,
        maxTimeMs: 0,
      };
      this.metrics.set(operationName, metrics);
    }

    metrics.totalExecutions++;
    metrics.totalTimeMs += result.executionTimeMs;
    metrics.minTimeMs = Math.min(metrics.minTimeMs, result.executionTimeMs);
    metrics.maxTimeMs = Math.max(metrics.maxTimeMs, result.executionTimeMs);

    if (result.timedOut) {
      metrics.timeouts++;
    }
    if (result.degraded) {
      metrics.degraded++;
    }
    if (!result.success) {
      metrics.failures++;
    }

    // Log warnings if timeouts are occurring
    if (result.timedOut) {
      this.logger.warn(
        `Query timeout: ${operationName} (${result.executionTimeMs}ms)`,
      );
    }

    // Log slow queries (e.g., queries taking > 1000ms)
    if (result.executionTimeMs > 1000 && !result.timedOut) {
      this.logger.warn(
        `Slow query detected: ${operationName} (${result.executionTimeMs}ms)`,
      );
    }
  }

  /**
   * Get performance metrics for a specific operation or all operations.
   */
  getMetrics(operationName?: string): Map<string, QueryMetrics> | QueryMetrics | undefined {
    if (operationName) {
      return this.metrics.get(operationName);
    }
    return this.metrics;
  }

  /**
   * Get aggregated statistics across all queries.
   */
  getStatistics(): {
    totalQueries: number;
    totalTimeMs: number;
    averageTimeMs: number;
    totalTimeouts: number;
    timeoutRate: number;
    totalDegraded: number;
    degradedRate: number;
  } {
    let totalQueries = 0;
    let totalTimeMs = 0;
    let totalTimeouts = 0;
    let totalDegraded = 0;

    for (const m of this.metrics.values()) {
      totalQueries += m.totalExecutions;
      totalTimeMs += m.totalTimeMs;
      totalTimeouts += m.timeouts;
      totalDegraded += m.degraded;
    }

    return {
      totalQueries,
      totalTimeMs,
      averageTimeMs: totalQueries > 0 ? totalTimeMs / totalQueries : 0,
      totalTimeouts,
      timeoutRate: totalQueries > 0 ? totalTimeouts / totalQueries : 0,
      totalDegraded,
      degradedRate: totalQueries > 0 ? totalDegraded / totalQueries : 0,
    };
  }

  /**
   * Reset metrics (useful for testing or periodic resets).
   */
  reset(): void {
    this.metrics.clear();
    this.logger.debug('Query metrics reset');
  }

  /**
   * Get operations that have exceeded timeout threshold.
   * Useful for identifying problematic queries.
   */
  getProblematicQueries(minTimeouts: number = 5): Map<string, QueryMetrics> {
    const problematic = new Map<string, QueryMetrics>();
    for (const [name, m] of this.metrics.entries()) {
      if (m.timeouts >= minTimeouts || m.degraded > m.totalExecutions * 0.1) {
        problematic.set(name, m);
      }
    }
    return problematic;
  }
}
