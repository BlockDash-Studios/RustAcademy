/**
 * Testnet Data Reset Service
 *
 * Provides safe, guarded operations to reset testnet-only data for demos
 * and contributor testing. All operations include:
 * - Network environment validation (testnet-only)
 * - Audit logging of reset operations
 * - Metrics collection
 *
 * Acceptance Criteria:
 * - Reset only runs on testnet and is blocked otherwise
 * - Reindex produces deterministic state for the configured ledger range
 * - Operators can validate completion and resulting counts quickly
 */

import { Injectable, Logger, ForbiddenException, InternalServerErrorException } from "@nestjs/common";
import { AppConfigService } from "../config";
import { SupabaseService } from "../supabase/supabase.service";
import { AuditService } from "../audit/audit.service";
import { MetricsService } from "../metrics/metrics.service";
import { IndexerCheckpointRepository } from "./indexer-checkpoint.repository";

export interface TestnetResetResult {
  success: boolean;
  timestamp: Date;
  truncatedTables: {
    [tableName: string]: number; // number of records deleted
  };
  checkpointCount: number;
  auditLogId: string;
  message: string;
}

export interface TestnetResetValidation {
  isTestnet: boolean;
  message: string;
}

/**
 * Testnet Reset Service
 *
 * Safely wipes testnet-only tables and reinitializes indexing checkpoints
 * for reproducible demos and testing.
 */
@Injectable()
export class TestnetResetService {
  private readonly logger = new Logger(TestnetResetService.name);

  // Tables that are testnet-specific and safe to truncate
  private readonly TESTNET_EVENT_TABLES = [
    "escrow_events",
    "privacy_events",
    "admin_events",
    "stealth_events",
  ];

  // Tables that should NOT be truncated (data-bearing tables)
  private readonly PROTECTED_TABLES = [
    "users",
    "links",
    "payments",
    "transactions",
    "usernames",
    "accounts",
  ];

  constructor(
    private readonly configService: AppConfigService,
    private readonly supabaseService: SupabaseService,
    private readonly auditService: AuditService,
    private readonly metricsService: MetricsService,
    private readonly checkpointRepository: IndexerCheckpointRepository,
  ) {}

  /**
   * Validate that we're running on testnet.
   * Returns validation result with boolean flag.
   */
  validateTestnetEnvironment(): TestnetResetValidation {
    const isTestnet = this.configService.network === "testnet";
    return {
      isTestnet,
      message: isTestnet
        ? "Running on testnet — reset is allowed"
        : `ERROR: Running on ${this.configService.network} — testnet data reset is blocked for safety`,
    };
  }

