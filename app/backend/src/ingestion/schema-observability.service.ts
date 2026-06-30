import { Injectable, Logger } from "@nestjs/common";
import { MetricsService } from "../metrics/metrics.service";
import { SentryService } from "../sentry/sentry.service";
import type {
  ParserRejectionDiagnostic,
  DriftType,
} from "./parser-diagnostics.types";
import { MAX_DIAGNOSTIC_BUFFER } from "./parser-diagnostics.types";
import type { SorobanEventType } from "./types/contract-event.types";
import type { RawHorizonContractEvent } from "./soroban-event.parser";

/**
 * SchemaObservabilityService is the single integration point for all
 * contract-event schema-drift signals.
 *
 * Responsibilities:
 *  - Record Prometheus metrics for each drift category.
 *  - Capture safe diagnostic payloads to Sentry (no raw private key material).
 *  - Maintain an in-memory ring-buffer of recent rejections for the
 *    developer-facing /indexer/parser-health endpoint.
 *  - Expose a per-window rejection count so alert thresholds can be evaluated.
 */
@Injectable()
export class SchemaObservabilityService {
  private readonly logger = new Logger(SchemaObservabilityService.name);

  /** Ring-buffer of recent rejection diagnostics (capped at MAX_DIAGNOSTIC_BUFFER). */
  private readonly recentRejections: ParserRejectionDiagnostic[] = [];

  /**
   * Sliding-window counters: each entry is { timestamp, driftType }.
   * We keep only entries within the configured window for threshold checks.
   */
  private readonly windowEntries: Array<{
    timestamp: number;
    driftType: DriftType;
  }> = [];

  /** Alert fires when rejection count exceeds this in WINDOW_MS. */
  static readonly ALERT_THRESHOLD = 10;
  static readonly WINDOW_MS = 60_000; // 1 minute

  constructor(
    private readonly metrics: MetricsService,
    private readonly sentry: SentryService,
  ) {}

  // ── Public surface ──────────────────────────────────────────────────────────

  /**
   * Called when the event topic symbol is not in the known schema registry.
   * This is classified differently from a parse error — the contract may be
   * emitting an event type that this indexer version does not know about yet.
   */
  recordUnknownEvent(
    raw: RawHorizonContractEvent,
    rawEventName: string,
  ): void {
    const diagnostic = this.buildDiagnostic(
      "UNKNOWN_EVENT_NAME",
      rawEventName,
      0,
      raw,
      [],
      [],
    );

    this.metrics.recordUnknownEvent(raw.contract_id, rawEventName);
    this.metrics.recordParserRejection(rawEventName, "UNKNOWN_EVENT_NAME");
    this.pushDiagnostic(diagnostic);
    this.pushWindowEntry("UNKNOWN_EVENT_NAME");

    this.logger.warn(
      `[schema-drift] UNKNOWN_EVENT_NAME contractId=${raw.contract_id} ` +
        `eventName=${rawEventName} pagingToken=${raw.paging_token}`,
    );

    this.maybeCaptureToSentry(diagnostic);
    this.maybeFireThresholdAlert();
  }

  /**
   * Called when required payload keys are absent from a known event type.
   * The event is rejected to protect analytics from stale/incomplete records.
   */
  recordFieldMismatch(
    eventName: SorobanEventType,
    schemaVersion: number,
    raw: RawHorizonContractEvent,
    missingFields: string[],
    unexpectedFields: string[],
  ): void {
    const diagnostic = this.buildDiagnostic(
      "FIELD_MISMATCH",
      eventName,
      schemaVersion,
      raw,
      missingFields,
      unexpectedFields,
    );

    this.metrics.recordFieldMismatch(eventName, schemaVersion, missingFields);
    this.metrics.recordParserRejection(eventName, "FIELD_MISMATCH");
    this.pushDiagnostic(diagnostic);
    this.pushWindowEntry("FIELD_MISMATCH");

    this.logger.warn(
      `[schema-drift] FIELD_MISMATCH eventName=${eventName} ` +
        `schemaVersion=${schemaVersion} missing=[${missingFields.join(",")}] ` +
        `pagingToken=${raw.paging_token}`,
    );

    this.maybeCaptureToSentry(diagnostic);
    this.maybeFireThresholdAlert();
  }

