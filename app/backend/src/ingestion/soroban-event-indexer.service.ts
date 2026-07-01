import { Injectable, Logger } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";

import { AppConfigService } from "../config";
import { HORIZON_BASE_URLS } from "../config/stellar.config";
import { MetricsService } from "../metrics/metrics.service";
import {
  SorobanEventParser,
  RawHorizonContractEvent,
} from "./soroban-event.parser";
import { IndexerCheckpointRepository, IndexMode } from "./indexer-checkpoint.repository";
import { EscrowEventRepository } from "./escrow-event.repository";
import { PrivacyEventRepository } from "./privacy-event.repository";
import { AdminEventRepository } from "./admin-event.repository";
import { StealthEventRepository } from "./stealth-event.repository";
import { SchemaObservabilityService } from "./schema-observability.service";
import type { RustAcademyContractEvent } from "./types/contract-event.types";

const PAGE_LIMIT = 200;
const MAX_RETRIES = 5;
const INITIAL_BACKOFF_MS = 1000;

export interface LedgerRangeResult {
  fromLedger: number;
  toLedger: number;
  processed: number;
  persisted: number;
  skippedUnknownSchema: number;
}

export interface DualReadConfig {
  previousContractId?: string;
  effectiveLedger?: number;
  effectiveTime?: Date;
}

@Injectable()
export class SorobanEventIndexerService {
  private readonly logger = new Logger(SorobanEventIndexerService.name);
  private readonly horizonUrl: string;
  private readonly parser: SorobanEventParser;

  constructor(
    private readonly config: AppConfigService,
    private readonly checkpointRepo: IndexerCheckpointRepository,
    private readonly escrowRepo: EscrowEventRepository,
    private readonly privacyRepo: PrivacyEventRepository,
    private readonly adminRepo: AdminEventRepository,
    private readonly stealthRepo: StealthEventRepository,
    private readonly metrics: MetricsService,
    private readonly eventEmitter: EventEmitter2,
    private readonly schemaObservability: SchemaObservabilityService,
  ) {
    this.horizonUrl = HORIZON_BASE_URLS[this.config.network];

    this.parser = new SorobanEventParser(
      (eventName, version, pagingToken) => {
        this.logger.warn(
          `Unknown schema_version=${version} for event ${eventName} paging_token=${pagingToken}`,
        );
        this.metrics.recordUnknownSchemaVersion(eventName, version);
      },
      {
        onUnknownSchemaVersion: (eventName, version, pagingToken) => {
          // Build a minimal synthetic raw for diagnostics
          this.schemaObservability.recordUnsupportedVersion(
            eventName,
            version,
            { paging_token: pagingToken } as RawHorizonContractEvent,
          );
        },
        onUnknownEvent: (raw, rawEventName) => {
          this.schemaObservability.recordUnknownEvent(raw, rawEventName);
        },
        onFieldMismatch: (eventName, schemaVersion, raw, missingFields, unexpectedFields) => {
          this.schemaObservability.recordFieldMismatch(
            eventName,
            schemaVersion,
            raw,
            missingFields,
            unexpectedFields,
          );
        },
        onUnexpectedFields: (eventName, schemaVersion, raw, unexpectedFields) => {
          this.schemaObservability.recordUnexpectedFields(
            eventName,
            schemaVersion,
            raw,
            unexpectedFields,
          );
        },
        onIncompatibleVersion: (eventName, schemaVersion, raw) => {
          this.schemaObservability.recordIncompatibleVersion(
            eventName,
            schemaVersion,
            raw,
          );
        },
        onParseError: (raw, errorMessage) => {
          this.schemaObservability.recordParseError(raw, errorMessage);
        },
      },
    );
  }

  async indexLedgerRange(
    contractId: string,
    fromLedger: number,
    toLedger: number,
    dualReadConfig?: DualReadConfig,
    force = false,
  ): Promise<LedgerRangeResult> {
    const network = this.config.network;
    let processed = 0;
    let persisted = 0;
    let skippedUnknownSchema = 0;

    const inDualReadWindow = this.isInDualReadWindow(fromLedger, dualReadConfig);

    if (inDualReadWindow && dualReadConfig?.previousContractId) {
      const mode: IndexMode = "dual-read-previous";
      const prevResult = await this.runIndexingEngine(
        dualReadConfig.previousContractId,
        fromLedger,
        dualReadConfig.effectiveLedger ?? toLedger,
        network,
        mode,
        force
      );
      processed += prevResult.processed;
      persisted += prevResult.persisted;
      skippedUnknownSchema += prevResult.skippedUnknownSchema;
    }

    const currentMode: IndexMode = inDualReadWindow ? "dual-read-current" : "normal";
    const currentResult = await this.runIndexingEngine(
      contractId,
      fromLedger,
      toLedger,
      network,
      currentMode,
      force
    );

    processed += currentResult.processed;
    persisted += currentResult.persisted;
    skippedUnknownSchema += currentResult.skippedUnknownSchema;

    return {
      fromLedger,
      toLedger,
      processed,
      persisted,
      skippedUnknownSchema,
    };
  }

