import {
  BadRequestException,
  Injectable,
  Logger,
  ConflictException,
  InternalServerErrorException,
} from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";

import { AuditService } from "../audit/audit.service";
import { AppConfigService } from "../config";
import { SupabaseService } from "../supabase/supabase.service";
import {
  ContractRegistryEntryDto,
  PublishContractRegistryDto,
  RollbackContractRegistryDto,
} from "./dto/contract-registry.dto";
import {
  ContractRegistryPublishedEvent,
  ContractRegistryRolledBackEvent,
  ContractRegistryPublishedEventPayload,
  ContractRegistryRolledBackEventPayload,
} from "../events/contract-registry.events";
import { ContractChangeWebhookService } from "./contract-change-webhook.service";
import { ContractChangeWebhookDispatcher } from "./contract-change-webhook.dispatcher";

interface RegistryRecord {
  name: string;
  network: string;
  contractId: string;
  previousContractId?: string;
  effectiveLedger?: number;
  effectiveTime?: string;
  wasmHash: string;
  contractVersion: number;
  deploymentId?: string;
  metadata?: Record<string, unknown>;
  publishedBy: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  networkPassphrase: string;
  active: boolean;
}

@Injectable()
export class ContractRegistryService {
  private readonly logger = new Logger(ContractRegistryService.name);
  private readonly fallbackStore = new Map<string, RegistryRecord[]>();
  private readonly expectedContracts: string[];
  private fallbackVersion = 0;
  private readonly maxRetries = 3;
  private readonly retryDelayMs = 1000;

  // Metrics counters
  private readonly metrics = {
    publishSuccess: 0,
    publishFailure: 0,
    publishRetry: 0,
    finalizeSuccess: 0,
    finalizeFailure: 0,
    finalizeRetry: 0,
    rollbackSuccess: 0,
    rollbackFailure: 0,
    rollbackRetry: 0,
  };

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly auditService: AuditService,
    private readonly configService: AppConfigService,
    private readonly eventEmitter: EventEmitter2,
    private readonly contractChangeWebhookService: ContractChangeWebhookService,
    private readonly webhookDispatcher: ContractChangeWebhookDispatcher,
  ) {
    this.expectedContracts = (
      process.env.CONTRACT_REGISTRY_EXPECTED_SET ?? " RustAcademy"
    )
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
  }

  async getRegistry() {
    const records = await this.readRecords();
    const active = records.filter((record) => record.active);
    const data = Object.fromEntries(
      active.map((record) => [
        record.name,
        {
          id: record.contractId,
          wasmHash: record.wasmHash,
          version: record.contractVersion,
          deploymentId: record.deploymentId,
          updatedAt: record.updatedAt,
          metadata: record.metadata ?? {},
        },
      ]),
    );

    const version = active.reduce(
      (max, record) => Math.max(max, record.version),
      this.fallbackVersion,
    );

    return {
      network: this.configService.network,
      authoritative: true,
      version,
      etag: this.buildEtag(version),
      data,
    };
  }

  async publish(
    dto: PublishContractRegistryDto,
    actor = "deployment_automation",
  ) {
    const startTime = Date.now();
    this.validatePassphrase(dto.networkPassphrase);
    this.validateContractSet(dto.contracts);

    const current = await this.readRecords();
    const currentVersion = current.reduce(
      (max, record) => Math.max(max, record.version),
      this.fallbackVersion,
    );

    // Use expectedVersion from DTO if provided, otherwise use current version
    const expectedVersion = dto.expectedVersion ?? currentVersion;

    const now = new Date().toISOString();
    const names = new Set(
      dto.contracts.map((contract) => contract.name.toLowerCase()),
    );
    const retained = current.map((record) =>
      names.has(record.name)
        ? { ...record, active: false, updatedAt: now }
        : record,
    );

    const published: RegistryRecord[] = dto.contracts.map((contract) =>
      this.toRecord(contract, dto, actor, 0, now),
    );

    const merged = [...retained, ...published];

    try {
      const result = await this.retryOperation(
        async () => {
          const client = this.supabaseService.getClient();
          const { data, error } = await client.rpc("publish_contract_registry", {
            p_network: this.configService.network,
            p_records: published.map((record) => ({
              name: record.name,
              contractId: record.contractId,
              previousContractId: record.previousContractId ?? null,
              effectiveLedger: record.effectiveLedger ?? null,
              effectiveTime: record.effectiveTime ?? null,
              wasmHash: record.wasmHash,
              contractVersion: record.contractVersion,
              deploymentId: record.deploymentId ?? null,
              metadata: record.metadata ?? {},
              publishedBy: record.publishedBy,
              networkPassphrase: record.networkPassphrase,
              active: record.active,
              createdAt: record.createdAt,
              updatedAt: record.updatedAt,
            })),
            p_expected_version: expectedVersion,
          });

          if (error) {
            this.handleDatabaseError(error);
          }

          const rpcResult = data as { success: boolean; newVersion: number; publishedCount: number; previousVersion: number };
          if (!rpcResult?.success) {
            throw new InternalServerErrorException("Failed to publish contract registry: RPC returned unsuccessful");
          }

          return rpcResult;
        },
        "publish_contract_registry",
      );

      const nextVersion = result.newVersion;

      // Update in-memory fallback only after successful persistence
      this.fallbackVersion = nextVersion;
      const finalRecords = merged.map((record) => ({
        ...record,
        version: record.active ? nextVersion : record.version,
      }));
      this.writeFallback(finalRecords);

      // Emit audit logs and webhooks only after durable persistence succeeds
      await this.auditService.log(
        "contract_registry",
        "registry.publish",
        dto.deploymentId,
        {
          actor,
          version: nextVersion,
          contracts: published.map((record) => ({
            name: record.name,
            contractId: record.contractId,
            wasmHash: record.wasmHash,
            contractVersion: record.contractVersion,
          })),
        },
      );

      this.logger.log(
        `Published ${published.length} contract registry entr${published.length === 1 ? "y" : "ies"} at version ${nextVersion}`,
      );

      // Record metrics
      this.metrics.publishSuccess++;
      const duration = Date.now() - startTime;
      this.logger.debug(`Publish operation completed in ${duration}ms`);

      await this.eventEmitter.emit(
        ContractRegistryPublishedEvent,
        new ContractRegistryPublishedEventPayload(
          nextVersion,
          published.map((record) => ({
            name: record.name,
            contractId: record.contractId,
            wasmHash: record.wasmHash,
            contractVersion: record.contractVersion,
            deploymentId: record.deploymentId,
          })),
          actor,
        ),
      );

      const enabledWebhooks =
        await this.contractChangeWebhookService.getEnabledWebhooks();
      if (enabledWebhooks.length > 0) {
        this.webhookDispatcher.dispatch(enabledWebhooks, {
          version: nextVersion,
          event: "contract_registry.published",
          actor,
          deploymentId: dto.deploymentId,
          contracts: published.map((record) => ({
            name: record.name,
            contractId: record.contractId,
            wasmHash: record.wasmHash,
            contractVersion: record.contractVersion,
            deploymentId: record.deploymentId,
          })),
        });
      }

      return this.getRegistry();
    } catch (error) {
      this.metrics.publishFailure++;
      this.logger.error(
        `Failed to publish contract registry: ${(error as Error).message}`,
      );
      throw error;
    }
  }

