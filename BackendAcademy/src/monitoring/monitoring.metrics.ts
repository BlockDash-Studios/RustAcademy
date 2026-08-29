import { makeCounterProvider, makeHistogramProvider, makeGaugeProvider } from '@willsoto/nestjs-prometheus';

// ──────────────────────────────────────────────────────────────────
// Counter metrics
// ──────────────────────────────────────────────────────────────────

export const HTTP_REQUESTS_METRIC = 'app_http_requests_total';
export const DOMAIN_EVENTS_METRIC = 'app_domain_events_total';
export const ERROR_EVENTS_METRIC = 'app_error_events_total';
export const SERVICE_ERRORS_METRIC = 'app_service_errors_total';
export const DOMAIN_OUTCOMES_METRIC = 'app_domain_outcomes_total';

export const httpRequestsCounterProvider = makeCounterProvider({
  name: HTTP_REQUESTS_METRIC,
  help: 'Total number of HTTP requests received by the application',
  labelNames: ['method', 'route', 'status_code', 'tenant_id', 'request_id'],
});

export const domainEventsCounterProvider = makeCounterProvider({
  name: DOMAIN_EVENTS_METRIC,
  help: 'Total number of domain/business events emitted by the application',
  labelNames: ['event_type', 'source', 'tenant_id', 'request_id'],
});

export const errorEventsCounterProvider = makeCounterProvider({
  name: ERROR_EVENTS_METRIC,
  help: 'Total number of error events emitted by the application',
  labelNames: ['source', 'reason', 'tenant_id', 'request_id'],
});

/**
 * Per-service error counter. Tracks error rates broken down by
 * service name (database, redis, ai, grading, payment, notification)
 * and error type (timeout, connection, validation, etc.).
 */
export const serviceErrorsCounterProvider = makeCounterProvider({
  name: SERVICE_ERRORS_METRIC,
  help: 'Total number of errors per service',
  labelNames: ['service', 'error_type'],
});

/**
 * Domain outcome counter. Tracks business-relevant outcomes such as
 * course completions, payment successes/failures, and notification
 * delivery results.
 */
export const domainOutcomesCounterProvider = makeCounterProvider({
  name: DOMAIN_OUTCOMES_METRIC,
  help: 'Total number of domain outcome events',
  labelNames: ['outcome', 'service', 'status'],
});

// ──────────────────────────────────────────────────────────────────
// Histogram metrics (latency)
// ──────────────────────────────────────────────────────────────────

export const HTTP_LATENCY_METRIC = 'app_http_request_duration_seconds';
export const DATABASE_LATENCY_METRIC = 'app_database_query_duration_seconds';
export const REDIS_LATENCY_METRIC = 'app_redis_operation_duration_seconds';
export const AI_LATENCY_METRIC = 'app_ai_provider_duration_seconds';
export const GRADING_LATENCY_METRIC = 'app_grading_operation_duration_seconds';
export const PAYMENT_LATENCY_METRIC = 'app_payment_operation_duration_seconds';
export const NOTIFICATION_LATENCY_METRIC = 'app_notification_operation_duration_seconds';

export const httpLatencyHistogramProvider = makeHistogramProvider({
  name: HTTP_LATENCY_METRIC,
  help: 'HTTP request latency in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

export const databaseLatencyHistogramProvider = makeHistogramProvider({
  name: DATABASE_LATENCY_METRIC,
  help: 'Database query latency in seconds',
  labelNames: ['operation', 'table'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
});

export const redisLatencyHistogramProvider = makeHistogramProvider({
  name: REDIS_LATENCY_METRIC,
  help: 'Redis operation latency in seconds',
  labelNames: ['operation'],
  buckets: [0.0005, 0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1],
});

export const aiLatencyHistogramProvider = makeHistogramProvider({
  name: AI_LATENCY_METRIC,
  help: 'AI provider request latency in seconds',
  labelNames: ['provider', 'operation'],
  buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
});

export const gradingLatencyHistogramProvider = makeHistogramProvider({
  name: GRADING_LATENCY_METRIC,
  help: 'Grading operation latency in seconds',
  labelNames: ['operation'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});

export const paymentLatencyHistogramProvider = makeHistogramProvider({
  name: PAYMENT_LATENCY_METRIC,
  help: 'Payment operation latency in seconds',
  labelNames: ['operation', 'provider'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

export const notificationLatencyHistogramProvider = makeHistogramProvider({
  name: NOTIFICATION_LATENCY_METRIC,
  help: 'Notification delivery latency in seconds',
  labelNames: ['channel', 'operation'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});

// ──────────────────────────────────────────────────────────────────
// Gauge metrics (queue depth / saturation)
// ──────────────────────────────────────────────────────────────────

export const JOBS_QUEUE_DEPTH_METRIC = 'app_jobs_queue_depth';
export const DEAD_LETTER_QUEUE_DEPTH_METRIC = 'app_dead_letter_queue_depth';

export const jobsQueueDepthGaugeProvider = makeGaugeProvider({
  name: JOBS_QUEUE_DEPTH_METRIC,
  help: 'Current depth of the jobs queue (pending + retrying)',
  labelNames: ['queue'],
});

export const deadLetterQueueDepthGaugeProvider = makeGaugeProvider({
  name: DEAD_LETTER_QUEUE_DEPTH_METRIC,
  help: 'Current depth of the dead-letter queue (exhausted retries)',
  labelNames: ['queue'],
});

