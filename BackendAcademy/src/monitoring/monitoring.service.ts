import { Injectable } from '@nestjs/common';
import { Counter, Gauge } from 'prom-client';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import {
  DOMAIN_EVENTS_METRIC,
  ERROR_EVENTS_METRIC,
  HTTP_REQUESTS_METRIC,
} from './monitoring.metrics';
import { CorrelationLoggerService } from '../logging/logger.service';

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

  constructor(
    @InjectMetric(HTTP_REQUESTS_METRIC)
    private readonly httpRequests: Counter<string>,
    @InjectMetric(DOMAIN_EVENTS_METRIC)
    private readonly domainEvents: Counter<string>,
    @InjectMetric(ERROR_EVENTS_METRIC)
    private readonly errorEvents: Counter<string>,
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
    this.httpRequests.inc({
      method,
      route: normalizeRoute(route),
      status_code: statusCode.toString(),
      ...this.getRequestContext(),
    });
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
