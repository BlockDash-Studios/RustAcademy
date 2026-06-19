import { Injectable, Logger } from "@nestjs/common";

import {
  RustAcademy_EVENT_SCHEMA_CONTRACTS,
  RustAcademy_EVENT_SCHEMA_VERSION,
  type EventSchemaContract,
} from "./event-schema";
import { MAX_SUPPORTED_SCHEMA_VERSION } from "./soroban-event.parser";

/**
 * Classification for why a parser rejected or flagged an event.
 */
export type DriftReason =
  | "unknown_event_name"     // topic[1] is not in the schema registry
  | "schema_version_too_high"  // schema_version > MAX_SUPPORTED_SCHEMA_VERSION
  | "incompatible_schema_version" // schema_version not in compatibleVersions list
  | "field_mismatch"           // parsed map is missing one or more expected payload keys
  | "topic_mismatch"           // canonical topic doesn't match the registry for that event name
  | "parse_error";             // XDR decode or structural error during parsing

export interface DriftEvent {
  reason: DriftReason;
  contractId: string;
  eventName: string;
  schemaVersion: number;
  /** Paging token (safe to log — no PII). */
  pagingToken: string;
  /**
   * Raw payload safe-digest: field names present in the on-chain map.
   * We never store raw values — only key names for schema comparison.
   */
  observedFields?: string[];
  /** Expected payload keys from the schema registry. */
  expectedFields?: string[];
  /** Missing fields relative to the schema contract. */
  missingFields?: string[];
  /** Extra fields present in the payload that aren't in the schema. */
  extraFields?: string[];
  /** ISO timestamp when this drift was recorded. */
  detectedAt: string;
}

export interface ParserHealthSnapshot {
  /** Rolling window (last 5 min) counters. */
  window: {
    processed: number;
    rejected: number;
    rejectionRate: number;
    unknownEventNames: number;
    fieldMismatches: number;
    parseErrors: number;
    schemaVersionTooHigh: number;
    incompatibleSchemaVersion: number;
    topicMismatches: number;
  };
  /** Cumulative totals since service start. */
  totals: {
    processed: number;
    rejected: number;
    unknownEventNames: number;
    fieldMismatches: number;
    parseErrors: number;
    schemaVersionTooHigh: number;
    incompatibleSchemaVersion: number;
    topicMismatches: number;
  };
  /** Known event names from the schema registry. */
  knownEventNames: string[];
  /** Current maximum supported schema version in this indexer. */
  maxSupportedSchemaVersion: number;
  /** Current canonical schema version in event-schema.ts. */
  currentSchemaVersion: number;
  /** Most recent drift events (up to 20, no raw payload values). */
  recentDriftEvents: DriftEvent[];
  /** ISO timestamp of the snapshot. */
  snapshotAt: string;
}

/** Rolling bucket: one entry per 30-second slot (10 slots = 5 min window). */
interface RollingBucket {
  slotMs: number;
  processed: number;
  rejected: number;
  unknownEventNames: number;
  fieldMismatches: number;
  parseErrors: number;
  schemaVersionTooHigh: number;
  incompatibleSchemaVersion: number;
  topicMismatches: number;
}

const SLOT_DURATION_MS = 30_000; // 30 s
const WINDOW_SLOTS = 10;         // 10 × 30 s = 5 min
const MAX_RECENT_DRIFT_EVENTS = 20;
const ALERT_REJECTION_THRESHOLD = 0.1; // 10 % rejection rate triggers a warning log

@Injectable()
export class ContractEventDriftService {
  private readonly logger = new Logger(ContractEventDriftService.name);

  // ── Cumulative totals ────────────────────────────────────────────────────
  private totalProcessed = 0;
  private totalRejected = 0;
  private totalUnknownEventNames = 0;
  private totalFieldMismatches = 0;
  private totalParseErrors = 0;
  private totalSchemaVersionTooHigh = 0;
  private totalIncompatibleSchemaVersion = 0;
  private totalTopicMismatches = 0;

  // ── Rolling window ───────────────────────────────────────────────────────
  private readonly buckets: RollingBucket[] = [];

  // ── Recent drift log ─────────────────────────────────────────────────────
  private readonly recentDriftEvents: DriftEvent[] = [];