async finalizeDualRead(
  contractName: string,
  actor = "deployment_automation",
) {
  const startTime = Date.now();
  const targetName = contractName.toLowerCase();

  try {
    const result = await this.retryOperation(
      async () => {
        const client = this.supabaseService.getClient();
        const { data, error } = await client.rpc("finalize_dual_read", {
          p_network: this.configService.network,
          p_contract_name: targetName,
        });

        if (error) {
          this.handleDatabaseError(error);
        }

        const rpcResult = data as { success: boolean; contractName: string; finalizedAt: string };
        if (!rpcResult?.success) {
          throw new InternalServerErrorException("Failed to finalize dual-read: RPC returned unsuccessful");
        }

        return rpcResult;
      },
      "finalize_dual_read",
    );

    // Update in-memory fallback only after successful persistence
    const records = await this.readRecords();
    const now = result.finalizedAt;
    const updated = records.map((record) => {
      if (record.name !== targetName) return record;
      return {
        ...record,
        previousContractId: undefined,
        effectiveLedger: record.effectiveLedger,
        effectiveTime: now,
        updatedAt: now,
      };
    });

    this.writeFallback(updated);

    // Emit audit log only after durable persistence succeeds
    await this.auditService.log(
      "contract_registry",
      "registry.finalize_dual_read",
      contractName,
      {
        actor,
        finalizedAt: now,
      },
    );

    this.logger.log(
      `Finalized dual-read for contract ${contractName} at timestamp ${now}`,
    );

    // Record metrics
    this.metrics.finalizeSuccess++;
    const duration = Date.now() - startTime;
    this.logger.debug(`Finalize dual-read operation completed in ${duration}ms`);

    return this.getRegistry();
  } catch (error) {
    this.metrics.finalizeFailure++;
    this.logger.error(
      `Failed to finalize dual-read for ${contractName}: ${(error as Error).message}`,
    );
    throw error;
  }
}
 async rollback(
  dto: RollbackContractRegistryDto,
  actor = "deployment_automation",
) {
  const startTime = Date.now();
  const targetName = dto.name.toLowerCase();

  try {
    const result = await this.retryOperation(
        async () => {
          const client = this.supabaseService.getClient();
          const { data, error } = await client.rpc("rollback_contract_registry", {
            p_network: this.configService.network,
            p_contract_name: targetName,
            p_target_contract_version: dto.version,
          });

          if (error) {
            this.handleDatabaseError(error);
          }

          const rpcResult = data as {
            success: boolean;
            contractName: string;
            targetVersion: number;
            newRegistryVersion: number;
            contractId: string;
            wasmHash: string;
          };
          if (!rpcResult?.success) {
            throw new InternalServerErrorException("Failed to rollback contract registry: RPC returned unsuccessful");
          }

          return rpcResult;
        },
        "rollback_contract_registry",
      );

      const nextVersion = result.newRegistryVersion;

      // Update in-memory fallback only after successful persistence
      this.fallbackVersion = Math.max(this.fallbackVersion, nextVersion);
      const records = await this.readRecords();
      const now = new Date().toISOString();
      const updated = records.map((record) => {
        if (record.name !== targetName) return record;
        return {
          ...record,
          active: record.contractVersion === dto.version,
          updatedAt: now,
          version:
            record.contractVersion === dto.version ? nextVersion : record.version,
        };
      });

      this.writeFallback(updated);

      // Emit audit logs and webhooks only after durable persistence succeeds
      await this.auditService.log(
        "contract_registry",
        "registry.rollback",
        dto.name,
        { actor, requestedVersion: dto.version, registryVersion: nextVersion },
      );

      // Record metrics
      this.metrics.rollbackSuccess++;
      const duration = Date.now() - startTime;
      this.logger.debug(`Rollback operation completed in ${duration}ms`);

      await this.eventEmitter.emit(
        ContractRegistryRolledBackEvent,
        new ContractRegistryRolledBackEventPayload(
          targetName,
          nextVersion,
          result.contractId,
          result.wasmHash,
          dto.version,
          actor,
        ),
      );

      const enabledWebhooks =
        await this.contractChangeWebhookService.getEnabledWebhooks();
      if (enabledWebhooks.length > 0) {
        this.webhookDispatcher.dispatch(enabledWebhooks, {
          version: nextVersion,
          event: "contract_registry.rolled_back",
          contractName: targetName,
          contractId: result.contractId,
          wasmHash: result.wasmHash,
          contractVersion: dto.version,
          actor,
        });
      }

      return this.getRegistry();
    } catch (error) {
      this.metrics.rollbackFailure++;
      this.logger.error(
        `Failed to rollback contract registry for ${dto.name}: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  private validatePassphrase(passphrase: string): void {
    const expected =
      this.configService.network === "mainnet"
        ? "Public Global Stellar Network ; September 2015"
        : "Test SDF Network ; September 2015";

    if (passphrase !== expected) {
      throw new BadRequestException(
        `networkPassphrase does not match the active ${this.configService.network} network`,
      );
    }
  }

  private validateContractSet(contracts: ContractRegistryEntryDto[]): void {
    const normalized = contracts
      .map((contract) => contract.name.toLowerCase())
      .sort();
    const expected = [...this.expectedContracts].sort();

    if (normalized.length !== expected.length) {
      throw new BadRequestException(
        `Expected ${expected.length} contract entries (${expected.join(", ")}) but received ${normalized.length}`,
      );
    }

    for (let index = 0; index < expected.length; index += 1) {
      if (normalized[index] !== expected[index]) {
        throw new BadRequestException(
          `Unexpected contract set. Expected ${expected.join(", ")}`,
        );
      }
    }
  }

  private toRecord(
    contract: ContractRegistryEntryDto,
    dto: PublishContractRegistryDto,
    actor: string,
    version: number,
    timestamp: string,
  ): RegistryRecord {
    return {
      name: contract.name.toLowerCase(),
      network: this.configService.network,
      contractId: contract.contractId,
      wasmHash: contract.wasmHash,
      contractVersion: contract.contractVersion ?? 1,
      deploymentId: dto.deploymentId,
      metadata: contract.metadata,
      publishedBy: actor,
      version,
      createdAt: timestamp,
      updatedAt: timestamp,
      networkPassphrase: dto.networkPassphrase,
      active: true,
    };
  }

  private buildEtag(version: number): string {
    return `W/\"contract-registry-${this.configService.network}-${version}\"`;
  }

  private fallbackKey(): string {
    return `contract-registry:${this.configService.network}`;
  }

  private writeFallback(records: RegistryRecord[]): void {
    this.fallbackStore.set(this.fallbackKey(), records);
  }

  private async readRecords(): Promise<RegistryRecord[]> {
    const fallback = this.fallbackStore.get(this.fallbackKey()) ?? [];

    try {
      const client = this.supabaseService.getClient();
      const { data, error } = await client
        .from("contract_registry_entries")
        .select("*")
        .eq("network", this.configService.network)
        .order("version", { ascending: true });

      if (error) throw error;
      if (!data || data.length === 0) return fallback;

      return data.map((row) => ({
        name: String(row.contract_name),
        network: String(row.network),
        contractId: String(row.contract_id),
        previousContractId: row.previous_contract_id
          ? String(row.previous_contract_id)
          : undefined,
        effectiveLedger: row.effective_ledger
          ? Number(row.effective_ledger)
          : undefined,
        effectiveTime: row.effective_time
          ? String(row.effective_time)
          : undefined,
        wasmHash: String(row.wasm_hash),
        contractVersion: Number(row.contract_version),
        deploymentId: row.deployment_id ? String(row.deployment_id) : undefined,
        metadata:
          row.metadata && typeof row.metadata === "object"
            ? (row.metadata as Record<string, unknown>)
            : undefined,
        publishedBy: String(row.published_by ?? "unknown"),
        version: Number(row.version),
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
        networkPassphrase: String(row.network_passphrase),
        active: Boolean(row.is_active),
      }));
    } catch (error) {
      this.logger.warn(
        `Falling back to in-memory contract registry: ${(error as Error).message}`,
      );
      return fallback;
    }
  }

  private async retryOperation<T>(
    operation: () => Promise<T>,
    operationName: string,
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        const isTransient = this.isTransientError(error);

        if (!isTransient || attempt === this.maxRetries) {
          this.logger.error(
            `${operationName} failed after ${attempt + 1} attempt(s): ${lastError.message}`,
          );
          throw lastError;
        }

        this.logger.warn(
          `${operationName} failed (attempt ${attempt + 1}/${this.maxRetries + 1}), retrying in ${this.retryDelayMs}ms: ${lastError.message}`,
        );

        // Increment retry metrics
        if (operationName === "publish_contract_registry") {
          this.metrics.publishRetry++;
        } else if (operationName === "finalize_dual_read") {
          this.metrics.finalizeRetry++;
        } else if (operationName === "rollback_contract_registry") {
          this.metrics.rollbackRetry++;
        }

        await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs * (attempt + 1)));
      }
    }

    throw lastError || new Error("Retry operation failed");
  }

  private isTransientError(error: unknown): boolean {
    const errorMessage = (error as Error).message.toLowerCase();
    const transientPatterns = [
      "connection",
      "timeout",
      "network",
      "temporary",
      "try again",
      "deadlock",
      "lock wait timeout",
    ];

    return transientPatterns.some((pattern) => errorMessage.includes(pattern));
  }

  private handleDatabaseError(error: { message: string; code?: string; details?: string }): never {
    const errorMessage = error.message.toLowerCase();

    // Check for unique constraint violations
    if (
      errorMessage.includes("unique constraint") ||
      errorMessage.includes("duplicate key")
    ) {
      throw new ConflictException(
        "Concurrent modification detected: Another operation has modified the contract registry. Please retry.",
      );
    }

    // Check for optimistic concurrency failures
    if (errorMessage.includes("optimistic concurrency check failed")) {
      throw new ConflictException(
        "Optimistic concurrency check failed: The registry version has changed since you read it. Please retry with the latest version.",
      );
    }

    // Check for connection errors
    if (errorMessage.includes("connection") || errorMessage.includes("timeout")) {
      throw new InternalServerErrorException(
        "Database connection error. Please try again.",
      );
    }

    // Generic database error
    throw new InternalServerErrorException(
      `Database error: ${error.message}`,
    );
  }

  private async persistSnapshot(records: RegistryRecord[]): Promise<void> {
    // This method is deprecated in favor of transactional RPC functions.
    // Kept for backward compatibility but should not be used in new code.
    try {
      const client = this.supabaseService.getClient();
      await client
        .from("contract_registry_entries")
        .delete()
        .eq("network", this.configService.network);
      const { error } = await client.from("contract_registry_entries").insert(
        records.map((record) => ({
          contract_name: record.name,
          network: record.network,
          contract_id: record.contractId,
          previous_contract_id: record.previousContractId ?? null,
          effective_ledger: record.effectiveLedger ?? null,
          effective_time: record.effectiveTime ?? null,
          wasm_hash: record.wasmHash,
          contract_version: record.contractVersion,
          deployment_id: record.deploymentId ?? null,
          metadata: record.metadata ?? {},
          published_by: record.publishedBy,
          version: record.version,
          created_at: record.createdAt,
          updated_at: record.updatedAt,
          network_passphrase: record.networkPassphrase,
          is_active: record.active,
        })),
      );

      if (error) throw error;
    } catch (error) {
      this.logger.warn(
        `Unable to persist contract registry snapshot: ${(error as Error).message}`,
      );
    }
  }

  getMetrics() {
    return { ...this.metrics };
  }
}
