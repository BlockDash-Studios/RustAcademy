import { Injectable, Logger } from '@nestjs/common';
import { Counter, Gauge, Histogram } from 'prom-client';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import {
  DOMAIN_EVENTS_METRIC,
  ERROR_EVENTS_METRIC,
  HTTP_REQUESTS_METRIC,
  SERVICE_ERRORS_METRIC,
  DOMAIN_OUTCOMES_METRIC,
  HTTP_LATENCY_METRIC,
  DATABASE_LATENCY_METRIC,
  REDIS_LATENCY_METRIC,
  AI_LATENCY_METRIC,
  GRADING_LATENCY_METRIC,
  PAYMENT_LATENCY_METRIC,
  NOTIFICATION_LATENCY_METRIC,
  JOBS_QUEUE_DEPTH_METRIC,
  DEAD_LETTER_QUEUE_DEPTH_METRIC,
} from './monitoring.metrics';
import { CorrelationLoggerService } from '../logging/logger.service';

/**
 * Service-level metric names used by {@link SERVICE_ERRORS_METRIC}.
 * Keeping these as a const enum-like block avoids typos in label values.
 */
export const MetricServiceNames = {
  DATABASE: 'database',
  REDIS: 'redis',
  AI: 'ai',
  GRADING: 'grading',
  PAYMENT: 'payment',
  NOTIFICATION: 'notification',
  HTTP: 'http',
} as const;

export type MetricServiceName = (typeof MetricServiceNames)[keyof typeof MetricServiceNames];

/**
 * Error type labels for {@link SERVICE_ERRORS_METRIC}.
 */
export const MetricErrorTypes = {
  TIMEOUT: 'timeout',
  CONNECTION: 'connection',
  VALIDATION: 'validation',
  RATE_LIMIT: 'rate_limit',
  UNKNOWN: 'unknown',
} as const;

export type MetricErrorType = (typeof MetricErrorTypes)[keyof typeof MetricErrorTypes];

/**
 * Thin wrapper around the Prometheus counters registered by
 * {@link MonitoringModule}. Other modules inject this service to record
 * business-relevant metrics without directly knowing about `prom-client`.
 *
 * #377: All counters now include `tenant_id` and `request_id` labels
 * so monitoring spans carry full request context for multi-tenant
 * troubleshooting.
 */
@Injectable()
export class MonitoringService {
  /** Internal counters for session & API key events (not Prom-registered). */
  private sessionRevocations = 0;
  private apiKeyCreations = 0;
  private apiKeyRevocations = 0;
  private apiKeyAnomalies = 0;

  private readonly logger = new Logger(MonitoringService.name);

  constructor(
    @InjectMetric(HTTP_REQUESTS_METRIC)
    private readonly httpRequests: Counter<string>,
    @InjectMetric(DOMAIN_EVENTS_METRIC)
    private readonly domainEvents: Counter<string>,
    @InjectMetric(ERROR_EVENTS_METRIC)
    private readonly errorEvents: Counter<string>,
    @InjectMetric(SERVICE_ERRORS_METRIC)
    private readonly serviceErrors: Counter<string>,
    @InjectMetric(DOMAIN_OUTCOMES_METRIC)
    private readonly domainOutcomes: Counter<string>,
    @InjectMetric(HTTP_LATENCY_METRIC)
    private readonly httpLatency: Histogram<string>,
    @InjectMetric(DATABASE_LATENCY_METRIC)
    private readonly databaseLatency: Histogram<string>,
    @InjectMetric(REDIS_LATENCY_METRIC)
    private readonly redisLatency: Histogram<string>,
    @InjectMetric(AI_LATENCY_METRIC)
    private readonly aiLatency: Histogram<string>,
    @InjectMetric(GRADING_LATENCY_METRIC)
    private readonly gradingLatency: Histogram<string>,
    @InjectMetric(PAYMENT_LATENCY_METRIC)
    private readonly paymentLatency: Histogram<string>,
    @InjectMetric(NOTIFICATION_LATENCY_METRIC)
    private readonly notificationLatency: Histogram<string>,
    @InjectMetric(JOBS_QUEUE_DEPTH_METRIC)
    private readonly jobsQueueDepth: Gauge<string>,
    @InjectMetric(DEAD_LETTER_QUEUE_DEPTH_METRIC)
    private readonly deadLetterQueueDepth: Gauge<string>,
  ) {}

  /**
   * #377: Extracts tenant and request IDs from the current AsyncLocalStorage
   * context so every metric span carries request identity.
   */
  private getRequestContext(): { tenant_id: string; request_id: string } {
    const ctx = CorrelationLoggerService.getContext();
    return {
      tenant_id: ctx?.tenantId ?? 'unknown',
      request_id: ctx?.requestId ?? 'unknown',
    };
  }

  /**
   * Record a single HTTP request. Routes are normalized to always start with
   * `/` so that label cardinality stays bounded.
   */
  recordHttpRequest(method: string, route: string, statusCode: number): void {
    const normalizedRoute = normalizeRoute(route);
    this.httpRequests.inc({
      method,
      route: normalizedRoute,
      status_code: statusCode.toString(),
      ...this.getRequestContext(),
    });
  }

