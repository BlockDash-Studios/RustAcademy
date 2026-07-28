import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CorrelationLoggerService } from '../logging/logger.service';
import { ErrorCode } from '../common/error-codes.constants';

interface MetricEntry {
  name: string;
  value: number;
  timestamp: Date;
  labels: Record<string, string>;
  correlationId?: string;
}

interface CronHealthStatus {
  name: string;
  expression: string;
  isValid: boolean;
  lastRun?: Date;
  nextExpectedRun?: Date;
  status: 'healthy' | 'warning' | 'error';
  error?: string;
}

@Injectable()
export class MetricsService implements OnModuleInit {
  private readonly logger = new Logger(MetricsService.name);
  private readonly metrics = new Map<string, MetricEntry>();
  private readonly cronHealth = new Map<string, CronHealthStatus>();
  private readonly requestCounts = new Map<string, number>();
  private readonly errorCounts = new Map<string, number>();

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    this.registerCronHealthFromConfig();
    this.logger.log('MetricsService initialized');
  }

  /**
   * Increments a counter metric by the given value (default 1).
   */
  incrementCounter(name: string, value = 1, labels: Record<string, string> = {}): void {
    const correlationId = CorrelationLoggerService.getCorrelationId();
    const existing = this.metrics.get(name);
    if (existing) {
      existing.value += value;
      existing.timestamp = new Date();
      existing.labels = { ...existing.labels, ...labels };
      if (correlationId) existing.correlationId = correlationId;
    } else {
      this.metrics.set(name, {
        name,
        value,
        timestamp: new Date(),
        labels,
        correlationId,
      });
    }
    this.logger.debug(`Metric "${name}" incremented to ${this.metrics.get(name)?.value}`);
  }

  /**
   * Records a gauge metric (sets to an absolute value).
   */
  setGauge(name: string, value: number, labels: Record<string, string> = {}): void {
    this.metrics.set(name, {
      name,
      value,
      timestamp: new Date(),
      labels,
    });
  }

  /**
   * Records request latency in milliseconds.
   */
  recordLatency(endpoint: string, latencyMs: number): void {
    const key = `latency:${endpoint}`;
    const existing = this.metrics.get(key);
    if (existing) {
      // Exponential moving average
      existing.value = existing.value * 0.9 + latencyMs * 0.1;
      existing.timestamp = new Date();
    } else {
      this.metrics.set(key, {
        name: key,
        value: latencyMs,
        timestamp: new Date(),
        labels: { endpoint },
      });
    }
  }

  /**
   * Returns all recorded metrics.
   */
  getAllMetrics(): MetricEntry[] {
    return Array.from(this.metrics.values());
  }

  /**
   * Tracks a request to an endpoint.
   */
  trackRequest(endpoint: string): void {
    const count = this.requestCounts.get(endpoint) || 0;
    this.requestCounts.set(endpoint, count + 1);
    this.incrementCounter('requests_total', 1, { endpoint });
  }

  /**
   * Returns request count statistics.
   */
  getRequestStats(): Array<{ endpoint: string; count: number }> {
    return Array.from(this.requestCounts.entries()).map(([endpoint, count]) => ({
      endpoint,
      count,
    }));
  }

  /**
   * Registers cron job health status from config.
   */
  private registerCronHealthFromConfig(): void {
    const entries: Array<{ name: string; key: string }> = [
      { name: 'cleanup', key: 'CRON_CLEANUP_SCHEDULE' },
      { name: 'analytics', key: 'CRON_ANALYTICS_SCHEDULE' },
      { name: 'notifications', key: 'CRON_NOTIFICATIONS_SCHEDULE' },
    ];

    for (const entry of entries) {
      const expression = this.configService.get<string>(entry.key) || '';
      this.cronHealth.set(entry.name, {
        name: entry.name,
        expression,
        isValid: expression.length > 0,
        status: expression ? 'healthy' : 'warning',
      });
    }
  }

  /**
   * Returns cron health status for all registered jobs.
   */
  getCronHealth(): CronHealthStatus[] {
    return Array.from(this.cronHealth.values());
  }

  /**
   * Updates a cron job's last run timestamp.
   */
  recordCronRun(name: string): void {
    const entry = this.cronHealth.get(name);
    if (entry) {
      entry.lastRun = new Date();
      entry.status = 'healthy';
    }
  }

  private reconciliationCount = 0;
  private reconciliationDrifts = 0;

  recordReconciliation(count: number, drifts: number): void {
    this.reconciliationCount += count;
    this.reconciliationDrifts += drifts;
    this.setGauge('reconciliation_total', this.reconciliationCount);
    this.setGauge('reconciliation_drifts', this.reconciliationDrifts);
  private cacheWarmCount = 0;
  private cacheWarmErrors = 0;

  recordCacheWarm(count: number): void {
    this.cacheWarmCount += count;
    this.setGauge('cache_warm_total', this.cacheWarmCount);
  }

  recordCacheWarmError(): void {
    this.cacheWarmErrors++;
    this.setGauge('cache_warm_errors', this.cacheWarmErrors);
  }

  /**
   * Marks a cron job as having errored.
   */
  recordCronError(name: string, error: string): void {
    const entry = this.cronHealth.get(name);
    if (entry) {
      entry.status = 'error';
      entry.error = error;
    }
    this.incrementCounter('cron_errors_total', 1, { job: name });
  }

  /**
   * Records an error by its structured error code.
   */
  recordErrorByCode(errorCode: ErrorCode, endpoint?: string): void {
    const count = this.errorCounts.get(errorCode) || 0;
    this.errorCounts.set(errorCode, count + 1);
    this.incrementCounter('errors_total', 1, {
      error_code: errorCode,
      ...(endpoint ? { endpoint } : {}),
    });
    this.logger.debug(`Error "${errorCode}" recorded (total: ${count + 1})`);
  }

  /**
   * Returns error counts grouped by error code.
   */
  getErrorCounts(): Array<{ errorCode: string; count: number }> {
    return Array.from(this.errorCounts.entries()).map(([errorCode, count]) => ({
      errorCode,
      count,
    }));
  }

  /**
   * Returns error count for a specific error code.
   */
  getErrorCountByCode(errorCode: string): number {
    return this.errorCounts.get(errorCode) || 0;
  }

  /**
   * Clears all error counts.
   */
  clearErrorCounts(): void {
    this.errorCounts.clear();
  // ---------------------------------------------------------------------------
  // Pagination Metrics — Issue #415
  // ---------------------------------------------------------------------------

  /**
   * Records a pagination request metric for monitoring feed ordering stability.
   */
  recordPaginationRequest(feed: string, cursorUsed: boolean, resultCount: number): void {
    this.incrementCounter('pagination_requests_total', 1, {
      feed,
      cursor_used: String(cursorUsed),
    });
    this.setGauge(`pagination_result_count:${feed}`, resultCount, { feed });
    if (resultCount === 0) {
      this.incrementCounter('pagination_empty_results_total', 1, { feed });
    }
  }

  // ---------------------------------------------------------------------------
  // API Key & Webhook Metrics — Issue #410, #412
  // ---------------------------------------------------------------------------

  recordApiKeyEvent(
    event: 'created' | 'revoked' | 'rotated' | 'validated' | 'expired' | 'anomaly_detected',
    labels: Record<string, string> = {},
  ): void {
    this.incrementCounter('api_key_events_total', 1, { event, ...labels });
  }

  recordWebhookDelivery(
    status: 'success' | 'failed' | 'retry_scheduled',
    attemptNumber: number,
    labels: Record<string, string> = {},
  ): void {
    this.incrementCounter('webhook_deliveries_total', 1, {
      status,
      attempt: String(attemptNumber),
      ...labels,
    });
    if (status === 'failed') {
      this.incrementCounter('webhook_failures_total', 1, labels);
    }
  }

  recordRequestTimeout(service: string, endpoint: string): void {
    this.incrementCounter('request_timeouts_total', 1, { service, endpoint });
  }
}
