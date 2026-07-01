import { Injectable } from '@nestjs/common';
import { Counter } from 'prom-client';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import {
  DOMAIN_EVENTS_METRIC,
  ERROR_EVENTS_METRIC,
  HTTP_REQUESTS_METRIC,
} from './monitoring.metrics';

/**
 * Thin wrapper around the Prometheus counters registered by
 * {@link MonitoringModule}. Other modules inject this service to record
 * business-relevant metrics without directly knowing about `prom-client`.
 */
@Injectable()
export class MonitoringService {
  constructor(
    @InjectMetric(HTTP_REQUESTS_METRIC)
    private readonly httpRequests: Counter<string>,
    @InjectMetric(DOMAIN_EVENTS_METRIC)
    private readonly domainEvents: Counter<string>,
    @InjectMetric(ERROR_EVENTS_METRIC)
    private readonly errorEvents: Counter<string>,
  ) {}

  /**
   * Record a single HTTP request. Routes are normalized to always start with
   * `/` so that label cardinality stays bounded.
   */
  recordHttpRequest(method: string, route: string, statusCode: number): void {
    this.httpRequests.inc({
      method,
      route: normalizeRoute(route),
      status_code: statusCode.toString(),
    });
  }

  /**
   * Record a domain/business event (e.g. `badge_awarded` from the badges
   * module). The `source` label identifies the originating module.
   */
  recordDomainEvent(eventType: string, source: string): void {
    this.domainEvents.inc({ event_type: eventType, source });
  }

  /**
   * Record an error event. Use this sparingly to avoid leaking sensitive
   * details into metrics; label values must be stable and bounded.
   */
  recordError(source: string, reason: string): void {
    this.errorEvents.inc({ source, reason });
  }
}

function normalizeRoute(route: string): string {
  if (!route) {
    return '/';
  }
  return route.startsWith('/') ? route : `/${route}`;
}
