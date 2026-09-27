import { Injectable, OnModuleInit } from "@nestjs/common";
import * as client from "prom-client";

@Injectable()
export class MetricsService implements OnModuleInit {
  private register: client.Registry;
  private httpRequestDuration: client.Histogram<string>;
  private httpRequestTotal: client.Counter<string>;
  private rateLimitedRequestsTotal: client.Counter<string>;
  private activeConnections: client.Gauge<string>;
  private ingestionLagSeconds: client.Gauge<string>;
  private webhookRetryTotal: client.Counter<string>;
  private webhookDeliveryDuration: client.Histogram<string>;
  private externalCallDuration: client.Histogram<string>;
  private errorRate: client.Counter<string>;
  private sorobanRpcFailoverTotal: client.Counter<string>;
  private sorobanRpcActiveEndpoint: client.Gauge<string>;
  private sorobanIndexerUnknownSchemaVersion: client.Counter<string>;
  // Schema-drift observability (Issue: contract event schema drift)
  private sorobanParserUnknownEventTotal: client.Counter<string>;
  private sorobanParserFieldMismatchTotal: client.Counter<string>;
  private sorobanParserRejectionTotal: client.Counter<string>;
  private sorobanParserUnexpectedFieldsTotal: client.Counter<string>;
  private parityCheckResults: client.Gauge<string>;
  private shadowTrafficRequests: client.Counter<string>;
  private indexerLagLedgers: client.Gauge<string>;
  private indexerLagGuardBlockedRequests: client.Counter<string>;
  private indexerLagGuardStatus: client.Gauge<string>;
  private initialized = false;

  onModuleInit() {
    try {
      this.register = new client.Registry();

      client.collectDefaultMetrics({ register: this.register });

      this.httpRequestDuration = new client.Histogram({
        name: "http_request_duration_seconds",
        help: "Duration of HTTP requests in seconds",
        labelNames: ["method", "route", "status_code"],
        buckets: [0.1, 0.5, 1, 2, 5, 10],
      });

      this.httpRequestTotal = new client.Counter({
        name: "http_requests_total",
        help: "Total number of HTTP requests",
        labelNames: ["method", "route", "status_code"],
      });

      this.rateLimitedRequestsTotal = new client.Counter({
        name: "http_rate_limited_requests_total",
        help: "Total number of requests blocked by rate limiting",
        labelNames: ["method", "route", "group", "key_type"],
      });

      this.activeConnections = new client.Gauge({
        name: "http_active_connections",
        help: "Number of active connections",
      });

      this.ingestionLagSeconds = new client.Gauge({
        name: "ingestion_lag_seconds",
        help: "Lag between current ledger and last ingested ledger in seconds",
        labelNames: ["contract_id"],
      });

      this.webhookRetryTotal = new client.Counter({
        name: "webhook_retry_total",
        help: "Total number of webhook retry attempts",
        labelNames: ["event_type", "status"],
      });

      this.webhookDeliveryDuration = new client.Histogram({
        name: "webhook_delivery_duration_seconds",
        help: "Duration of webhook delivery attempts in seconds",
        labelNames: ["event_type", "status"],
        buckets: [0.1, 0.5, 1, 2, 5, 10],
      });

      this.externalCallDuration = new client.Histogram({
        name: "external_call_duration_seconds",
        help: "Duration of external API calls in seconds",
        labelNames: ["service", "operation"],
        buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
      });

      this.errorRate = new client.Counter({
        name: "error_total",
        help: "Total number of errors",
        labelNames: ["service", "error_type"],
      });

      this.sorobanRpcFailoverTotal = new client.Counter({
        name: "soroban_rpc_failover_total",
        help: "Total number of Soroban RPC failover events",
        labelNames: ["from_endpoint", "to_endpoint", "reason"],
      });

      this.sorobanRpcActiveEndpoint = new client.Gauge({
        name: "soroban_rpc_active_endpoint",
        help: "Currently active Soroban RPC endpoint (1=active, 0=inactive)",
        labelNames: ["endpoint"],
      });

      this.sorobanIndexerUnknownSchemaVersion = new client.Counter({
        name: "soroban_indexer_unknown_schema_version_total",
        help: "Events skipped because their schema_version exceeds the indexer maximum",
        labelNames: ["event_name", "schema_version"],
      });

      // ── Schema-drift counters ──────────────────────────────────────────────

      this.sorobanParserUnknownEventTotal = new client.Counter({
        name: "soroban_parser_unknown_event_total",
        help: "Contract events rejected because the event name is not in the known schema registry",
        labelNames: ["contract_id", "raw_event_name"],
      });

      this.sorobanParserFieldMismatchTotal = new client.Counter({
        name: "soroban_parser_field_mismatch_total",
        help: "Contract events where one or more required payload keys were absent",
        labelNames: ["event_name", "schema_version", "missing_fields"],
      });

      this.sorobanParserRejectionTotal = new client.Counter({
        name: "soroban_parser_rejection_total",
        help: "Total contract event parse rejections classified by drift type",
        labelNames: ["event_name", "drift_type"],
      });

      this.sorobanParserUnexpectedFieldsTotal = new client.Counter({
        name: "soroban_parser_unexpected_fields_total",
        help: "Events that carry payload keys not in the expected schema (forward-compat additions)",
        labelNames: ["event_name", "schema_version"],
      });

      this.register.registerMetric(this.sorobanParserUnknownEventTotal);
      this.register.registerMetric(this.sorobanParserFieldMismatchTotal);
      this.register.registerMetric(this.sorobanParserRejectionTotal);
      this.register.registerMetric(this.sorobanParserUnexpectedFieldsTotal);

      // ── End schema-drift counters ─────────────────────────────────────────

      this.parityCheckResults = new client.Gauge({
        name: "environment_parity_check_results",
        help: "Environment parity check results by status",
        labelNames: ["status"],
      });

      this.shadowTrafficRequests = new client.Counter({
        name: "shadow_traffic_requests_total",
        help: "Total number of shadow traffic requests",
        labelNames: ["method", "route", "status_code", "shadow_status"],
      });

      this.indexerLagLedgers = new client.Gauge({
        name: "indexer_lag_ledgers",
        help: "Current indexer lag in ledgers",
      });

      this.indexerLagGuardBlockedRequests = new client.Counter({
        name: "indexer_lag_guard_blocked_requests_total",
        help: "Total number of requests blocked by indexer lag guard",
        labelNames: ["method", "route"],
      });

      this.indexerLagGuardStatus = new client.Gauge({
        name: "indexer_lag_guard_status",
        help: "Indexer lag guard status (0=disabled, 1=enabled, 2=overridden, 3=lagging)",
      });

      this.register.registerMetric(this.httpRequestDuration);
      this.register.registerMetric(this.httpRequestTotal);
      this.register.registerMetric(this.rateLimitedRequestsTotal);
      this.register.registerMetric(this.activeConnections);
      this.register.registerMetric(this.ingestionLagSeconds);
      this.register.registerMetric(this.webhookRetryTotal);
      this.register.registerMetric(this.webhookDeliveryDuration);
      this.register.registerMetric(this.externalCallDuration);
      this.register.registerMetric(this.errorRate);
      this.register.registerMetric(this.sorobanRpcFailoverTotal);
      this.register.registerMetric(this.sorobanRpcActiveEndpoint);
      this.register.registerMetric(this.sorobanIndexerUnknownSchemaVersion);
      this.register.registerMetric(this.parityCheckResults);
      this.register.registerMetric(this.shadowTrafficRequests);
      this.register.registerMetric(this.indexerLagLedgers);
      this.register.registerMetric(this.indexerLagGuardBlockedRequests);
      this.register.registerMetric(this.indexerLagGuardStatus);

      this.initialized = true;
    } catch (error) {
      console.error("Failed to initialize metrics:", error);
      this.initialized = false;
    }
  }

