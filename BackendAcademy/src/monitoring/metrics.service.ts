import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isFeatureEnabled } from '../config/env.schema';

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

/**
 * Metrics service tracking application-level metrics including
 * contract registry (#393), event replay (#394), feature flag
 * state (#395), streaming disconnects (#373), and reward
 * redemptions (#363).
 */
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
    this.recordFeatureFlagMetrics();
    this.logger.log('MetricsService initialized');
  }

  // ──────────────────────────────────────────────────────────────────
  // Counter & gauge operations
  // ──────────────────────────────────────────────────────────────────

  incrementCounter(name: string, value = 1, labels: Record<string, string> = {}): void {
    const existing = this.metrics.get(name);
    if (existing) {
      existing.value += value;
      existing.timestamp = new Date();
      existing.labels = { ...existing.labels, ...labels };
    } else {
      this.metrics.set(name, {
        name,
        value,
        timestamp: new Date(),
        labels,
      });
    }
    this.logger.debug(`Metric "${name}" incremented to ${this.metrics.get(name)?.value}`);
  }

  setGauge(name: string, value: number, labels: Record<string, string> = {}): void {
    this.metrics.set(name, {
      name,
      value,
      timestamp: new Date(),
      labels,
    });
  }

  recordLatency(endpoint: string, latencyMs: number): void {
    const key = `latency:${endpoint}`;
    const existing = this.metrics.get(key);
    if (existing) {
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

  recordDomainEvent(eventType: string, source: string): void {
    this.incrementCounter('domain_events_total', 1, { event_type: eventType, source });
  }

  recordErrorEvent(source: string, reason: string): void {
    this.incrementCounter('error_events_total', 1, { source, reason });
  }

  getAllMetrics(): MetricEntry[] {
    return Array.from(this.metrics.values());
  }

  trackRequest(endpoint: string): void {
    const count = this.requestCounts.get(endpoint) || 0;
    this.requestCounts.set(endpoint, count + 1);
    this.incrementCounter('requests_total', 1, { endpoint });
  }

  getRequestStats(): Array<{ endpoint: string; count: number }> {
    return Array.from(this.requestCounts.entries()).map(([endpoint, count]) => ({
      endpoint,
      count,
    }));
  }

  // ──────────────────────────────────────────────────────────────────
  // Cron health
  // ──────────────────────────────────────────────────────────────────

  private registerCronHealthFromConfig(): void {
    const entries: Array<{ name: string; key: string }> = [
      { name: 'cleanup', key: 'CRON_CLEANUP_SCHEDULE' },
      { name: 'analytics', key: 'CRON_ANALYTICS_SCHEDULE' },
      { name: 'notifications', key: 'CRON_NOTIFICATIONS_SCHEDULE' },
      // #394: Replay cron health tracking
      { name: 'contract_replay', key: 'CRON_CONTRACT_REPLAY_SCHEDULE' },
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

  getCronHealth(): CronHealthStatus[] {
    return Array.from(this.cronHealth.values());
  }

  recordCronRun(name: string): void {
    const entry = this.cronHealth.get(name);
    if (entry) {
      entry.lastRun = new Date();
      entry.status = 'healthy';
    }
  }

  recordCronError(name: string, error: string): void {
    const entry = this.cronHealth.get(name);
    if (entry) {
      entry.status = 'error';
      entry.error = error;
    }
    this.incrementCounter('cron_errors_total', 1, { job: name });
  }

  // ──────────────────────────────────────────────────────────────────
  // #395: Feature flag state tracking
  // ──────────────────────────────────────────────────────────────────

  private recordFeatureFlagMetrics(): void {
    const flags: Array<{ name: string; key: string }> = [
      { name: 'contract_ingestion_enabled', key: 'CONTRACT_INGESTION_ENABLED' },
      { name: 'contract_registry_require_schema', key: 'CONTRACT_REGISTRY_REQUIRE_SCHEMA' },
      { name: 'contract_event_replay_enabled', key: 'CONTRACT_EVENT_REPLAY_ENABLED' },
    ];

    for (const flag of flags) {
      const value = this.configService.get<string>(flag.key);
      const enabled = isFeatureEnabled(value);
      this.setGauge(`feature_flag:${flag.name}`, enabled ? 1 : 0, {
        flag: flag.name,
        rawValue: value ?? 'undefined',
      });
      this.logger.debug(
        `Feature flag "${flag.name}" = ${enabled ? 'ENABLED' : 'DISABLED'} (raw: "${value ?? 'undefined'}")`,
      );
    }

    this.incrementCounter('contracts_metrics_initialized', 1, {});
  }
}