  /**
   * Record HTTP request latency in the histogram.
   */
  recordHttpLatency(method: string, route: string, statusCode: number, durationMs: number): void {
    this.httpLatency.observe(
      { method, route: normalizeRoute(route), status_code: statusCode.toString() },
      durationMs / 1000,
    );
  }

  /**
   * Record a domain/business event (e.g. `badge_awarded` from the badges
   * module). The `source` label identifies the originating module.
   */
  recordDomainEvent(eventType: string, source: string): void {
    this.domainEvents.inc({ event_type: eventType, source, ...this.getRequestContext() });
  }

  /**
   * Record an error event. Use this sparingly to avoid leaking sensitive
   * details into metrics; label values must be stable and bounded.
   */
  recordError(source: string, reason: string): void {
    this.errorEvents.inc({ source, reason, ...this.getRequestContext() });
  }

  /**
   * Record a session revocation event.
   */
  recordSessionRevocation(userId: string, reason: string): void {
    this.sessionRevocations++;
    this.domainEvents.inc({
      event_type: 'session_revoked',
      source: 'auth',
      ...this.getRequestContext(),
    });
  }

  /**
   * Record an API key creation event.
   */
  recordApiKeyCreation(userId: string): void {
    this.apiKeyCreations++;
    this.domainEvents.inc({
      event_type: 'api_key_created',
      source: 'security',
      ...this.getRequestContext(),
    });
  }

  /**
   * Record an API key revocation event.
   */
  recordApiKeyRevocation(userId: string, reason: string): void {
    this.apiKeyRevocations++;
    this.domainEvents.inc({
      event_type: 'api_key_revoked',
      source: 'security',
      ...this.getRequestContext(),
    });
  }

  /**
   * Record an API key anomaly detection event.
   */
  recordApiKeyAnomaly(apiKeyId: string): void {
    this.apiKeyAnomalies++;
    this.domainEvents.inc({
      event_type: 'api_key_anomaly',
      source: 'security',
      ...this.getRequestContext(),
    });
  }

  // ──────────────────────────────────────────────────────────────────
  // Service-level error tracking
  // ──────────────────────────────────────────────────────────────────

  /**
   * Record a service-level error (database, redis, ai, grading, payment,
   * notification). The `errorType` label should be one of the
   * {@link MetricErrorTypes} constants to keep cardinality bounded.
   */
  recordServiceError(service: MetricServiceName, errorType: MetricErrorType): void {
    this.serviceErrors.inc({ service, error_type: errorType });
  }

  // ──────────────────────────────────────────────────────────────────
  // Latency histograms per subsystem
  // ──────────────────────────────────────────────────────────────────

  /**
   * Record database query latency.
   */
  recordDatabaseLatency(operation: string, table: string, durationMs: number): void {
    this.databaseLatency.observe({ operation, table }, durationMs / 1000);
  }

  /**
   * Record Redis operation latency.
   */
  recordRedisLatency(operation: string, durationMs: number): void {
    this.redisLatency.observe({ operation }, durationMs / 1000);
  }

  /**
   * Record AI provider request latency.
   */
  recordAiLatency(provider: string, operation: string, durationMs: number): void {
    this.aiLatency.observe({ provider, operation }, durationMs / 1000);
  }

  /**
   * Record grading operation latency.
   */
  recordGradingLatency(operation: string, durationMs: number): void {
    this.gradingLatency.observe({ operation }, durationMs / 1000);
  }

  /**
   * Record payment operation latency.
   */
  recordPaymentLatency(operation: string, provider: string, durationMs: number): void {
    this.paymentLatency.observe({ operation, provider }, durationMs / 1000);
  }

  /**
   * Record notification delivery latency.
   */
  recordNotificationLatency(channel: string, operation: string, durationMs: number): void {
    this.notificationLatency.observe({ channel, operation }, durationMs / 1000);
  }

  // ──────────────────────────────────────────────────────────────────
  // Queue depth saturation gauges
  // ──────────────────────────────────────────────────────────────────

  /**
   * Set the current jobs queue depth (pending + retrying).
   */
  setJobsQueueDepth(queue: string, depth: number): void {
    this.jobsQueueDepth.set({ queue }, depth);
  }

  /**
   * Set the current dead-letter queue depth (exhausted retries).
   */
  setDeadLetterQueueDepth(queue: string, depth: number): void {
    this.deadLetterQueueDepth.set({ queue }, depth);
  }

  // ──────────────────────────────────────────────────────────────────
  // Domain outcome tracking
  // ──────────────────────────────────────────────────────────────────

  /**
   * Record a domain outcome event (course completion, payment success,
   * notification delivered, etc.).
   */
  recordDomainOutcome(outcome: string, service: string, status: 'success' | 'failure' | 'skipped'): void {
    this.domainOutcomes.inc({ outcome, service, status });
  }

  /**
   * Get snapshot of internal counters for health / debug endpoints.
   */
  getStats(): Record<string, number> {
    return {
      sessionRevocations: this.sessionRevocations,
      apiKeyCreations: this.apiKeyCreations,
      apiKeyRevocations: this.apiKeyRevocations,
      apiKeyAnomalies: this.apiKeyAnomalies,
    };
  }
}

function normalizeRoute(route: string): string {
  if (!route) {
    return '/';
  }
  return route.startsWith('/') ? route : `/${route}`;
}