  private async runIndexingEngine(
    contractId: string,
    fromLedger: number,
    toLedger: number,
    network: string,
    mode: IndexMode,
    force: boolean
  ) {
    let currentCursor: string | null = null;
    let startLedgerValue = fromLedger;

    if (!force) {
      const checkpoint = await this.checkpointRepo.getCheckpoint(contractId, network, mode);
      if (checkpoint) {
        if (checkpoint.lastLedger >= toLedger && !checkpoint.pagingToken) {
          this.logger.log(`Range [${fromLedger}, ${toLedger}] already fully indexed for stream ${mode}.`);
          return { processed: 0, persisted: 0, skippedUnknownSchema: 0 };
        }
        startLedgerValue = checkpoint.lastLedger;
        currentCursor = checkpoint.pagingToken;
      }
    }

    return this.indexContractWithCursor(contractId, startLedgerValue, toLedger, network, mode, currentCursor);
  }

  private async indexContractWithCursor(
    contractId: string,
    fromLedger: number,
    toLedger: number,
    network: string,
    mode: IndexMode,
    cursor: string | null,
  ): Promise<{ processed: number; persisted: number; skippedUnknownSchema: number }> {
    let processed = 0;
    let persisted = 0;
    let skippedUnknownSchema = 0;
    let nextCursor: string | undefined = cursor || undefined;

    while (true) {
      const { records, nextCursor: returnedCursor } = await this.fetchPageWithRetry(
        contractId,
        fromLedger,
        toLedger,
        nextCursor,
      );

      if (records.length === 0) break;

      for (const raw of records) {
        processed++;
        const event = this.parser.parse(raw);

        if (!event) {
          skippedUnknownSchema++;
          continue;
        }

        await this.persistEvent(event);
        persisted++;
        this.eventEmitter.emit(`stellar.${event.eventType}`, event);
      }

      const lastRecord = records[records.length - 1];
      if (lastRecord) {
        nextCursor = returnedCursor;
        await this.checkpointRepo.saveCheckpoint({
          contractId,
          network,
          mode,
          lastLedger: lastRecord.ledger,
          pagingToken: nextCursor || null,
        });
      }

      if (!returnedCursor || records.length < PAGE_LIMIT) break;
    }

    await this.checkpointRepo.saveCheckpoint({
      contractId,
      network,
      mode,
      lastLedger: toLedger,
      pagingToken: null,
    });

    return { processed, persisted, skippedUnknownSchema };
  }

  private async fetchPageWithRetry(
    contractId: string,
    fromLedger: number,
    toLedger: number,
    cursor?: string,
  ): Promise<{ records: RawHorizonContractEvent[]; nextCursor: string | undefined }> {
    let attempts = 0;
    while (attempts < MAX_RETRIES) {
      try {
        const startTime = Date.now();
        const url = new URL(`${this.horizonUrl}/contract_events`);
        url.searchParams.set("contract_id", contractId);
        url.searchParams.set("start_ledger", String(fromLedger));
        url.searchParams.set("end_ledger", String(toLedger));
        url.searchParams.set("limit", String(PAGE_LIMIT));
        url.searchParams.set("order", "asc");
        if (cursor) url.searchParams.set("cursor", cursor);

        const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
        this.metrics.recordExternalCall("Horizon", "fetchContractEvents", Date.now() - startTime);

        if (res.status === 429 || res.status >= 500) {
          this.metrics.recordError("Horizon", `HTTP_${res.status}`);
          throw new Error(`Transient status engine error code: ${res.status}`);
        }

        if (!res.ok) {
          throw new Error(`Fatal Horizon terminal exception context: ${res.status}`);
        }

        const body = (await res.json()) as {
          _embedded?: { records?: RawHorizonContractEvent[] };
          _links?: { next?: { href?: string } };
        };

        const records = body._embedded?.records ?? [];
        const nextHref = body._links?.next?.href;
        const nextCursor = nextHref ? (new URL(nextHref).searchParams.get("cursor") ?? undefined) : undefined;

        return { records, nextCursor };
      } catch (error) {
        attempts++;
        if (attempts >= MAX_RETRIES) throw error;
        const delay = INITIAL_BACKOFF_MS * Math.pow(2, attempts);
        this.logger.warn(`Horizon fetch failure. Retrying in ${delay}ms... Error: ${error.message}`);
        await new Promise((res) => setTimeout(res, delay));
      }
    }
    throw new Error("Maximum transaction call bounds exceeded.");
  }

  private isInDualReadWindow(currentLedger: number, config?: DualReadConfig): boolean {
    if (!config?.previousContractId || !config?.effectiveLedger) return false;
    return currentLedger < config.effectiveLedger;
  }

private async persistEvent(event: RustAcademyContractEvent): Promise<void> {
    // Cast to an unknown dictionary first to safely extract the runtime eventType string
    const dynamicEvent = event as unknown as Record<string, unknown>;
    const eventType = dynamicEvent.eventType as string;

    switch (eventType) {
      case "EscrowDeposited":
      case "EscrowWithdrawn":
      case "EscrowRefunded":
        await this.escrowRepo.upsertEvent(
          event as unknown as Parameters<EscrowEventRepository["upsertEvent"]>[0]
        );
        break;
      case "PrivacyToggled":
        await this.privacyRepo.upsertEvent(
          event as unknown as Parameters<PrivacyEventRepository["upsertEvent"]>[0]
        );
        break;
      case "ContractPaused":
      case "AdminChanged":
      case "ContractUpgraded":
        await this.adminRepo.upsertEvent(
          event as unknown as Parameters<AdminEventRepository["upsertEvent"]>[0]
        );
        break;
      case "EphemeralKeyRegistered":
      case "StealthWithdrawn":
        await this.stealthRepo.upsertEvent(
          event as unknown as Parameters<StealthEventRepository["upsertEvent"]>[0]
        );
        break;
      default:
        this.logger.debug(`Event ${eventType} not persisted.`);
    }
  }
}