  /**
   * Reset all testnet event data and reinitialize checkpoints.
   * Safe to call repeatedly — resets are idempotent.
   *
   * @param requesterPublicKey - Public key of the admin requesting the reset
   * @returns Reset result with counts and audit log ID
   * @throws ForbiddenException if not on testnet
   * @throws InternalServerErrorException if database operation fails
   */
  async resetTestnetData(requesterPublicKey: string): Promise<TestnetResetResult> {
    // ─────────────────────────────────────────────────────────────────────────
    // 1. Validate environment
    // ─────────────────────────────────────────────────────────────────────────
    const validation = this.validateTestnetEnvironment();
    if (!validation.isTestnet) {
      this.logger.error(validation.message);
      throw new ForbiddenException(validation.message);
    }

    const auditLogId = this.generateAuditLogId();
    this.logger.log(
      `Starting testnet reset (auditLogId: ${auditLogId}, requester: ${requesterPublicKey})`,
    );

    try {
      // ─────────────────────────────────────────────────────────────────────────
      // 2. Truncate event tables
      // ─────────────────────────────────────────────────────────────────────────
      const supabaseClient = this.supabaseService.getClient();
      const truncatedTables: { [tableName: string]: number } = {};

      for (const tableName of this.TESTNET_EVENT_TABLES) {
        try {
          const countBefore = await this.countRecordsInTable(tableName);
          // Delete all records
          const { error } = await supabaseClient.from(tableName).delete().neq("id", "00000000-0000-0000-0000-000000000000");

          if (error) {
            this.logger.error(`Failed to truncate ${tableName}: ${error.message}`);
            throw error;
          }

          const countAfter = await this.countRecordsInTable(tableName);
          truncatedTables[tableName] = countBefore - countAfter;
          this.logger.log(`Truncated ${tableName}: removed ${truncatedTables[tableName]} records`);
        } catch (error) {
          this.logger.error(`Error truncating ${tableName}:`, error);
          throw new InternalServerErrorException(`Failed to truncate ${tableName}`);
        }
      }

      // ─────────────────────────────────────────────────────────────────────────
      // 3. Reset checkpoints
      // ─────────────────────────────────────────────────────────────────────────
      const checkpointCount = await this.resetCheckpoints();
      this.logger.log(`Reset ${checkpointCount} indexer checkpoints`);

      // ─────────────────────────────────────────────────────────────────────────
      // 4. Audit logging
      // ─────────────────────────────────────────────────────────────────────────
      await this.auditService.log(
        requesterPublicKey,
        "testnet_reset",
        "testnet_data",
        {
          auditLogId,
          truncatedTables,
          checkpointCount,
          totalRecordsRemoved: Object.values(truncatedTables).reduce((a, b) => a + b, 0),
        },
        auditLogId,
      );

      // ─────────────────────────────────────────────────────────────────────────
      // 5. Record metrics
      // ─────────────────────────────────────────────────────────────────────────
      this.metricsService.recordTestnetReset(
        Object.values(truncatedTables).reduce((a, b) => a + b, 0),
        checkpointCount,
      );

      const result: TestnetResetResult = {
        success: true,
        timestamp: new Date(),
        truncatedTables,
        checkpointCount,
        auditLogId,
        message: `Testnet reset completed: removed ${Object.values(truncatedTables).reduce((a, b) => a + b, 0)} event records and reset ${checkpointCount} checkpoints`,
      };

      this.logger.log(`Testnet reset completed (auditLogId: ${auditLogId}): ${result.message}`);
      return result;
    } catch (error) {
      this.logger.error(`Testnet reset failed (auditLogId: ${auditLogId}):`, error);

      // Log failure to audit
      await this.auditService.log(
        requesterPublicKey,
        "testnet_reset_failed",
        "testnet_data",
        {
          auditLogId,
          error: (error as Error).message,
        },
        auditLogId,
      );

      throw error;
    }
  }

  /**
   * Reset all indexer checkpoints to prepare for reindexing.
   * Deletes all checkpoint records so reindexing starts from ledger 0.
   *
   * @returns Number of checkpoints deleted
   */
  private async resetCheckpoints(): Promise<number> {
    const supabaseClient = this.supabaseService.getClient();

    try {
      const { data, error } = await supabaseClient
        .from("indexer_checkpoints")
        .select("*");

      if (error) {
        this.logger.error(`Failed to fetch checkpoints: ${error.message}`);
        throw error;
      }

      const checkpointCount = data ? data.length : 0;

      // Delete all checkpoints
      const { error: deleteError } = await supabaseClient
        .from("indexer_checkpoints")
        .delete()
        .neq("contract_id", ""); // Delete all

      if (deleteError) {
        this.logger.error(`Failed to delete checkpoints: ${deleteError.message}`);
        throw deleteError;
      }

      return checkpointCount;
    } catch (error) {
      this.logger.error("Error resetting checkpoints:", error);
      throw new InternalServerErrorException("Failed to reset indexer checkpoints");
    }
  }

  /**
   * Count records in a table.
   * Used to validate truncation success.
   *
   * @param tableName - Name of the table to count
   * @returns Number of records in the table
   */
  private async countRecordsInTable(tableName: string): Promise<number> {
    const supabaseClient = this.supabaseService.getClient();

    try {
      const { count, error } = await supabaseClient
        .from(tableName)
        .select("*", { count: "exact", head: true });

      if (error) {
        this.logger.warn(`Failed to count ${tableName}: ${error.message}`);
        return 0;
      }

      return count ?? 0;
    } catch (error) {
      this.logger.warn(`Error counting ${tableName}:`, error);
      return 0;
    }
  }

  /**
   * Generate a unique audit log ID for this reset operation.
   */
  private generateAuditLogId(): string {
    return `reset_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }
}