  getRegistry(): client.Registry {
    return this.register;
  }

  recordRequestDuration(
    method: string,
    route: string,
    statusCode: number,
    duration: number,
  ) {
    if (
      !this.initialized ||
      !this.httpRequestDuration ||
      !this.httpRequestTotal
    ) {
      return;
    }

    try {
      this.httpRequestDuration
        .labels(method, route, statusCode.toString())
        .observe(duration);
      this.httpRequestTotal.labels(method, route, statusCode.toString()).inc();
    } catch (error) {}
  }

  incrementActiveConnections() {
    if (!this.initialized || !this.activeConnections) {
      return;
    }

    try {
      this.activeConnections.inc();
    } catch (error) {}
  }

  decrementActiveConnections() {
    if (!this.initialized || !this.activeConnections) {
      return;
    }

    try {
      this.activeConnections.dec();
    } catch (error) {}
  }

  recordRateLimitedRequest(
    method: string,
    route: string,
    group: string,
    keyType: string,
  ) {
    if (!this.initialized || !this.rateLimitedRequestsTotal) {
      return;
    }

    try {
      this.rateLimitedRequestsTotal.labels(method, route, group, keyType).inc();
    } catch (error) {}
  }

  recordIngestionLag(contractId: string, lagSeconds: number) {
    if (!this.initialized || !this.ingestionLagSeconds) {
      return;
    }

    try {
      this.ingestionLagSeconds.labels(contractId).set(lagSeconds);
    } catch (error) {}
  }

  recordWebhookRetry(eventType: string, status: string) {
    if (!this.initialized || !this.webhookRetryTotal) {
      return;
    }

    try {
      this.webhookRetryTotal.labels(eventType, status).inc();
    } catch (error) {}
  }

  recordWebhookDeliveryDuration(
    eventType: string,
    status: string,
    duration: number,
  ) {
    if (!this.initialized || !this.webhookDeliveryDuration) {
      return;
    }

    try {
      this.webhookDeliveryDuration.labels(eventType, status).observe(duration);
    } catch (error) {}
  }

