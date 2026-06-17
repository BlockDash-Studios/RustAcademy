import { BadRequestException, NotFoundException } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { SupabaseService } from "../supabase/supabase.service";
import { AppConfigService } from "../config";
import { AuditService } from "../audit/audit.service";
import { ContractRegistryService } from "./contract-registry.service";
import { ContractChangeWebhookService } from "./contract-change-webhook.service";
import { ContractChangeWebhookDispatcher } from "./contract-change-webhook.dispatcher";

describe("ContractRegistryService", () => {
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

  it("publishes and returns the active registry", async () => {
    const mockClient = mockSupabaseService.getClient();
    mockClient.rpc.mockResolvedValue({
      data: { success: true, newVersion: 1, publishedCount: 1, previousVersion: 0 },
      error: null,
    });

    const result = await service.publish({
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

    expect(result.data.RustAcademy).toEqual(
      expect.objectContaining({ id: "C123", wasmHash: "abc123", version: 1 }),
    );
    expect(result.version).toBeGreaterThan(0);
    expect(mockAuditService.log).toHaveBeenCalledWith(
      "contract_registry",
      "registry.publish",
      "deploy-1",
      expect.any(Object),
    );
  });

  it("rejects a mismatched passphrase", async () => {
    await expect(
      service.publish({
        networkPassphrase: "Public Global Stellar Network ; September 2015",
        contracts: [
          {
            name: " RustAcademy",
            contractId: "C123",
            wasmHash: "abc123",
          },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("rolls back to a previous contract version", async () => {
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

    mockClient.rpc.mockResolvedValue({
      data: { success: true, newVersion: 2, publishedCount: 1, previousVersion: 1 },
      error: null,
    });

    await service.publish({
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
    });

    mockClient.rpc.mockResolvedValue({
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

    const result = await service.rollback({ name: " RustAcademy", version: 1 });
    expect(result.data.RustAcademy).toEqual(
      expect.objectContaining({ id: "C123", wasmHash: "abc123", version: 1 }),
    );
  });

  it("throws when rolling back a missing version", async () => {
    await expect(
      service.rollback({ name: " RustAcademy", version: 99 }),
    ).rejects.toThrow(NotFoundException);
  });

  describe("Dual-read finalization", () => {
    it("finalizes dual-read by clearing previousContractId", async () => {
      const mockClient = mockSupabaseService.getClient();
      mockClient.rpc.mockResolvedValue({
        data: {
          success: true,
          contractName: "rustacademy",
          finalizedAt: "2026-06-02T10:00:00Z",
        },
        error: null,
      });

      const result = await service.finalizeDualRead(" RustAcademy");

      // Should have removed dual-read config
      expect(mockAuditService.log).toHaveBeenCalledWith(
        "contract_registry",
        "registry.finalize_dual_read",
        " RustAcademy",
        expect.objectContaining({ actor: "deployment_automation" }),
      );

      // Result should show cleared previousContractId
      expect(result.data.RustAcademy).toBeDefined();
    });

    it("throws when no active entry exists", async () => {
      const mockClient = mockSupabaseService.getClient();
      mockClient.rpc.mockResolvedValue({
        data: null,
        error: { message: "No active registry entry found for missing" },
      });

      await expect(service.finalizeDualRead("missing")).rejects.toThrow(
        "No active registry entry found for missing",
      );
    });

    it("throws when not in dual-read window", async () => {
      const mockClient = mockSupabaseService.getClient();
      mockClient.rpc.mockResolvedValue({
        data: null,
        error: {
          message: "Registry entry for rustacademy is not in a dual-read transition window",
        },
      });

      await expect(service.finalizeDualRead(" RustAcademy")).rejects.toThrow(
        "Registry entry for rustacademy is not in a dual-read transition window",
      );
    });
  });

  describe("Atomic and durable persistence", () => {
    it("does not emit audit logs or webhooks on failed DB write", async () => {
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
      ).rejects.toThrow("Database connection failed");

      // Audit log should NOT be called on failure
      expect(mockAuditService.log).not.toHaveBeenCalled();

      // Event emitter should NOT be called on failure
      expect(mockEventEmitter.emit).not.toHaveBeenCalled();

      // Webhook dispatcher should NOT be called on failure
      expect(mockWebhookDispatcher.dispatch).not.toHaveBeenCalled();
    });

    it("uses optimistic concurrency to prevent race conditions", async () => {
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

      // Second publish with wrong expected version fails
      mockClient.rpc.mockResolvedValueOnce({
        data: null,
        error: {
          message: "Optimistic concurrency check failed: expected version 0, found 1",
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
      ).rejects.toThrow("Optimistic concurrency check failed");
    });

    it("only updates in-memory fallback after successful persistence", async () => {
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

      // Verify the registry was updated
      const result = await service.getRegistry();
      expect(result.version).toBe(1);
      expect(result.data.RustAcademy).toBeDefined();
    });

    it("prevents concurrent publishes from creating duplicate active entries", async () => {
      const mockClient = mockSupabaseService.getClient();
      
      // Simulate concurrent publishes - the second one should fail due to unique constraint
      mockClient.rpc.mockResolvedValueOnce({
        data: { success: true, newVersion: 1, publishedCount: 1, previousVersion: 0 },
        error: null,
      });

      mockClient.rpc.mockResolvedValueOnce({
        data: null,
        error: {
          message: "duplicate key value violates unique constraint \"contract_registry_entries_active_unique\"",
        },
      });

      // First publish succeeds
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

      // Second concurrent publish fails
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
      ).rejects.toThrow();
    });
  });
});
