import { makeCounterProvider } from '@willsoto/nestjs-prometheus';

/**
 * Counter metric names exported as constants so they can be referenced by both
 * the providers (registration) and the service (injection) without string drift.
 */
export const HTTP_REQUESTS_METRIC = 'app_http_requests_total';
export const DOMAIN_EVENTS_METRIC = 'app_domain_events_total';
export const ERROR_EVENTS_METRIC = 'app_error_events_total';

/**
 * Counter: total HTTP requests received by the application.
 * Incremented by a future HTTP interceptor or manually by controllers when
 * a non-default response path is taken.
 */
export const httpRequestsCounterProvider = makeCounterProvider({
  name: HTTP_REQUESTS_METRIC,
  help: 'Total number of HTTP requests received by the application',
  labelNames: ['method', 'route', 'status_code'],
});

/**
 * Counter: total domain/business events emitted by the application modules
 * (e.g. badge awarded, social post created, challenge submitted). Other
 * NestJS modules should inject {@link MonitoringService} to bump these.
 */
export const domainEventsCounterProvider = makeCounterProvider({
  name: DOMAIN_EVENTS_METRIC,
  help: 'Total number of domain/business events emitted by the application',
  labelNames: ['event_type', 'source'],
});

/**
 * Counter: total error events grouped by the originating source module. Used
 * to alert on operational regressions without parsing the application logs.
 */
export const errorEventsCounterProvider = makeCounterProvider({
  name: ERROR_EVENTS_METRIC,
  help: 'Total number of error events emitted by the application',
  labelNames: ['source', 'reason'],
});