  // ── Schema registry snapshot ─────────────────────────────────────────────
  private readonly knownEventNames: ReadonlySet<string> = new Set(
    Object.keys(RustAcademy_EVENT_SCHEMA_CONTRACTS),
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Public API called by the parser
  // ─────────────────────────────────────────────────────────────────────────

  /** Record a successfully parsed event (increments processed counter). */
  recordProcessed(): void {
    this.totalProcessed++;
    this.currentBucket().processed++;
  }

  /**
   * Record a drift / rejection event with full diagnostic context.
   * This is the primary entry-point used by `SorobanEventParser`.
   */
  recordDrift(event: Omit<DriftEvent, "detectedAt">): void {
    const driftEvent: DriftEvent = {
      ...event,
      detectedAt: new Date().toISOString(),
    };

    this.totalRejected++;
    this.currentBucket().rejected++;

    switch (event.reason) {
      case "unknown_event_name":
        this.totalUnknownEventNames++;
        this.currentBucket().unknownEventNames++;
        break;
      case "field_mismatch":
        this.totalFieldMismatches++;
        this.currentBucket().fieldMismatches++;
        break;
      case "parse_error":
        this.totalParseErrors++;
        this.currentBucket().parseErrors++;
        break;
      case "schema_version_too_high":
        this.totalSchemaVersionTooHigh++;
        this.currentBucket().schemaVersionTooHigh++;
        break;
      case "incompatible_schema_version":
        this.totalIncompatibleSchemaVersion++;
        this.currentBucket().incompatibleSchemaVersion++;
        break;
      case "topic_mismatch":
        this.totalTopicMismatches++;
        this.currentBucket().topicMismatches++;
        break;
    }

    // Append to recent drift ring-buffer
    this.recentDriftEvents.push(driftEvent);
    if (this.recentDriftEvents.length > MAX_RECENT_DRIFT_EVENTS) {
      this.recentDriftEvents.shift();
    }

    // Emit structured log so it's visible in monitoring aggregators
    this.logger.warn(
      `[schema-drift] reason=${event.reason} event=${event.eventName} ` +
        `contract=${event.contractId} schema_version=${event.schemaVersion} ` +
        `paging_token=${event.pagingToken}` +
        (event.missingFields?.length
          ? ` missing_fields=${event.missingFields.join(",")}`
          : "") +
        (event.extraFields?.length
          ? ` extra_fields=${event.extraFields.join(",")}`
          : ""),
    );

    // Alert if rolling window rejection rate exceeds threshold
    this.checkRejectionRateAlert();
  }

  /**
   * Compare observed payload field names against the schema contract for
   * a known event.  Returns a DriftEvent if mismatches are found, or null.
   */
  detectFieldDrift(
    eventName: string,
    contractId: string,
    pagingToken: string,
    schemaVersion: number,
    observedFields: string[],
  ): DriftEvent | null {
    const contract =
      RustAcademy_EVENT_SCHEMA_CONTRACTS[
        eventName as keyof typeof RustAcademy_EVENT_SCHEMA_CONTRACTS
      ];

    if (!contract) return null; // unknown event — handled separately

    const expectedPayloadKeys = new Set<string>(contract.payloadKeys);
    const observedSet = new Set(observedFields);

    const missingFields = [...expectedPayloadKeys].filter(
      (k) => !observedSet.has(k),
    );
    // Extra fields are informational (new fields added before schema bump)
    const extraFields = observedFields.filter((k) => !expectedPayloadKeys.has(k));

    if (missingFields.length > 0) {
      return {
        reason: "field_mismatch",
        contractId,
        eventName,
        schemaVersion,
        pagingToken,
        observedFields,
        expectedFields: [...expectedPayloadKeys],
        missingFields,
        extraFields,
        detectedAt: new Date().toISOString(),
      };
    }

    return null;
  }

  /**
   * Check whether an event name is in the schema registry.
   */
  isKnownEvent(eventName: string): boolean {
    return this.knownEventNames.has(eventName);
  }

  /**
   * Get the schema contract for an event name (or undefined).
   */
  getContract(
    eventName: string,
  ): EventSchemaContract | undefined {
    return RustAcademy_EVENT_SCHEMA_CONTRACTS[
      eventName as keyof typeof RustAcademy_EVENT_SCHEMA_CONTRACTS
    ] as EventSchemaContract | undefined;
  }

  /**
   * Build a developer-facing health snapshot.
   */
  getHealthSnapshot(): ParserHealthSnapshot {
    const window = this.computeWindowTotals();
    const rejected = window.rejected;
    const processed = window.processed;
    const rejectionRate =
      processed + rejected > 0 ? rejected / (processed + rejected) : 0;

    return {
      window: {
        ...window,
        rejectionRate: Math.round(rejectionRate * 10_000) / 100, // percentage, 2 dp
      },
      totals: {
        processed: this.totalProcessed,
        rejected: this.totalRejected,
        unknownEventNames: this.totalUnknownEventNames,
        fieldMismatches: this.totalFieldMismatches,
        parseErrors: this.totalParseErrors,
        schemaVersionTooHigh: this.totalSchemaVersionTooHigh,
        incompatibleSchemaVersion: this.totalIncompatibleSchemaVersion,
        topicMismatches: this.totalTopicMismatches,
      },
      knownEventNames: [...this.knownEventNames],
      maxSupportedSchemaVersion: MAX_SUPPORTED_SCHEMA_VERSION,
      currentSchemaVersion: RustAcademy_EVENT_SCHEMA_VERSION,
      recentDriftEvents: [...this.recentDriftEvents],
      snapshotAt: new Date().toISOString(),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────

  private currentBucket(): RollingBucket {
    const now = Date.now();
    const slotMs = now - (now % SLOT_DURATION_MS);

    const last = this.buckets[this.buckets.length - 1];
    if (last && last.slotMs === slotMs) {
      return last;
    }

    // Prune expired buckets
    const cutoff = slotMs - SLOT_DURATION_MS * WINDOW_SLOTS;
    while (this.buckets.length > 0 && this.buckets[0].slotMs < cutoff) {
      this.buckets.shift();
    }

    const bucket: RollingBucket = {
      slotMs,
      processed: 0,
      rejected: 0,
      unknownEventNames: 0,
      fieldMismatches: 0,
      parseErrors: 0,
      schemaVersionTooHigh: 0,
      incompatibleSchemaVersion: 0,
      topicMismatches: 0,
    };
    this.buckets.push(bucket);
    return bucket;
  }

  private computeWindowTotals(): Omit<RollingBucket, "slotMs"> {
    const now = Date.now();
    const cutoff = now - SLOT_DURATION_MS * WINDOW_SLOTS;

    const totals: Omit<RollingBucket, "slotMs"> = {
      processed: 0,
      rejected: 0,
      unknownEventNames: 0,
      fieldMismatches: 0,
      parseErrors: 0,
      schemaVersionTooHigh: 0,
      incompatibleSchemaVersion: 0,
      topicMismatches: 0,
    };

    for (const bucket of this.buckets) {
      if (bucket.slotMs >= cutoff) {
        totals.processed += bucket.processed;
        totals.rejected += bucket.rejected;
        totals.unknownEventNames += bucket.unknownEventNames;
        totals.fieldMismatches += bucket.fieldMismatches;
        totals.parseErrors += bucket.parseErrors;
        totals.schemaVersionTooHigh += bucket.schemaVersionTooHigh;
        totals.incompatibleSchemaVersion += bucket.incompatibleSchemaVersion;
        totals.topicMismatches += bucket.topicMismatches;
      }
    }

    return totals;
  }

  private checkRejectionRateAlert(): void {
    const window = this.computeWindowTotals();
    const total = window.processed + window.rejected;
    if (total < 20) return; // too few events to be meaningful

    const rate = window.rejected / total;
    if (rate >= ALERT_REJECTION_THRESHOLD) {
      this.logger.error(
        `[schema-drift-alert] Rejection rate=${(rate * 100).toFixed(1)}% ` +
          `exceeds threshold=${ALERT_REJECTION_THRESHOLD * 100}% ` +
          `(${window.rejected}/${total} events in last 5 min). ` +
          `unknown_names=${window.unknownEventNames} ` +
          `field_mismatches=${window.fieldMismatches} ` +
          `parse_errors=${window.parseErrors}`,
      );
    }
  }
}
