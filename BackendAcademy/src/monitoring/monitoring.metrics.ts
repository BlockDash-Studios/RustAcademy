import { makeCounterProvider } from '@willsoto/nestjs-prometheus';

export const HTTP_REQUESTS_METRIC = 'app_http_requests_total';
export const DOMAIN_EVENTS_METRIC = 'app_domain_events_total';
export const ERROR_EVENTS_METRIC = 'app_error_events_total';

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

