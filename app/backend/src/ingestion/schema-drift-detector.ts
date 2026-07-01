import { xdr, scValToNative } from "@stellar/stellar-sdk";
import {
  RustAcademy_EVENT_SCHEMA_CONTRACTS,
} from "./event-schema";
import type { SorobanEventType } from "./types/contract-event.types";
import type { DriftType } from "./parser-diagnostics.types";

export interface FieldDriftResult {
  driftType: DriftType | null;
  missingFields: string[];
  unexpectedFields: string[];
}

/**
 * SchemaDriftDetector compares a live event's decoded payload map against
 * the canonical schema metadata in RustAcademy_EVENT_SCHEMA_CONTRACTS.
 *
 * It operates purely on already-decoded XDR data so it never throws and
 * never touches private key material.
 */
export class SchemaDriftDetector {
  /**
   * Validate the set of keys present in the event's data map against the
   * expected payload keys for the given event type.
   *
   * Returns a FieldDriftResult whose `driftType` is:
   *  - `FIELD_MISMATCH`   — one or more required keys are absent
   *  - `null`             — no drift detected (unexpected extra keys are
   *                         reported but do NOT trigger a rejection — they are
   *                         forward-compat additions from a newer contract)
   *
   * Extra keys are reported separately in `unexpectedFields` so callers can
   * emit an informational metric without blocking ingestion.
   */
  detectFieldDrift(
    eventName: SorobanEventType,
    dataMap: Record<string, xdr.ScVal>,
  ): FieldDriftResult {
    const contract =
      RustAcademy_EVENT_SCHEMA_CONTRACTS[
        eventName as keyof typeof RustAcademy_EVENT_SCHEMA_CONTRACTS
      ];

    if (!contract) {
      // Unknown event — handled by a different code path in the parser.
      return { driftType: null, missingFields: [], unexpectedFields: [] };
    }

    const expectedKeys = new Set(contract.payloadKeys as readonly string[]);
    const actualKeys = new Set(Object.keys(dataMap));

    const missingFields: string[] = [];
    for (const key of expectedKeys) {
      // schema_version and ledger_sequence are optional in v1 legacy events;
      // treat their absence as acceptable so we don't reject every legacy event.
      if (key === "schema_version" || key === "ledger_sequence") continue;
      if (!actualKeys.has(key)) {
        missingFields.push(key);
      }
    }

    const unexpectedFields: string[] = [];
    for (const key of actualKeys) {
      if (!expectedKeys.has(key)) {
        unexpectedFields.push(key);
      }
    }

    missingFields.sort();
    unexpectedFields.sort();

    return {
      driftType: missingFields.length > 0 ? "FIELD_MISMATCH" : null,
      missingFields,
      unexpectedFields,
    };
  }

  /**
   * Decode a Soroban map ScVal into a plain Record keyed by symbol string.
   * Returns an empty object on any decode error so callers can treat it as
   * an empty payload rather than throwing.
   */
  decodeToMap(data: xdr.ScVal): Record<string, xdr.ScVal> {
    try {
      const result: Record<string, xdr.ScVal> = {};
      const mapEntries = data.map();
      for (const entry of mapEntries) {
        const key = entry.key().sym().toString();
        result[key] = entry.val();
      }
      return result;
    } catch {
      return {};
    }
  }

  /**
   * Extract a raw payload snapshot safe for diagnostic logging.
   * Limits to the first 50 keys and truncates string values > 120 chars.
   */
  extractSafePayloadSnapshot(
    data: xdr.ScVal,
  ): Record<string, string> {
    try {
      const map = this.decodeToMap(data);
      const snapshot: Record<string, string> = {};
      let count = 0;

      for (const [key, val] of Object.entries(map)) {
        if (count++ >= 50) break;
        try {
          const native = scValToNative(val);
          const str =
            typeof native === "bigint"
              ? native.toString()
              : JSON.stringify(native);
          snapshot[key] = str.length > 120 ? str.slice(0, 120) + "…" : str;
        } catch {
          snapshot[key] = "<undecodable>";
        }
      }

      return snapshot;
    } catch {
      return {};
    }
  }
}
