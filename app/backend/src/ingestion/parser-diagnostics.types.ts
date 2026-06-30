/**
 * Diagnostic payload captured when the Soroban event parser rejects an event
 * due to schema drift (unknown event name, field mismatch, or unsupported
 * schema version).
 *
 * All values are safe for logging/Sentry — no private keys, wallet seed
 * phrases, or personally-identifying data are included.
 */
export interface ParserRejectionDiagnostic {
  /** ISO timestamp at the moment the rejection was recorded. */
  readonly detectedAt: string;

  /** Category of drift that caused the rejection. */
  readonly driftType: DriftType;

  /** Contract address the event arrived from. */
  readonly contractId: string;

  /** Event name symbol decoded from topic[1] (or topic[0] for legacy events). */
  readonly eventName: string;

  /** Schema version field extracted from the event payload (0 if absent). */
  readonly schemaVersion: number;

  /** Horizon paging token for the rejected event (stable cross-run reference). */
  readonly pagingToken: string;

  /** Transaction hash of the rejected event. */
  readonly txHash: string;

  /**
   * For FIELD_MISMATCH: sorted list of required payload keys that were absent.
   * For UNEXPECTED_FIELDS: sorted list of extra keys found in the payload.
   * Empty for other drift types.
   */
  readonly missingFields: readonly string[];
  readonly unexpectedFields: readonly string[];
}

export type DriftType =
  | "UNKNOWN_EVENT_NAME"   // topic symbol is not in the known schema registry
  | "FIELD_MISMATCH"       // required payload key is absent
  | "UNSUPPORTED_VERSION"  // schema_version > MAX_SUPPORTED_SCHEMA_VERSION
  | "INCOMPATIBLE_VERSION" // schema_version not in compatibleVersions list
  | "PARSE_ERROR";         // XDR decode or structural error

/** Ring-buffer of recent rejection diagnostics kept in memory. */
export const MAX_DIAGNOSTIC_BUFFER = 100;