  recordExternalCall(service: string, operation: string, duration: number) {
    if (!this.initialized || !this.externalCallDuration) {
      return;
    }

    try {
      this.externalCallDuration.labels(service, operation).observe(duration);
    } catch (error) {}
  }

  recordError(service: string, errorType: string) {
    if (!this.initialized || !this.errorRate) {
      return;
    }

    try {
      this.errorRate.labels(service, errorType).inc();
    } catch (error) {}
  }

  recordSorobanRpcFailover(
    fromEndpoint: string,
    toEndpoint: string,
    reason: string,
  ) {
    if (!this.initialized || !this.sorobanRpcFailoverTotal) {
      return;
    }
    try {
      this.sorobanRpcFailoverTotal
        .labels(fromEndpoint, toEndpoint, reason)
        .inc();
    } catch (error) {}
  }

  setSorobanRpcActiveEndpoint(endpoint: string, allEndpoints: string[]) {
    if (!this.initialized || !this.sorobanRpcActiveEndpoint) {
      return;
    }
    try {
      for (const url of allEndpoints) {
        this.sorobanRpcActiveEndpoint.labels(url).set(url === endpoint ? 1 : 0);
      }
    } catch (error) {}
  }

  recordUnknownSchemaVersion(eventName: string, schemaVersion: number) {
    if (!this.initialized || !this.sorobanIndexerUnknownSchemaVersion) return;
    try {
      this.sorobanIndexerUnknownSchemaVersion
        .labels(eventName, String(schemaVersion))
        .inc();
    } catch (error) {}
  }

  recordParityCheckResult(
    checkType: string,
    passed: number,
    failed: number,
    warnings: number,
  ) {
    if (!this.initialized || !this.parityCheckResults) return;
    try {
      this.parityCheckResults.labels("pass").set(passed);
      this.parityCheckResults.labels("fail").set(failed);
      this.parityCheckResults.labels("warning").set(warnings);
    } catch (error) {}
  }

  recordShadowTrafficRequest(
    method: string,
    route: string,
    statusCode: number,
    shadowStatus: "success" | "error" | "skipped",
  ) {
    if (!this.initialized || !this.shadowTrafficRequests) return;
    try {
      this.shadowTrafficRequests
        .labels(method, route, statusCode.toString(), shadowStatus)
        .inc();
    } catch (error) {}
  }

  recordIndexerLag(lagLedgers: number) {
    if (!this.initialized || !this.indexerLagLedgers) return;
    try {
      this.indexerLagLedgers.set(lagLedgers);
    } catch (error) {}
  }

  recordIndexerLagGuardBlockedRequest(method: string, route: string) {
    if (!this.initialized || !this.indexerLagGuardBlockedRequests) return;
    try {
      this.indexerLagGuardBlockedRequests.labels(method, route).inc();
    } catch (error) {}
  }

  setIndexerLagGuardStatus(status: 0 | 1 | 2 | 3) {
    if (!this.initialized || !this.indexerLagGuardStatus) return;
    try {
      this.indexerLagGuardStatus.set(status);
    } catch (error) {}
  }

  // ── Schema-drift observability ────────────────────────────────────────────

  /**
   * Increment the counter for events rejected because their topic symbol is
   * not in the schema registry.
   */
  recordUnknownEvent(contractId: string, rawEventName: string) {
    if (!this.initialized || !this.sorobanParserUnknownEventTotal) return;
    try {
      this.sorobanParserUnknownEventTotal.labels(contractId, rawEventName).inc();
    } catch (error) {}
  }

  /**
   * Increment the counter when required payload keys are absent for a known
   * event type. `missingFields` is a sorted comma-separated key list used as
   * a label so the alert can surface exactly which fields drifted.
   */
  recordFieldMismatch(
    eventName: string,
    schemaVersion: number,
    missingFields: string[],
  ) {
    if (!this.initialized || !this.sorobanParserFieldMismatchTotal) return;
    try {
      this.sorobanParserFieldMismatchTotal
        .labels(eventName, String(schemaVersion), missingFields.join(","))
        .inc();
    } catch (error) {}
  }

  /**
   * Increment the unified rejection counter tagged by drift type.
   * This is the primary metric for alerting thresholds.
   */
  recordParserRejection(eventName: string, driftType: string) {
    if (!this.initialized || !this.sorobanParserRejectionTotal) return;
    try {
      this.sorobanParserRejectionTotal.labels(eventName, driftType).inc();
    } catch (error) {}
  }

  /**
   * Increment the counter for events that carry unexpected extra keys.
   * These events are still ingested; this is an informational forward-compat
   * warning rather than a hard rejection.
   */
  recordUnexpectedFields(eventName: string, schemaVersion: number) {
    if (!this.initialized || !this.sorobanParserUnexpectedFieldsTotal) return;
    try {
      this.sorobanParserUnexpectedFieldsTotal
        .labels(eventName, String(schemaVersion))
        .inc();
    } catch (error) {}
  }
}