  /**
   * Called when extra, unexpected fields are present (forward-compat additions).
   * The event is still ingested but the anomaly is counted for monitoring.
   */
  recordUnexpectedFields(
    eventName: SorobanEventType,
    schemaVersion: number,
    raw: RawHorizonContractEvent,
    unexpectedFields: string[],
  ): void {
    this.metrics.recordUnexpectedFields(eventName, schemaVersion);

    this.logger.debug(
      `[schema-drift] UNEXPECTED_FIELDS eventName=${eventName} ` +
        `extra=[${unexpectedFields.join(",")}] pagingToken=${raw.paging_token}`,
    );
  }

  /**
   * Called when schema_version > MAX_SUPPORTED_SCHEMA_VERSION.
   */
  recordUnsupportedVersion(
    eventName: string,
    schemaVersion: number,
    raw: RawHorizonContractEvent,
  ): void {
    const diagnostic = this.buildDiagnostic(
      "UNSUPPORTED_VERSION",
      eventName,
      schemaVersion,
      raw,
      [],
      [],
    );

    this.metrics.recordUnknownSchemaVersion(eventName, schemaVersion);
    this.metrics.recordParserRejection(eventName, "UNSUPPORTED_VERSION");
    this.pushDiagnostic(diagnostic);
    this.pushWindowEntry("UNSUPPORTED_VERSION");

    this.logger.warn(
      `[schema-drift] UNSUPPORTED_VERSION eventName=${eventName} ` +
        `schemaVersion=${schemaVersion} pagingToken=${raw.paging_token}`,
    );

    this.maybeCaptureToSentry(diagnostic);
    this.maybeFireThresholdAlert();
  }

  /**
   * Called when schema_version is in range but not in compatibleVersions list.
   */
  recordIncompatibleVersion(
    eventName: string,
    schemaVersion: number,
    raw: RawHorizonContractEvent,
  ): void {
    const diagnostic = this.buildDiagnostic(
      "INCOMPATIBLE_VERSION",
      eventName,
      schemaVersion,
      raw,
      [],
      [],
    );

    this.metrics.recordParserRejection(eventName, "INCOMPATIBLE_VERSION");
    this.pushDiagnostic(diagnostic);
    this.pushWindowEntry("INCOMPATIBLE_VERSION");

    this.logger.warn(
      `[schema-drift] INCOMPATIBLE_VERSION eventName=${eventName} ` +
        `schemaVersion=${schemaVersion} pagingToken=${raw.paging_token}`,
    );

    this.maybeCaptureToSentry(diagnostic);
    this.maybeFireThresholdAlert();
  }

  /**
   * Called when XDR decode or any structural parse error occurs.
   */
  recordParseError(
    raw: RawHorizonContractEvent,
    errorMessage: string,
  ): void {
    const diagnostic = this.buildDiagnostic(
      "PARSE_ERROR",
      "unknown",
      0,
      raw,
      [],
      [],
    );

    this.metrics.recordParserRejection("unknown", "PARSE_ERROR");
    this.metrics.recordError("SorobanParser", "PARSE_ERROR");
    this.pushDiagnostic(diagnostic);
    this.pushWindowEntry("PARSE_ERROR");

    this.logger.warn(
      `[schema-drift] PARSE_ERROR pagingToken=${raw.paging_token} error=${errorMessage}`,
    );

    this.maybeFireThresholdAlert();
  }

  // ── Developer-facing health summary ────────────────────────────────────────

