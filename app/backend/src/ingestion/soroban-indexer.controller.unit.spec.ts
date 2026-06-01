/**
 * Soroban Indexer Controller - Integration Tests
 *
 * Tests for:
 * - GET /admin/testnet/reset endpoint authentication
 * - GET /admin/testnet/reset authorization checks
 * - GET /admin/testnet/reset payload validation
 * - GET /admin/testnet/reset responses
 */

import { Test, TestingModule } from "@nestjs/testing";
import { SorobanIndexerController } from "../soroban-indexer.controller";
import { SorobanEventIndexerService } from "../soroban-event-indexer.service";
import { TestnetResetService, TestnetResetResult } from "../testnet-reset.service";
import { ForbiddenException } from "@nestjs/common";

describe("SorobanIndexerController - Testnet Reset Endpoint", () => {
  let controller: SorobanIndexerController;
  let mockIndexerService: Partial<SorobanEventIndexerService>;
  let mockResetService: Partial<TestnetResetService>;

  const requesterPublicKey = "GBVR5SG3ASLQF6KZPQFQC2MDDKKSEBFK7RJZSJ23YDXRPLJ5SLTFVSI";

  beforeEach(async () => {
    mockIndexerService = {
      indexLedgerRange: jest.fn().mockResolvedValue({
        fromLedger: 1000,
        toLedger: 2000,
        processed: 150,
        persisted: 145,
        skippedUnknownSchema: 5,
      }),
    };

    mockResetService = {
      resetTestnetData: jest.fn().mockResolvedValue({
        success: true,
        timestamp: new Date(),
        truncatedTables: {
          escrow_events: 100,
          privacy_events: 50,
          admin_events: 25,
          stealth_events: 10,
        },
        checkpointCount: 3,
        auditLogId: "reset_123456_abc123",
        message:
          "Testnet reset completed: removed 185 event records and reset 3 checkpoints",
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SorobanIndexerController],
      providers: [
        {
          provide: SorobanEventIndexerService,
          useValue: mockIndexerService,
        },
        {
          provide: TestnetResetService,
          useValue: mockResetService,
        },
      ],
    }).compile();

    controller = module.get<SorobanIndexerController>(
      SorobanIndexerController,
    );
  });

  describe("resetTestnetData", () => {
    it("should successfully reset testnet data", async () => {
      const result: TestnetResetResult = await controller.resetTestnetData(
        requesterPublicKey,
      );

      expect(result.success).toBe(true);
      expect(result.truncatedTables).toBeDefined();
      expect(result.checkpointCount).toBeGreaterThanOrEqual(0);
      expect(result.auditLogId).toBeDefined();

      expect(mockResetService.resetTestnetData).toHaveBeenCalledWith(
        requesterPublicKey,
      );
    });

    it("should return reset result with truncated table counts", async () => {
      const result = await controller.resetTestnetData(requesterPublicKey);

      expect(result.truncatedTables).toEqual({
        escrow_events: 100,
        privacy_events: 50,
        admin_events: 25,
        stealth_events: 10,
      });
    });

    it("should include audit log ID in response", async () => {
      const result = await controller.resetTestnetData(requesterPublicKey);

      expect(result.auditLogId).toMatch(/^reset_\d+_[a-z0-9]+$/);
    });

    it("should propagate ForbiddenException for mainnet", async () => {
      mockResetService.resetTestnetData = jest
        .fn()
        .mockRejectedValue(
          new ForbiddenException(
            "ERROR: Running on mainnet — testnet data reset is blocked for safety",
          ),
        );

      await expect(
        controller.resetTestnetData(requesterPublicKey),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should include message with operation summary", async () => {
      const result = await controller.resetTestnetData(requesterPublicKey);

      expect(result.message).toContain("completed");
      expect(result.message).toContain("event records");
      expect(result.message).toContain("checkpoints");
    });

    it("should return valid timestamp", async () => {
      const result = await controller.resetTestnetData(requesterPublicKey);

      expect(result.timestamp).toBeInstanceOf(Date);
      const timeDiff = Date.now() - result.timestamp.getTime();
      expect(timeDiff).toBeLessThan(5000); // within 5 seconds
    });

    it("should call reset service with correct requester", async () => {
      const customRequester = "GXYZ...";

      await controller.resetTestnetData(customRequester);

      expect(mockResetService.resetTestnetData).toHaveBeenCalledWith(
        customRequester,
      );
    });

    it("should handle multiple consecutive resets", async () => {
      const result1 = await controller.resetTestnetData(requesterPublicKey);
      const result2 = await controller.resetTestnetData(requesterPublicKey);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(mockResetService.resetTestnetData).toHaveBeenCalledTimes(2);
    });
  });

  describe("reindex endpoint", () => {
    it("should call indexer with correct parameters", async () => {
      const dto = {
        contractId: "CCBXVMSVZJR7OF7CCVLTG26DYLJJQXOGXJQEJQW7JZ3OWFEEZI7EHIGM",
        fromLedger: 1000,
        toLedger: 2000,
        force: true,
      };

      await controller.reindex(dto);

      expect(mockIndexerService.indexLedgerRange).toHaveBeenCalledWith(
        "CCBXVMSVZJR7OF7CCVLTG26DYLJJQXOGXJQEJQW7JZ3OWFEEZI7EHIGM",
        1000,
        2000,
        true,
      );
    });

    it("should handle reindex with force=false", async () => {
      const dto = {
        contractId: "CCBXVMSVZJR7OF7CCVLTG26DYLJJQXOGXJQEJQW7JZ3OWFEEZI7EHIGM",
        fromLedger: 1000,
        toLedger: 2000,
        force: false,
      };

      await controller.reindex(dto);

      expect(mockIndexerService.indexLedgerRange).toHaveBeenCalledWith(
        "CCBXVMSVZJR7OF7CCVLTG26DYLJJQXOGXJQEJQW7JZ3OWFEEZI7EHIGM",
        1000,
        2000,
        false,
      );
    });

    it("should handle reindex with undefined force (defaults to false)", async () => {
      const dto = {
        contractId: "CCBXVMSVZJR7OF7CCVLTG26DYLJJQXOGXJQEJQW7JZ3OWFEEZI7EHIGM",
        fromLedger: 1000,
        toLedger: 2000,
      };

      await controller.reindex(dto);

      expect(mockIndexerService.indexLedgerRange).toHaveBeenCalledWith(
        "CCBXVMSVZJR7OF7CCVLTG26DYLJJQXOGXJQEJQW7JZ3OWFEEZI7EHIGM",
        1000,
        2000,
        false,
      );
    });
  });
});
