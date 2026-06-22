import { Injectable, Logger, Optional } from "@nestjs/common";
import { xdr, scValToNative, Address } from "@stellar/stellar-sdk";

import type {
  RustAcademyContractEvent,
  SorobanEventType,
  EscrowDepositedEvent,
  EscrowWithdrawnEvent,
  EscrowRefundedEvent,
  PrivacyToggledEvent,
  ContractPausedEvent,
  AdminChangedEvent,
  ContractUpgradedEvent,
  EphemeralKeyRegisteredEvent,
  StealthWithdrawnEvent,
} from "./types/contract-event.types";
import {
  RustAcademy_EVENT_SCHEMA_CONTRACTS,
  RustAcademy_EVENT_TOPICS,
  type RustAcademyEventTopic,
} from "./event-schema";
import type { ContractEventDriftService } from "./contract-event-drift.service";

/** Maximum schema version this indexer understands. */
export const MAX_SUPPORTED_SCHEMA_VERSION = 2;

export type UnknownSchemaVersionHandler = (
  eventName: SorobanEventType,
  schemaVersion: number,
  pagingToken: string,
) => void;

/**
 * Raw Horizon contract event record shape (subset we need).
 */
export interface RawHorizonContractEvent {
  id: string;
  paging_token: string;
  transaction_hash: string;
  ledger: number;
  created_at: string; // ISO date string from Horizon
  contract_id: string;
  type: string;
  topic: string[]; // base64-encoded XDR ScVal strings
  value: { xdr: string }; // base64-encoded XDR ScVal
}

interface TopicLayout {
  eventName: SorobanEventType;
  topicNamespace: RustAcademyEventTopic | "LEGACY";
  indexedOffset: number;
}

/**
 * Parses raw Horizon Soroban contract event records into typed domain events.
 *
 * Canonical topic layout:
 *  Topic[0] = stable  RustAcademy testnet namespace (for example TOPIC_ESCROW)
 *  Topic[1] = event name symbol
 *  Topic[2+] = indexed fields (commitment, owner, admin, etc.)
 *
 * Data = struct with remaining fields encoded as XDR ScVal.
 *
 * Legacy events used Topic[0] = event name. The parser keeps a compatibility
 * path for those events and marks them with schemaVersion=1.
 */
@Injectable()
export class SorobanEventParser {
  private readonly logger = new Logger(SorobanEventParser.name);

  constructor(
    @Optional() private readonly onUnknownSchemaVersion?: UnknownSchemaVersionHandler,
    @Optional() private readonly driftService?: ContractEventDriftService,
  ) {}

