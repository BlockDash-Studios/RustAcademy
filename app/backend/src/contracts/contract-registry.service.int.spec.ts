// import { Test, TestingModule } from "@nestjs/testing";
import { ConflictException, InternalServerErrorException } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { SupabaseService } from "../supabase/supabase.service";
import { AppConfigService } from "../config";
import { AuditService } from "../audit/audit.service";
import { ContractRegistryService } from "./contract-registry.service";
import { ContractChangeWebhookService } from "./contract-change-webhook.service";
import { ContractChangeWebhookDispatcher } from "./contract-change-webhook.dispatcher";
// import {
//   ContractRegistryEntryDto,
//   PublishContractRegistryDto,
//   RollbackContractRegistryDto,
// } from "./dto/contract-registry.dto";

describe("ContractRegistryService Integration", () => {
  let service: ContractRegistryService;
  let mockSupabaseService: jest.Mocked<Partial<SupabaseService>>;
  let mockAuditService: jest.Mocked<Partial<AuditService>>;
  let mockAppConfigService: Partial<AppConfigService>;
  let mockEventEmitter: jest.Mocked<EventEmitter2>;
  let mockContractChangeWebhookService: jest.Mocked<
    Partial<ContractChangeWebhookService>
  >;
  let mockWebhookDispatcher: jest.Mocked<
    Partial<ContractChangeWebhookDispatcher>
  >;

  beforeEach(() => {
    const mockClient = {
      from: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({ data: [], error: null }),
        delete: jest.fn().mockReturnThis(),
        insert: jest.fn().mockResolvedValue({ error: null }),
      })),
      rpc: jest.fn(),
    };

    mockSupabaseService = {
      getClient: jest.fn(() => mockClient as never),
    };

    mockAuditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    mockAppConfigService = {
      network: "testnet",
    };

    mockEventEmitter = {
      emit: jest.fn(),
    } as unknown as jest.Mocked<EventEmitter2>;

    mockContractChangeWebhookService = {
      getEnabledWebhooks: jest.fn().mockResolvedValue([]),
      listWebhooks: jest.fn().mockResolvedValue([]),
      deleteWebhook: jest.fn().mockResolvedValue(true),
      registerWebhook: jest.fn(),
    } as unknown as jest.Mocked<Partial<ContractChangeWebhookService>>;

    mockWebhookDispatcher = {
      dispatch: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<Partial<ContractChangeWebhookDispatcher>>;

    service = new ContractRegistryService(
      mockSupabaseService as unknown as SupabaseService,
      mockAuditService as unknown as AuditService,
      mockAppConfigService as AppConfigService,
      mockEventEmitter,
      mockContractChangeWebhookService as unknown as ContractChangeWebhookService,
      mockWebhookDispatcher as unknown as ContractChangeWebhookDispatcher,
    );
  });

  describe("Retry logic for transient failures", () => {
    it("retries on connection errors", async () => {
      const mockClient = mockSupabaseService.getClient();
      let attempts = 0;

      mockClient.rpc.mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          throw { message: "Connection timeout" };
        }
        return {
          data: { success: true, newVersion: 1, publishedCount: 1, previousVersion: 0 },
          error: null,
        };
      });

      await service.publish({
        networkPassphrase: "Test SDF Network ; September 2015",
        deploymentId: "deploy-1",
        contracts: [
          {
            name: " RustAcademy",
            contractId: "C123",
            wasmHash: "abc123",
            contractVersion: 1,
          },
        ],
      });

      expect(attempts).toBe(3);
      expect(mockAuditService.log).toHaveBeenCalled();
    });

    it("fails after max retries on persistent errors", async () => {
      const mockClient = mockSupabaseService.getClient();
      mockClient.rpc.mockResolvedValue({
        data: null,
        error: { message: "Persistent database error" },
      });

      await expect(
        service.publish({
          networkPassphrase: "Test SDF Network ; September 2015",
          deploymentId: "deploy-1",
          contracts: [
            {
              name: " RustAcademy",
              contractId: "C123",
              wasmHash: "abc123",
              contractVersion: 1,
            },
          ],
        }),
      ).rejects.toThrow();

      // Should not emit audit logs on persistent failure
      expect(mockAuditService.log).not.toHaveBeenCalled();
    });

    it("does not retry on non-transient errors", async () => {
      const mockClient = mockSupabaseService.getClient();
      let attempts = 0;

      mockClient.rpc.mockImplementation(async () => {
        attempts++;
        throw { message: "Invalid input data" };
      });

      await expect(
        service.publish({
          networkPassphrase: "Test SDF Network ; September 2015",
          deploymentId: "deploy-1",
          contracts: [
            {
              name: " RustAcademy",
              contractId: "C123",
              wasmHash: "abc123",
              contractVersion: 1,
            },
          ],
        }),
      ).rejects.toThrow();

      expect(attempts).toBe(1);
    });
  });

  describe("Error handling with specific error types", () => {
    it("throws ConflictException on unique constraint violation", async () => {
      const mockClient = mockSupabaseService.getClient();
      mockClient.rpc.mockResolvedValue({
        data: null,
        error: {
          message: "duplicate key value violates unique constraint",
        },
      });

      await expect(
        service.publish({
          networkPassphrase: "Test SDF Network ; September 2015",
          deploymentId: "deploy-1",
          contracts: [
            {
              name: " RustAcademy",
              contractId: "C123",
              wasmHash: "abc123",
              contractVersion: 1,
            },
          ],
        }),
      ).rejects.toThrow(ConflictException);
    });

    it("throws ConflictException on optimistic concurrency failure", async () => {
      const mockClient = mockSupabaseService.getClient();
      mockClient.rpc.mockResolvedValue({
        data: null,
        error: {
          message: "Optimistic concurrency check failed: expected version 0, found 1",
        },
      });

      await expect(
        service.publish({
          networkPassphrase: "Test SDF Network ; September 2015",
          deploymentId: "deploy-1",
          contracts: [
            {
              name: " RustAcademy",
              contractId: "C123",
              wasmHash: "abc123",
              contractVersion: 1,
            },
          ],
        }),
      ).rejects.toThrow(ConflictException);
    });

    it("throws InternalServerErrorException on connection errors", async () => {
      const mockClient = mockSupabaseService.getClient();
      mockClient.rpc.mockResolvedValue({
        data: null,
        error: { message: "Database connection failed" },
      });

      await expect(
        service.publish({
          networkPassphrase: "Test SDF Network ; September 2015",
          deploymentId: "deploy-1",
          contracts: [
            {
              name: " RustAcademy",
              contractId: "C123",
              wasmHash: "abc123",
              contractVersion: 1,
            },
          ],
        }),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe("API-level optimistic concurrency", () => {
    it("uses expectedVersion from DTO when provided", async () => {
      const mockClient = mockSupabaseService.getClient();
      mockClient.rpc.mockResolvedValue({
        data: { success: true, newVersion: 2, publishedCount: 1, previousVersion: 1 },
        error: null,
      });

      await service.publish({
        networkPassphrase: "Test SDF Network ; September 2015",
        deploymentId: "deploy-1",
        expectedVersion: 1,
        contracts: [
          {
            name: " RustAcademy",
            contractId: "C123",
            wasmHash: "abc123",
            contractVersion: 1,
          },
        ],
      });

      expect(mockClient.rpc).toHaveBeenCalledWith(
        "publish_contract_registry",
        expect.objectContaining({
          p_expected_version: 1,
        }),
      );
    });

    it("uses current version when expectedVersion not provided", async () => {
      const mockClient = mockSupabaseService.getClient();
      mockClient.rpc.mockResolvedValue({
        data: { success: true, newVersion: 1, publishedCount: 1, previousVersion: 0 },
        error: null,
      });

      await service.publish({
        networkPassphrase: "Test SDF Network ; September 2015",
        deploymentId: "deploy-1",
        contracts: [
          {
            name: " RustAcademy",
            contractId: "C123",
            wasmHash: "abc123",
            contractVersion: 1,
          },
        ],
      });

      expect(mockClient.rpc).toHaveBeenCalledWith(
        "publish_contract_registry",
        expect.objectContaining({
          p_expected_version: 0,
        }),
      );
    });
  });

  describe("Rollback with retry and error handling", () => {
    it("retries rollback on transient errors", async () => {
      const mockClient = mockSupabaseService.getClient();
      let attempts = 0;

      mockClient.rpc.mockImplementation(async () => {
        attempts++;
        if (attempts < 2) {
          throw { message: "Connection timeout" };
        }
        return {
          data: {
            success: true,
            contractName: "rustacademy",
            targetVersion: 1,
            newRegistryVersion: 3,
            contractId: "C123",
            wasmHash: "abc123",
          },
          error: null,
        };
      });

      await service.rollback({ name: " RustAcademy", version: 1 });

      expect(attempts).toBe(2);
    });

    it("throws ConflictException on rollback concurrency failure", async () => {
      const mockClient = mockSupabaseService.getClient();
      mockClient.rpc.mockResolvedValue({
        data: null,
        error: {
          message: "duplicate key value violates unique constraint",
        },
      });

      await expect(
        service.rollback({ name: " RustAcademy", version: 1 }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe("Finalize dual-read with retry and error handling", () => {
    it("retries finalize on transient errors", async () => {
      const mockClient = mockSupabaseService.getClient();
      let attempts = 0;

      mockClient.rpc.mockImplementation(async () => {
        attempts++;
        if (attempts < 2) {
          throw { message: "Network error" };
        }
        return {
          data: {
            success: true,
            contractName: "rustacademy",
            finalizedAt: "2026-06-02T10:00:00Z",
          },
          error: null,
        };
      });

      await service.finalizeDualRead(" RustAcademy");

      expect(attempts).toBe(2);
    });

    it("throws appropriate error when no active entry exists", async () => {
      const mockClient = mockSupabaseService.getClient();
      mockClient.rpc.mockResolvedValue({
        data: null,
        error: { message: "No active registry entry found for missing" },
      });

      await expect(service.finalizeDualRead("missing")).rejects.toThrow(
        "No active registry entry found for missing",
      );
    });
  });

  describe("Integration scenarios", () => {
    it("handles publish -> finalize -> rollback workflow", async () => {
      const mockClient = mockSupabaseService.getClient();

      // Publish
      mockClient.rpc.mockResolvedValueOnce({
        data: { success: true, newVersion: 1, publishedCount: 1, previousVersion: 0 },
        error: null,
      });

      await service.publish({
        networkPassphrase: "Test SDF Network ; September 2015",
        deploymentId: "deploy-1",
        contracts: [
          {
            name: " RustAcademy",
            contractId: "C123",
            wasmHash: "abc123",
            contractVersion: 1,
          },
        ],
      });

      // Finalize dual-read
      mockClient.rpc.mockResolvedValueOnce({
        data: {
          success: true,
          contractName: "rustacademy",
          finalizedAt: "2026-06-02T10:00:00Z",
        },
        error: null,
      });

      await service.finalizeDualRead(" RustAcademy");

      // Rollback
      mockClient.rpc.mockResolvedValueOnce({
        data: {
          success: true,
          contractName: "rustacademy",
          targetVersion: 1,
          newRegistryVersion: 3,
          contractId: "C123",
          wasmHash: "abc123",
        },
        error: null,
      });

      await service.rollback({ name: " RustAcademy", version: 1 });

      expect(mockAuditService.log).toHaveBeenCalledTimes(3);
      expect(mockEventEmitter.emit).toHaveBeenCalledTimes(2); // publish and rollback
    });

    it("handles concurrent publish attempts with proper error handling", async () => {
      const mockClient = mockSupabaseService.getClient();

      // First publish succeeds
      mockClient.rpc.mockResolvedValueOnce({
        data: { success: true, newVersion: 1, publishedCount: 1, previousVersion: 0 },
        error: null,
      });

      await service.publish({
        networkPassphrase: "Test SDF Network ; September 2015",
        deploymentId: "deploy-1",
        contracts: [
          {
            name: " RustAcademy",
            contractId: "C123",
            wasmHash: "abc123",
            contractVersion: 1,
          },
        ],
      });

      // Second concurrent publish fails with conflict
      mockClient.rpc.mockResolvedValueOnce({
        data: null,
        error: {
          message: "duplicate key value violates unique constraint",
        },
      });

      await expect(
        service.publish({
          networkPassphrase: "Test SDF Network ; September 2015",
          deploymentId: "deploy-2",
          contracts: [
            {
              name: " RustAcademy",
              contractId: "C456",
              wasmHash: "def456",
              contractVersion: 2,
            },
          ],
        }),
      ).rejects.toThrow(ConflictException);

      // Only first publish should have emitted events
      expect(mockEventEmitter.emit).toHaveBeenCalledTimes(1);
    });
  });
});