  /**
   * Returns a summary suitable for the /indexer/parser-health endpoint.
   * Includes recent rejection diagnostics and the windowed alert state.
   */
  getHealthSummary(): ParserHealthSummary {
    this.pruneWindow();
    const windowRejectCount = this.windowEntries.length;
    const alertFiring = windowRejectCount >= SchemaObservabilityService.ALERT_THRESHOLD;

    const byType = this.windowEntries.reduce<Record<string, number>>(
      (acc, e) => {
        acc[e.driftType] = (acc[e.driftType] ?? 0) + 1;
        return acc;
      },
      {},
    );

    return {
      status: alertFiring ? "degraded" : "healthy",
      alertFiring,
      windowMs: SchemaObservabilityService.WINDOW_MS,
      alertThreshold: SchemaObservabilityService.ALERT_THRESHOLD,
      windowRejectionCount: windowRejectCount,
      rejectionsByDriftType: byType,
      recentRejections: [...this.recentRejections],
    };
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private buildDiagnostic(
    driftType: DriftType,
    eventName: string,
    schemaVersion: number,
    raw: RawHorizonContractEvent,
    missingFields: string[],
    unexpectedFields: string[],
  ): ParserRejectionDiagnostic {
    return {
      detectedAt: new Date().toISOString(),
      driftType,
      contractId: raw.contract_id,
      eventName,
      schemaVersion,
      pagingToken: raw.paging_token,
      txHash: raw.transaction_hash,
      missingFields,
      unexpectedFields,
    };
  }

  private pushDiagnostic(d: ParserRejectionDiagnostic): void {
    this.recentRejections.push(d);
    // Trim to ring-buffer size
    if (this.recentRejections.length > MAX_DIAGNOSTIC_BUFFER) {
      this.recentRejections.shift();
    }
  }

  private pushWindowEntry(driftType: DriftType): void {
    this.pruneWindow();
    this.windowEntries.push({ timestamp: Date.now(), driftType });
  }

  private pruneWindow(): void {
    const cutoff = Date.now() - SchemaObservabilityService.WINDOW_MS;
    while (this.windowEntries.length > 0 && this.windowEntries[0].timestamp < cutoff) {
      this.windowEntries.shift();
    }
  }

  private maybeCaptureToSentry(d: ParserRejectionDiagnostic): void {
    try {
      this.sentry.captureMessage(
        `[schema-drift] ${d.driftType}: ${d.eventName}`,
        "warning",
        {
          driftType: d.driftType,
          contractId: d.contractId,
          eventName: d.eventName,
          schemaVersion: d.schemaVersion,
          pagingToken: d.pagingToken,
          txHash: d.txHash,
          missingFields: d.missingFields,
          unexpectedFields: d.unexpectedFields,
        },
      );
    } catch {
      // Sentry capture is non-fatal
    }
  }

  private maybeFireThresholdAlert(): void {
    this.pruneWindow();
    const count = this.windowEntries.length;
    if (count === SchemaObservabilityService.ALERT_THRESHOLD) {
      // Log exactly once when the threshold is first crossed in this window
      this.logger.error(
        `[schema-drift-alert] THRESHOLD EXCEEDED: ${count} rejections in the last ` +
          `${SchemaObservabilityService.WINDOW_MS / 1000}s. ` +
          `Investigate ingestion pipeline for contract schema changes.`,
      );

      try {
        this.sentry.captureMessage(
          `[schema-drift-alert] ${count} parser rejections in ${SchemaObservabilityService.WINDOW_MS / 1000}s`,
          "error",
          {
            windowRejectionCount: count,
            alertThreshold: SchemaObservabilityService.ALERT_THRESHOLD,
            windowMs: SchemaObservabilityService.WINDOW_MS,
          },
        );
      } catch {
        // Sentry capture is non-fatal
      }
    }
  }
}

// ── Public DTO for /indexer/parser-health ────────────────────────────────────

export interface ParserHealthSummary {
  status: "healthy" | "degraded";
  alertFiring: boolean;
  windowMs: number;
  alertThreshold: number;
  windowRejectionCount: number;
  rejectionsByDriftType: Record<string, number>;
  recentRejections: ParserRejectionDiagnostic[];
}
