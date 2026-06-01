/**
 * Testnet Reindex Handler - Unit Tests
 *
 * Tests for:
 * - Environment validation (testnet vs mainnet)
 * - Reindex execution with ledger ranges
 * - Audit logging of reindex operations
 * - Metrics recording
 * - Error handling and retries
 */

import { Test, TestingModule } from "@nestjs/testing";
import { TestnetReindexHandler } from "../testnet-reindex.handler";
import { SorobanEventIndexerService } from "../../ingestion/soroban-event-indexer.service";
import { AuditService } from "../../audit/audit.service";
import { MetricsService } from "../../metrics/metrics.service";
import { AppConfigService } from "../../config";
import { PermanentJobError } from "../webhook-delivery.handler";
import { Job, JobType, JobStatus, TestnetReindexPayload } from "../types";
import { CancellationToken } from "../types/job.types";

describe("TestnetReindexHandler", () => {
  let handler: TestnetReindexHandler;
  let mockIndexer: Partial<SorobanEventIndexerService>;
  let mockAuditService: Partial<AuditService>;
  let mockMetricsService: Partial<MetricsService>;
  let mockConfigService: Partial<AppConfigService>;

  const testContractId = "CCBXVMSVZJR7OF7CCVLTG26DYLJJQXOGXJQEJQW7JZ3OWFEEZI7EHIGM";
  const requesterPublicKey = "GBVR5SG3ASLQF6KZPQFQC2MDDKKSEBFK7RJZSJ23YDXRPLJ5SLTFVSI";

  beforeEach(async () => {
    mockIndexer = {
      indexLedgerRange: jest.fn().mockResolvedValue({
        fromLedger: 1000,
        toLedger: 2000,
        processed: 150,
        persisted: 145,
        skippedUnknownSchema: 5,
      }),
    };

    mockAuditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    mockMetricsService = {
      recordTestnetReindex: jest.fn(),
    };

    mockConfigService = {
      network: "testnet",
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TestnetReindexHandler,
        {
          provide: SorobanEventIndexerService,
          useValue: mockIndexer,
        },
        {
          provide: AuditService,
          useValue: mockAuditService,
        },
        {
          provide: MetricsService,
          useValue: mockMetricsService,
        },
        {
          provide: AppConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    handler = module.get<TestnetReindexHandler>(TestnetReindexHandler);
  });

  describe("execute", () => {
    const createJob = (overrides?: Partial<TestnetReindexPayload>): Job<TestnetReindexPayload> => ({
      id: "test-job-id",
      type: JobType.TESTNET_REINDEX,
      status: JobStatus.RUNNING,
      attempts: 1,
      maxAttempts: 3,
      createdAt: new Date(),
      scheduledAt: new Date(),
      startedAt: new Date(),
      completedAt: null,
      failureReason: null,
      visibilityTimeout: null,
      payload: {
        contractId: testContractId,
        fromLedger: 1000,
        toLedger: 2000,
        force: false,
        requesterPublicKey,
        ...overrides,
      },
    });

    const cancellationToken: CancellationToken = {
      isCancellationRequested: false,
      throwIfCancellationRequested: jest.fn(),
    };

    it("should block reindex on mainnet with PermanentJobError", async () => {
      mockConfigService.network = "mainnet";
      const job = createJob();

      await expect(
        handler.execute(job, cancellationToken),
      ).rejects.toThrow(PermanentJobError);

      expect(mockAuditService.log).toHaveBeenCalledWith(
        requesterPublicKey,
        "testnet_reindex_failed_mainnet",
        expect.any(String),
        expect.any(Object),
      );
    });

    it("should successfully reindex on testnet", async () => {
      mockConfigService.network = "testnet";
      const job = createJob();

      await handler.execute(job, cancellationToken);

      expect(mockIndexer.indexLedgerRange).toHaveBeenCalledWith(
        testContractId,
        1000,
        2000,
        false,
      );

      expect(mockAuditService.log).toHaveBeenCalledWith(
        requesterPublicKey,
        "testnet_reindex_completed",
        expect.any(String),
        expect.any(Object),
      );
    });

    it("should record success metrics after reindex", async () => {
      mockConfigService.network = "testnet";
      const job = createJob();

      await handler.execute(job, cancellationToken);

      expect(mockMetricsService.recordTestnetReindex).toHaveBeenCalledWith(
        "success",
        150,
      );
    });

    it("should handle force reindex parameter", async () => {
      mockConfigService.network = "testnet";
      const job = createJob({ force: true });

      await handler.execute(job, cancellationToken);

      expect(mockIndexer.indexLedgerRange).toHaveBeenCalledWith(
        testContractId,
        1000,
        2000,
        true, // force = true
      );
    });

    it("should log failure details when indexer raises error", async () => {
      mockConfigService.network = "testnet";
      const error = new Error("Horizon connection failed");
      mockIndexer.indexLedgerRange = jest
        .fn()
        .mockRejectedValue(error);

      const job = createJob();

      await expect(
        handler.execute(job, cancellationToken),
      ).rejects.toThrow("Horizon connection failed");

      expect(mockAuditService.log).toHaveBeenCalledWith(
        requesterPublicKey,
        "testnet_reindex_failed",
        expect.any(String),
        expect.objectContaining({
          jobId: job.id,
          error: "Horizon connection failed",
        }),
      );

      expect(mockMetricsService.recordTestnetReindex).toHaveBeenCalledWith(
        "failure",
      );
    });

    it("should include ledger range in audit log", async () => {
      mockConfigService.network = "testnet";
      const job = createJob({
        fromLedger: 5000,
        toLedger: 10000,
      });

      await handler.execute(job, cancellationToken);

      expect(mockAuditService.log).toHaveBeenCalledWith(
        requesterPublicKey,
        "testnet_reindex_completed",
        expect.any(String),
        expect.objectContaining({
          fromLedger: 5000,
          toLedger: 10000,
        }),
      );
    });

    it("should include indexer result counts in audit log", async () => {
      mockConfigService.network = "testnet";
      mockIndexer.indexLedgerRange = jest.fn().mockResolvedValue({
        fromLedger: 1000,
        toLedger: 2000,
        processed: 200,
        persisted: 195,
        skippedUnknownSchema: 5,
      });

      const job = createJob();

      await handler.execute(job, cancellationToken);

      expect(mockAuditService.log).toHaveBeenCalledWith(
        requesterPublicKey,
        "testnet_reindex_completed",
        expect.any(String),
        expect.objectContaining({
          processed: 200,
          persisted: 195,
          skippedUnknownSchema: 5,
        }),
      );
    });

    it("should retry on transient errors", async () => {
      mockConfigService.network = "testnet";
      const transientError = new Error("Network timeout");
      mockIndexer.indexLedgerRange = jest
        .fn()
        .mockRejectedValue(transientError);

      const job = createJob();

      await expect(
        handler.execute(job, cancellationToken),
      ).rejects.toThrow("Network timeout");

      // Verify it's not a PermanentJobError
      expect(mockMetricsService.recordTestnetReindex).toHaveBeenCalledWith(
        "failure",
      );
    });
  });

  describe("environment validation", () => {
    it("should accept testnet environment", async () => {
      mockConfigService.network = "testnet";
      const job: Job<TestnetReindexPayload> = {
        id: "test-id",
        type: JobType.TESTNET_REINDEX,
        status: JobStatus.RUNNING,
        attempts: 1,
        maxAttempts: 3,
        createdAt: new Date(),
        scheduledAt: new Date(),
        startedAt: new Date(),
        completedAt: null,
        failureReason: null,
        visibilityTimeout: null,
        payload: {
          contractId: testContractId,
          fromLedger: 1,
          toLedger: 100,
          force: false,
          requesterPublicKey,
        },
      };

      const cancellationToken: CancellationToken = {
        isCancellationRequested: false,
        throwIfCancellationRequested: jest.fn(),
      };

      // Should not throw
      await expect(
        handler.execute(job, cancellationToken),
      ).resolves.toBeUndefined();
    });

    it("should reject mainnet environment", async () => {
      mockConfigService.network = "mainnet";
      const job: Job<TestnetReindexPayload> = {
        id: "test-id",
        type: JobType.TESTNET_REINDEX,
        status: JobStatus.RUNNING,
        attempts: 1,
        maxAttempts: 3,
        createdAt: new Date(),
        scheduledAt: new Date(),
        startedAt: new Date(),
        completedAt: null,
        failureReason: null,
        visibilityTimeout: null,
        payload: {
          contractId: testContractId,
          fromLedger: 1,
          toLedger: 100,
          force: false,
          requesterPublicKey,
        },
      };

      const cancellationToken: CancellationToken = {
        isCancellationRequested: false,
        throwIfCancellationRequested: jest.fn(),
      };

      await expect(
        handler.execute(job, cancellationToken),
      ).rejects.toThrow(PermanentJobError);
    });
  });
});
