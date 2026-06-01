/**
 * Job Queue System - Testnet Reindex Handler
 *
 * Implements the JobHandler interface for testnet reindex jobs.
 * Reprocesses Soroban contract events over a specified ledger range.
 *
 * This handler is used to rebuild event indexes for demos and testing
 * on testnet only. It logs metrics and audit records for all operations.
 */

import { Injectable, Logger } from "@nestjs/common";
import { JobHandler, Job, CancellationToken, TestnetReindexPayload } from "../types";
import { SorobanEventIndexerService, LedgerRangeResult } from "../../ingestion/soroban-event-indexer.service";
import { AuditService } from "../../audit/audit.service";
import { MetricsService } from "../../metrics/metrics.service";
import { AppConfigService } from "../../config";
import { PermanentJobError } from "./webhook-delivery.handler";

/**
 * Testnet Reindex Handler
 *
 * Executes reindex jobs to reprocess Soroban contract events over a
 * specific ledger range. Used for demos and contributor testing to ensure
 * reproducible state.
 *
 * This handler is designed to run with maxAttempts=3 (retryable) since
 * network issues or transient failures can occur during long reindex runs.
 *
 * Requirements:
 * - Reindex only runs on testnet
 * - Reindex produces deterministic state for the configured ledger range
 * - Operators can validate completion and resulting counts quickly
 */
@Injectable()
export class TestnetReindexHandler implements JobHandler<TestnetReindexPayload> {
  private readonly logger = new Logger(TestnetReindexHandler.name);

  constructor(
    private readonly indexer: SorobanEventIndexerService,
    private readonly auditService: AuditService,
    private readonly metricsService: MetricsService,
    private readonly configService: AppConfigService,
  ) {}

  /**
   * Execute testnet reindex job
   *
   * Reprocesses all contract events in the specified ledger range.
   * Idempotent upserts ensure no duplicate records are created.
   *
   * @param job - The testnet reindex job
   * @param cancellationToken - Token to check for cancellation requests
   * @throws PermanentJobError if running on mainnet
   * @throws Error on transient failures (Horizon unavailable, network errors)
   */
  async execute(
    job: Job<TestnetReindexPayload>,
    _cancellationToken: CancellationToken,
  ): Promise<void> {
    const {
      contractId,
      fromLedger,
      toLedger,
      force,
      requesterPublicKey,
    } = job.payload;

    this.logger.log(
      `Starting testnet reindex job (jobId: ${job.id}, contractId: ${contractId}, ` +
      `fromLedger: ${fromLedger}, toLedger: ${toLedger}, force: ${force})`,
    );

    // ─────────────────────────────────────────────────────────────────────────
    // 1. Validate environment (testnet-only)
    // ─────────────────────────────────────────────────────────────────────────
    if (this.configService.network !== "testnet") {
      const errorMsg = `Testnet reindex is not allowed on ${this.configService.network}`;
      this.logger.error(errorMsg);

      await this.auditService.log(
        requesterPublicKey,
        "testnet_reindex_failed_mainnet",
        `contract:${contractId}`,
        {
          jobId: job.id,
          contractId,
          fromLedger,
          toLedger,
          network: this.configService.network,
          error: errorMsg,
        },
      );

      this.metricsService.recordTestnetReindex("failure");
      throw new PermanentJobError(errorMsg);
    }

    try {
      // ─────────────────────────────────────────────────────────────────────────
      // 2. Perform reindex
      // ─────────────────────────────────────────────────────────────────────────
      const result: LedgerRangeResult = await this.indexer.indexLedgerRange(
        contractId,
        fromLedger,
        toLedger,
        force,
      );

      // ─────────────────────────────────────────────────────────────────────────
      // 3. Log success and metrics
      // ─────────────────────────────────────────────────────────────────────────
      this.logger.log(
        `Testnet reindex completed (jobId: ${job.id}, contractId: ${contractId}, ` +
        `processed: ${result.processed}, persisted: ${result.persisted}, ` +
        `skipped: ${result.skippedUnknownSchema})`,
      );

      await this.auditService.log(
        requesterPublicKey,
        "testnet_reindex_completed",
        `contract:${contractId}`,
        {
          jobId: job.id,
          contractId,
          fromLedger: result.fromLedger,
          toLedger: result.toLedger,
          processed: result.processed,
          persisted: result.persisted,
          skippedUnknownSchema: result.skippedUnknownSchema,
        },
      );

      this.metricsService.recordTestnetReindex("success", result.processed);
    } catch (error) {
      this.logger.error(
        `Testnet reindex failed (jobId: ${job.id}, contractId: ${contractId}):`,
        error,
      );

      await this.auditService.log(
        requesterPublicKey,
        "testnet_reindex_failed",
        `contract:${contractId}`,
        {
          jobId: job.id,
          contractId,
          fromLedger,
          toLedger,
          error: (error as Error).message,
        },
      );

      this.metricsService.recordTestnetReindex("failure");
      throw error;
    }
  }
}
