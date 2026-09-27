import { Test, TestingModule } from "@nestjs/testing";
import { HealthService } from "./health.service";
import { SupabaseService } from "../supabase/supabase.service";
import { HorizonService } from "../stellar/horizon.service";
import { AppConfigService } from "../config/app-config.service";
import { JobQueueService } from "../job-queue/job-queue.service";
import { JobRepository } from "../job-queue/job.repository";
import { CursorRepository } from "../ingestion/cursor.repository";
import { SorobanRpcService } from "../transactions/soroban-rpc.service";

describe("HealthService", () => {
  let service: HealthService;
  let supabaseService: { checkHealth: jest.Mock; getClient: jest.Mock };
  let horizonService: { getBaseUrl: jest.Mock };
  let configService: Record<string, unknown>;
  let jobQueueService: Record<string, unknown>;
  let jobRepository: { listJobs: jest.Mock };
  let cursorRepository: { getCursor: jest.Mock };
  let sorobanRpcService: { getNetworkPassphrase: jest.Mock };

  beforeEach(async () => {
    supabaseService = {
      checkHealth: jest.fn().mockResolvedValue(true),
      getClient: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue({ data: [{ version: "1" }], error: null }),
            }),
            limit: jest.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
    };

    horizonService = {
      getBaseUrl: jest.fn().mockReturnValue("https://horizon-testnet.stellar.org"),
    };

    configService = {
      supabaseUrl: "https://example.supabase.co",
      supabaseAnonKey: "anon-key",
      network: "testnet",
      isPaymentSigningConfigured: true,
    };

    jobQueueService = {};
    jobRepository = {
      listJobs: jest.fn().mockResolvedValue([]),
    };
    cursorRepository = {
      getCursor: jest.fn().mockResolvedValue("0-100"),
    };
    sorobanRpcService = {
      getNetworkPassphrase: jest.fn().mockResolvedValue("Test SDF Network ; September 2015"),
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
    }) as unknown as typeof fetch;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: SupabaseService, useValue: supabaseService },
        { provide: HorizonService, useValue: horizonService },
        { provide: AppConfigService, useValue: configService },
        { provide: JobQueueService, useValue: jobQueueService },
        { provide: JobRepository, useValue: jobRepository },
        { provide: CursorRepository, useValue: cursorRepository },
        { provide: SorobanRpcService, useValue: sorobanRpcService },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("getHealthStatus", () => {
    it("should return shallow health ok status", async () => {
      const result = await service.getHealthStatus();
      expect(result.status).toBe("ok");
      expect(result.version).toBeDefined();
      expect(typeof result.uptime).toBe("number");
    });
  });

  describe("getReadinessStatus", () => {
    it("should return ready: true when all dependencies are up", async () => {
      const result = await service.getReadinessStatus();
      expect(result.ready).toBe(true);
      expect(result.checks).toHaveLength(7);
      const names = result.checks.map((c) => c.name);
      expect(names).toContain("supabase");
      expect(names).toContain("environment");
      expect(names).toContain("migrations");
      expect(names).toContain("queue");
      expect(names).toContain("horizon");
      expect(names).toContain("soroban_rpc");
      expect(names).toContain("ingestion");
    });

    it("should return ready: false when database check fails", async () => {
      supabaseService.checkHealth.mockResolvedValue(false);
      const result = await service.getReadinessStatus();
      expect(result.ready).toBe(false);
      const supabaseCheck = result.checks.find((c) => c.name === "supabase");
      expect(supabaseCheck?.status).toBe("down");
      expect(supabaseCheck?.error).toBeDefined();
    });
  });

  describe("getPublicStatus", () => {
    it("should return operational status without sensitive details", async () => {
      const result = await service.getPublicStatus();
      expect(result.status).toBe("operational");
      expect(result.network).toBe("testnet");
      expect(result.components).toHaveLength(3);
    });
  });
});
