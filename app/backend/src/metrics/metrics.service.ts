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
  // ── Contract event drift / parser observability ──────────────────────────
  private contractEventParserRejections: client.Counter<string>;
  private contractEventUnknownNames: client.Counter<string>;
  private contractEventFieldMismatches: client.Counter<string>;
  private contractEventParseErrors: client.Counter<string>;
  private contractEventRejectionRate: client.Gauge<string>;
  // ─────────────────────────────────────────────────────────────────────────
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

      // ── Contract event drift / parser observability ──────────────────────
      this.contractEventParserRejections = new client.Counter({
        name: "contract_event_parser_rejections_total",
        help: "Total contract events rejected by the parser, labelled by reason, contract ID, event name, and schema version",
        labelNames: ["reason", "contract_id", "event_name", "schema_version"],
      });

      this.contractEventUnknownNames = new client.Counter({
        name: "contract_event_unknown_names_total",
        help: "Contract events with an event name not present in the schema registry",
        labelNames: ["contract_id"],
      });

      this.contractEventFieldMismatches = new client.Counter({
        name: "contract_event_field_mismatches_total",
        help: "Contract events whose payload is missing one or more expected fields",
        labelNames: ["contract_id", "event_name", "schema_version"],
      });

      this.contractEventParseErrors = new client.Counter({
        name: "contract_event_parse_errors_total",
        help: "Contract events that caused an XDR decode or structural parse error",
        labelNames: ["contract_id"],
      });

      this.contractEventRejectionRate = new client.Gauge({
        name: "contract_event_rejection_rate",
        help: "Rolling 5-minute rejection rate (0.0–1.0) for the contract event parser",
        labelNames: ["contract_id"],
      });
      // ────────────────────────────────────────────────────────────────────

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
      this.register.registerMetric(this.contractEventParserRejections);
      this.register.registerMetric(this.contractEventUnknownNames);
      this.register.registerMetric(this.contractEventFieldMismatches);
      this.register.registerMetric(this.contractEventParseErrors);
      this.register.registerMetric(this.contractEventRejectionRate);

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

  // ── Contract event drift / parser observability ─────────────────────────

  /**
   * Increment the parser rejections counter.
   * @param reason    Why the event was rejected (drift reason)
   * @param contractId  Soroban contract ID
   * @param eventName   Event name (may be "unknown" if the name itself is unrecognised)
   * @param schemaVersion Schema version read from the event (or 0 if unavailable)
   */
  recordParserRejection(
    reason: string,
    contractId: string,
    eventName: string,
    schemaVersion: number,
  ) {
    if (!this.initialized || !this.contractEventParserRejections) return;
    try {
      this.contractEventParserRejections
        .labels(reason, contractId, eventName, String(schemaVersion))
        .inc();
    } catch (error) {}
  }

  /** Increment the unknown event name counter. */
  recordUnknownEventName(contractId: string) {
    if (!this.initialized || !this.contractEventUnknownNames) return;
    try {
      this.contractEventUnknownNames.labels(contractId).inc();
    } catch (error) {}
  }

  /** Increment the field mismatch counter. */
  recordFieldMismatch(
    contractId: string,
    eventName: string,
    schemaVersion: number,
  ) {
    if (!this.initialized || !this.contractEventFieldMismatches) return;
    try {
      this.contractEventFieldMismatches
        .labels(contractId, eventName, String(schemaVersion))
        .inc();
    } catch (error) {}
  }

  /** Increment the parse error counter. */
  recordParseError(contractId: string) {
    if (!this.initialized || !this.contractEventParseErrors) return;
    try {
      this.contractEventParseErrors.labels(contractId).inc();
    } catch (error) {}
  }

  /**
   * Update the rolling rejection rate gauge for a contract.
   * @param contractId  Soroban contract ID
   * @param rate        Value between 0 and 1 (0 = no rejections)
   */
  setContractEventRejectionRate(contractId: string, rate: number) {
    if (!this.initialized || !this.contractEventRejectionRate) return;
    try {
      this.contractEventRejectionRate.labels(contractId).set(rate);
    } catch (error) {}
  }
}
