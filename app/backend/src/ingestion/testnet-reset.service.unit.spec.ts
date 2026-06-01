/**
 * Testnet Reset Service - Unit Tests
 *
 * Tests for:
 * - Environment validation (testnet vs mainnet)
 * - Safe truncation of event tables
 * - Checkpoint reset
 * - Audit logging
 * - Metrics recording
 * - Error handling and recovery
 */

import { Test, TestingModule } from "@nestjs/testing";
import { ForbiddenException, InternalServerErrorException } from "@nestjs/common";
import { TestnetResetService, TestnetResetResult } from "../testnet-reset.service";
import { AppConfigService } from "../../config";
import { SupabaseService } from "../../supabase/supabase.service";
import { AuditService } from "../../audit/audit.service";
import { MetricsService } from "../../metrics/metrics.service";
import { IndexerCheckpointRepository } from "../indexer-checkpoint.repository";

describe("TestnetResetService", () => {
  let service: TestnetResetService;
  let mockConfigService: Partial<AppConfigService>;
  let mockSupabaseService: Partial<SupabaseService>;
  let mockAuditService: Partial<AuditService>;
  let mockMetricsService: Partial<MetricsService>;
  let mockCheckpointRepository: Partial<IndexerCheckpointRepository>;
  let mockSupabaseClient: any;

  beforeEach(async () => {
    mockSupabaseClient = {
      from: jest.fn(),
    };

    mockConfigService = {
      network: "testnet",
    };

    mockSupabaseService = {
      getClient: jest.fn().mockReturnValue(mockSupabaseClient),
    };

    mockAuditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    mockMetricsService = {
      recordTestnetReset: jest.fn(),
    };

    mockCheckpointRepository = {
      getLastLedger: jest.fn(),
      saveLastLedger: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TestnetResetService,
        {
          provide: AppConfigService,
          useValue: mockConfigService,
        },
        {
          provide: SupabaseService,
          useValue: mockSupabaseService,
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
          provide: IndexerCheckpointRepository,
          useValue: mockCheckpointRepository,
        },
      ],
    }).compile();

    service = module.get<TestnetResetService>(TestnetResetService);
  });

  describe("validateTestnetEnvironment", () => {
    it("should validate testnet environment successfully", () => {
      mockConfigService.network = "testnet";
      const result = service.validateTestnetEnvironment();

      expect(result.isTestnet).toBe(true);
      expect(result.message).toContain("allowed");
    });

    it("should block reset on mainnet", () => {
      mockConfigService.network = "mainnet";
      const result = service.validateTestnetEnvironment();

      expect(result.isTestnet).toBe(false);
      expect(result.message).toContain("blocked");
    });
  });

  describe("resetTestnetData", () => {
    const requesterPublicKey = "GBVR5SG3ASLQF6KZPQFQC2MDDKKSEBFK7RJZSJ23YDXRPLJ5SLTFVSI";

    beforeEach(() => {
      mockConfigService.network = "testnet";

      // Mock table truncation
      mockSupabaseClient.from.mockImplementation((tableName: string) => {
        return {
          delete: jest.fn().mockReturnThis(),
          neq: jest.fn().mockResolvedValue({ data: [], error: null }),
          select: jest.fn().mockResolvedValue({
            data: [],
            count: 0,
            error: null,
          }),
        };
      });
    });

    it("should throw ForbiddenException when not on testnet", async () => {
      mockConfigService.network = "mainnet";

      await expect(
        service.resetTestnetData(requesterPublicKey),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should successfully reset testnet data", async () => {
      const result = await service.resetTestnetData(requesterPublicKey);

      expect(result.success).toBe(true);
      expect(result.truncatedTables).toBeDefined();
      expect(result.checkpointCount).toBeGreaterThanOrEqual(0);
      expect(result.auditLogId).toBeDefined();
      expect(result.message).toContain("completed");
    });

    it("should call audit service with reset operation details", async () => {
      await service.resetTestnetData(requesterPublicKey);

      expect(mockAuditService.log).toHaveBeenCalledWith(
        requesterPublicKey,
        "testnet_reset",
        "testnet_data",
        expect.objectContaining({
          truncatedTables: expect.any(Object),
          checkpointCount: expect.any(Number),
        }),
        expect.any(String),
      );
    });

    it("should record metrics for reset operation", async () => {
      await service.resetTestnetData(requesterPublicKey);

      expect(mockMetricsService.recordTestnetReset).toHaveBeenCalled();
    });

    it("should handle database errors gracefully", async () => {
      mockSupabaseClient.from.mockImplementation(() => ({
        delete: jest.fn().mockReturnThis(),
        neq: jest
          .fn()
          .mockResolvedValue({
            error: new Error("Database error"),
          }),
      }));

      await expect(
        service.resetTestnetData(requesterPublicKey),
      ).rejects.toThrow(InternalServerErrorException);

      // Verify audit log of failure
      expect(mockAuditService.log).toHaveBeenCalledWith(
        requesterPublicKey,
        "testnet_reset_failed",
        "testnet_data",
        expect.any(Object),
        expect.any(String),
      );
    });

    it("should idempotently reset multiple times", async () => {
      const result1 = await service.resetTestnetData(requesterPublicKey);
      const result2 = await service.resetTestnetData(requesterPublicKey);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result1.timestamp).toBeDefined();
      expect(result2.timestamp).toBeDefined();
    });
  });

  describe("TestnetResetResult", () => {
    it("should have all required fields in reset result", async () => {
      mockConfigService.network = "testnet";
      mockSupabaseClient.from.mockImplementation((tableName: string) => {
        return {
          delete: jest.fn().mockReturnThis(),
          neq: jest.fn().mockResolvedValue({ data: [], error: null }),
          select: jest.fn().mockResolvedValue({
            data: [],
            count: 0,
            error: null,
          }),
        };
      });

      const result: TestnetResetResult = await service.resetTestnetData(
        "GBVR5SG3ASLQF6KZPQFQC2MDDKKSEBFK7RJZSJ23YDXRPLJ5SLTFVSI",
      );

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("timestamp");
      expect(result).toHaveProperty("truncatedTables");
      expect(result).toHaveProperty("checkpointCount");
      expect(result).toHaveProperty("auditLogId");
      expect(result).toHaveProperty("message");

      // Verify timestamp is recent
      const timeDiff = Date.now() - result.timestamp.getTime();
      expect(timeDiff).toBeLessThan(5000); // within 5 seconds
    });
  });
});