  /**
   * Attempt to parse a raw Horizon contract event.
   * Returns null when the event is unrecognised, malformed, or carries an
   * unsupported schema version.
   *
   * All rejection paths are recorded in `ContractEventDriftService` so they
   * are visible in monitoring and the parser health endpoint.
   */
  parse(raw: RawHorizonContractEvent): RustAcademyContractEvent | null {
    try {
      const topics = raw.topic.map((t) => xdr.ScVal.fromXDR(t, "base64"));
      const dataVal = xdr.ScVal.fromXDR(raw.value.xdr, "base64");

      if (topics.length === 0) {
        this.driftService?.recordDrift({
          reason: "parse_error",
          contractId: raw.contract_id,
          eventName: "unknown",
          schemaVersion: 0,
          pagingToken: raw.paging_token,
        });
        return null;
      }

      const layout = this.resolveTopicLayout(topics);

      if (!layout) {
        // Classify: is the first topic symbol a recognisable name that's just
        // in the wrong namespace, or is it truly unknown?
        const firstSym = this.decodeSymbol(topics[0]);
        const secondSym = topics[1] ? this.decodeSymbol(topics[1]) : null;

        // Canonical layout: topic[0]=namespace, topic[1]=eventName
        const canonicalTopics = new Set<string>(Object.values(RustAcademy_EVENT_TOPICS));
        if (firstSym && canonicalTopics.has(firstSym) && secondSym) {
          // Namespace matched but event name is not in the registry
          if (!this.driftService?.isKnownEvent(secondSym)) {
            this.driftService?.recordDrift({
              reason: "unknown_event_name",
              contractId: raw.contract_id,
              eventName: secondSym,
              schemaVersion: 0,
              pagingToken: raw.paging_token,
            });
          } else {
            // Topic mismatch: event name is known but under a different topic
            const contract = this.driftService?.getContract(secondSym);
            if (contract) {
              this.driftService?.recordDrift({
                reason: "topic_mismatch",
                contractId: raw.contract_id,
                eventName: secondSym,
                schemaVersion: 0,
                pagingToken: raw.paging_token,
              });
            }
          }
        } else if (firstSym && !this.driftService?.isKnownEvent(firstSym)) {
          // Legacy layout attempt: topic[0] = event name, but it's not known
          this.driftService?.recordDrift({
            reason: "unknown_event_name",
            contractId: raw.contract_id,
            eventName: firstSym ?? "unknown",
            schemaVersion: 0,
            pagingToken: raw.paging_token,
          });
        }
        return null;
      }

      const schemaVersion = this.extractSchemaVersionFromData(dataVal);

      if (schemaVersion > MAX_SUPPORTED_SCHEMA_VERSION) {
        this.logger.warn(
          `Skipping event ${layout.eventName} paging_token=${raw.paging_token}: ` +
            `schema_version=${schemaVersion} exceeds max supported (${MAX_SUPPORTED_SCHEMA_VERSION})`,
        );
        this.onUnknownSchemaVersion?.(
          layout.eventName,
          schemaVersion,
          raw.paging_token,
        );
        this.driftService?.recordDrift({
          reason: "schema_version_too_high",
          contractId: raw.contract_id,
          eventName: layout.eventName,
          schemaVersion,
          pagingToken: raw.paging_token,
        });
        return null;
      }

      if (!this.isCompatibleSchemaVersion(layout.eventName, schemaVersion)) {
        this.logger.warn(
          `Unsupported ${layout.eventName} schema version ${schemaVersion}`,
        );
        this.driftService?.recordDrift({
          reason: "incompatible_schema_version",
          contractId: raw.contract_id,
          eventName: layout.eventName,
          schemaVersion,
          pagingToken: raw.paging_token,
        });
        return null;
      }

      const contractLedgerSequence = this.extractLedgerSequenceFromData(dataVal);
      if (
        contractLedgerSequence !== undefined &&
        contractLedgerSequence !== raw.ledger
      ) {
        this.logger.warn(
          `Replay metadata mismatch for ${layout.eventName} paging_token=${raw.paging_token}: ` +
            `contract_ledger_sequence=${contractLedgerSequence} but Horizon ledger=${raw.ledger}. ` +
            `Event will still be parsed; investigate potential replay tampering.`,
        );
      }

      const base = {
        schemaVersion,
        topicNamespace: layout.topicNamespace,
        txHash: raw.transaction_hash,
        ledgerSequence: raw.ledger,
        pagingToken: raw.paging_token,
        contractTimestamp: this.extractTimestampFromData(dataVal),
        contractLedgerSequence,
      };

      let parsed: RustAcademyContractEvent | null = null;

      switch (layout.eventName) {
        case "EscrowDeposited":
          parsed = this.parseEscrowDeposited(
            topics,
            dataVal,
            base,
            layout.indexedOffset,
          );
          break;
        case "EscrowWithdrawn":
          parsed = this.parseEscrowWithdrawn(
            topics,
            dataVal,
            base,
            layout.indexedOffset,
          );
          break;
        case "EscrowRefunded":
          parsed = this.parseEscrowRefunded(
            topics,
            dataVal,
            base,
            layout.indexedOffset,
          );
          break;
        case "PrivacyToggled":
          parsed = this.parsePrivacyToggled(
            topics,
            dataVal,
            base,
            layout.indexedOffset,
          );
          break;
        case "ContractPaused":
          parsed = this.parseContractPaused(
            topics,
            dataVal,
            base,
            layout.indexedOffset,
          );
          break;
        case "AdminChanged":
          parsed = this.parseAdminChanged(
            topics,
            dataVal,
            base,
            layout.indexedOffset,
          );
          break;
        case "ContractUpgraded":
          parsed = this.parseContractUpgraded(
            topics,
            dataVal,
            base,
            layout.indexedOffset,
          );
          break;
        case "EphemeralKeyRegistered":
          parsed = this.parseEphemeralKeyRegistered(
            topics,
            dataVal,
            base,
            layout.indexedOffset,
          );
          break;
        case "StealthWithdrawn":
          parsed = this.parseStealthWithdrawn(
            topics,
            dataVal,
            base,
            layout.indexedOffset,
          );
          break;
        default:
          this.logger.debug(`Unrecognised event name: ${layout.eventName}`);
          return null;
      }

      if (parsed !== null) {
        this.driftService?.recordProcessed();
      }

      return parsed;
    } catch (err) {
      this.logger.warn(
        `Failed to parse contract event ${raw.paging_token}: ${(err as Error).message}`,
      );
      this.driftService?.recordDrift({
        reason: "parse_error",
        contractId: raw.contract_id,
        eventName: "unknown",
        schemaVersion: 0,
        pagingToken: raw.paging_token,
      });
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Escrow event parsers
  // ---------------------------------------------------------------------------

  private parseEscrowDeposited(
    topics: xdr.ScVal[],
    data: xdr.ScVal,
    base: Omit<
      EscrowDepositedEvent,
      | "eventType"
      | "commitment"
      | "owner"
      | "token"
      | "amount"
      | "amountPaid"
      | "expiresAt"
    >,
    indexedOffset: number,
  ): EscrowDepositedEvent {
    const commitment = this.decodeBytes32Hex(topics[indexedOffset]);
    const owner = this.decodeAddress(topics[indexedOffset + 1]);
    const map = this.dataToMap(data);

    return {
      eventType: "EscrowDeposited",
      ...base,
      commitment,
      owner,
      token: this.decodeAddress(map["token"]),
      amount: BigInt(scValToNative(map["amount_due"] ?? map["amount"])),
      amountPaid: BigInt(scValToNative(map["amount_paid"] ?? map["amount"])),
      expiresAt: BigInt(scValToNative(map["expires_at"])),
    };
  }

  private parseEscrowWithdrawn(
    topics: xdr.ScVal[],
    data: xdr.ScVal,
    base: Omit<
      EscrowWithdrawnEvent,
      "eventType" | "commitment" | "owner" | "token" | "amount"
    >,
    indexedOffset: number,
  ): EscrowWithdrawnEvent {
    const commitment = this.decodeBytes32Hex(topics[indexedOffset]);
    const owner = this.decodeAddress(topics[indexedOffset + 1]);
    const map = this.dataToMap(data);

    return {
      eventType: "EscrowWithdrawn",
      ...base,
      commitment,
      owner,
      token: this.decodeAddress(map["token"]),
      amount: BigInt(scValToNative(map["amount"])),
    };
  }

  private parseEscrowRefunded(
    topics: xdr.ScVal[],
    data: xdr.ScVal,
    base: Omit<
      EscrowRefundedEvent,
      "eventType" | "commitment" | "owner" | "token" | "amount"
    >,
    indexedOffset: number,
  ): EscrowRefundedEvent {
    const commitment = this.decodeBytes32Hex(topics[indexedOffset]);
    const owner = this.decodeAddress(topics[indexedOffset + 1]);
    const map = this.dataToMap(data);

    return {
      eventType: "EscrowRefunded",
      ...base,
      commitment,
      owner,
      token: this.decodeAddress(map["token"]),
      amount: BigInt(scValToNative(map["amount"])),
    };
  }

  // ---------------------------------------------------------------------------
  // Admin / Privacy event parsers
  // ---------------------------------------------------------------------------

  private parsePrivacyToggled(
    topics: xdr.ScVal[],
    data: xdr.ScVal,
    base: Omit<PrivacyToggledEvent, "eventType" | "owner" | "enabled">,
    indexedOffset: number,
  ): PrivacyToggledEvent {
    const owner = this.decodeAddress(topics[indexedOffset]);
    const map = this.dataToMap(data);

    return {
      eventType: "PrivacyToggled",
      ...base,
      owner,
      enabled: Boolean(scValToNative(map["enabled"])),
    };
  }

  private parseContractPaused(
    topics: xdr.ScVal[],
    data: xdr.ScVal,
    base: Omit<ContractPausedEvent, "eventType" | "admin" | "paused">,
    indexedOffset: number,
  ): ContractPausedEvent {
    const admin = this.decodeAddress(topics[indexedOffset]);
    const map = this.dataToMap(data);

    return {
      eventType: "ContractPaused",
      ...base,
      admin,
      paused: Boolean(scValToNative(map["paused"])),
    };
  }

  private parseAdminChanged(
    topics: xdr.ScVal[],
    data: xdr.ScVal,
    base: Omit<AdminChangedEvent, "eventType" | "oldAdmin" | "newAdmin">,
    indexedOffset: number,
  ): AdminChangedEvent {
    const oldAdmin = this.decodeAddress(topics[indexedOffset]);
    const newAdmin = this.decodeAddress(topics[indexedOffset + 1]);

    return {
      eventType: "AdminChanged",
      ...base,
      oldAdmin,
      newAdmin,
    };
  }

  private parseContractUpgraded(
    topics: xdr.ScVal[],
    data: xdr.ScVal,
    base: Omit<ContractUpgradedEvent, "eventType" | "newWasmHash" | "admin">,
    indexedOffset: number,
  ): ContractUpgradedEvent {
    const newWasmHash = this.decodeBytes32Hex(topics[indexedOffset]);
    const admin = this.decodeAddress(topics[indexedOffset + 1]);

    return {
      eventType: "ContractUpgraded",
      ...base,
      newWasmHash,
      admin,
    };
  }

  // ---------------------------------------------------------------------------
  // Stealth address event parsers (Privacy v2 – Issue #157)
  // ---------------------------------------------------------------------------

  private parseEphemeralKeyRegistered(
    topics: xdr.ScVal[],
    data: xdr.ScVal,
    base: Omit<
      EphemeralKeyRegisteredEvent,
      | "eventType"
      | "stealthAddress"
      | "ephPub"
      | "token"
      | "amount"
      | "expiresAt"
    >,
    indexedOffset: number,
  ): EphemeralKeyRegisteredEvent {
    const stealthAddress = this.decodeBytes32Hex(topics[indexedOffset]);
    const ephPub = this.decodeBytes32Hex(topics[indexedOffset + 1]);
    const map = this.dataToMap(data);

    return {
      eventType: "EphemeralKeyRegistered",
      ...base,
      stealthAddress,
      ephPub,
      token: this.decodeAddress(map["token"]),
      amount: BigInt(scValToNative(map["amount_due"] ?? map["amount"])),
      expiresAt: BigInt(scValToNative(map["expires_at"])),
    };
  }

  private parseStealthWithdrawn(
    topics: xdr.ScVal[],
    data: xdr.ScVal,
    base: Omit<
      StealthWithdrawnEvent,
      "eventType" | "stealthAddress" | "recipient" | "token" | "amount"
    >,
    indexedOffset: number,
  ): StealthWithdrawnEvent {
    const stealthAddress = this.decodeBytes32Hex(topics[indexedOffset]);
    const recipient = this.decodeAddress(topics[indexedOffset + 1]);
    const map = this.dataToMap(data);

    return {
      eventType: "StealthWithdrawn",
      ...base,
      stealthAddress,
      recipient,
      token: this.decodeAddress(map["token"]),
      amount: BigInt(scValToNative(map["amount"])),
    };
  }

  // ---------------------------------------------------------------------------
  // XDR decode helpers
  // ---------------------------------------------------------------------------

  private decodeSymbol(val: xdr.ScVal): string | null {
    try {
      return val.sym().toString();
    } catch {
      return null;
    }
  }

  private resolveTopicLayout(topics: xdr.ScVal[]): TopicLayout | null {
    const first = this.decodeSymbol(topics[0]);
    if (!first) return null;

    const canonicalTopics = new Set<string>(
      Object.values(RustAcademy_EVENT_TOPICS),
    );
    if (canonicalTopics.has(first)) {
      const second = topics[1] ? this.decodeSymbol(topics[1]) : null;
      if (!second || !(second in RustAcademy_EVENT_SCHEMA_CONTRACTS))
        return null;

      const contract =
        RustAcademy_EVENT_SCHEMA_CONTRACTS[
          second as keyof typeof RustAcademy_EVENT_SCHEMA_CONTRACTS
        ];
      if (contract.topic !== first) return null;

      return {
        eventName: second as SorobanEventType,
        topicNamespace: first as RustAcademyEventTopic,
        indexedOffset: 2,
      };
    }

    if (first in RustAcademy_EVENT_SCHEMA_CONTRACTS) {
      return {
        eventName: first as SorobanEventType,
        topicNamespace: "LEGACY",
        indexedOffset: 1,
      };
    }

    return null;
  }

  private isCompatibleSchemaVersion(
    eventName: SorobanEventType,
    schemaVersion: number,
  ): boolean {
    const contract =
      RustAcademy_EVENT_SCHEMA_CONTRACTS[
        eventName as keyof typeof RustAcademy_EVENT_SCHEMA_CONTRACTS
      ];

    return (contract.compatibleVersions as readonly number[]).includes(
      schemaVersion,
    );
  }

  private decodeAddress(val: xdr.ScVal): string {
    const native = scValToNative(val);
    if (typeof native === "string") return native;
    // It may already be an Address object
    return Address.fromScVal(val).toString();
  }

  private decodeBytes32Hex(val: xdr.ScVal): string {
    const bytes: Buffer = scValToNative(val);
    return bytes.toString("hex");
  }

  /**
   * Converts a Soroban map ScVal into a plain JS Record keyed by field name.
   */
  private dataToMap(data: xdr.ScVal): Record<string, xdr.ScVal> {
    const result: Record<string, xdr.ScVal> = {};
    const mapEntries = data.map();

    for (const entry of mapEntries) {
      const key = entry.key().sym().toString();
      result[key] = entry.val();
    }

    return result;
  }

  /**
   * Extract only the field *names* from an XDR map (no values).
   * Used for schema drift detection — we never log raw payload values.
   */
  private extractFieldNames(data: xdr.ScVal): string[] {
    try {
      const mapEntries = data.map();
      return mapEntries.map((entry) => entry.key().sym().toString());
    } catch {
      return [];
    }
  }

  private extractSchemaVersionFromData(data: xdr.ScVal): number {
    try {
      const map = this.dataToMap(data);
      if (map["schema_version"]) {
        return Number(scValToNative(map["schema_version"]));
      }
    } catch {
      // Legacy events did not include schema_version.
    }
    return 1;
  }

  private extractTimestampFromData(data: xdr.ScVal): bigint {
    try {
      const map = this.dataToMap(data);
      if (map["timestamp"]) {
        return BigInt(scValToNative(map["timestamp"]));
      }
    } catch {
      // ignore
    }
    return 0n;
  }

  /**
   * Extracts the `ledger_sequence` replay metadata field from the event payload.
   *
   * This field is emitted by the contract via `env.ledger().sequence()` and lets
   * the backend cross-validate the contract-reported ledger against the
   * Horizon-reported ledger for tamper / mis-routing detection.
   *
   * Returns `undefined` for legacy v1 events that pre-date this field.
   */
  private extractLedgerSequenceFromData(data: xdr.ScVal): number | undefined {
    try {
      const map = this.dataToMap(data);
      if (map["ledger_sequence"]) {
        return Number(scValToNative(map["ledger_sequence"]));
      }
    } catch {
      // Optional field — absent in legacy v1 events
    }
    return undefined;
  }
}
