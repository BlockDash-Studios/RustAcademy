import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HealthService } from './health.service';
import { RedisService } from '../redis/redis.service';
import { DatabaseService } from '../database/database.service';
import { MonitoringService } from '../monitoring/monitoring.service';

describe('HealthService', () => {
  let service: HealthService;
  let redisService: RedisService;
  let databaseService: DatabaseService;
  let monitoringService: MonitoringService;

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: unknown) => {
      if (key === 'READINESS_PROBE_TIMEOUT_MS') return 1_000;
      return defaultValue;
    }),
  };

  beforeEach(async () => {
    redisService = {
      get: jest.fn(),
    } as unknown as RedisService;

    databaseService = {
      isHealthy: jest.fn(),
    } as unknown as DatabaseService;

    monitoringService = {} as MonitoringService;

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: RedisService, useValue: redisService },
        { provide: DatabaseService, useValue: databaseService },
        { provide: MonitoringService, useValue: monitoringService },
      ],
    }).compile();

    service = moduleRef.get<HealthService>(HealthService);
  });

  describe('checkLiveness', () => {
    it('returns alive: true with a timestamp', () => {
      const result = service.checkLiveness();
      expect(result.alive).toBe(true);
      expect(result.timestamp).toBeDefined();
      expect(new Date(result.timestamp).getTime()).not.toBeNaN();
    });
  });

  describe('check (full health)', () => {
    it('returns ok when all dependencies are healthy', async () => {
      (databaseService.isHealthy as jest.Mock).mockResolvedValue(true);
      (redisService.get as jest.Mock).mockResolvedValue(null);

      const result = await service.check();
      expect(result.status).toBe('ok');
      expect(result.dependencies).toHaveLength(2);
      expect(result.dependencies.every((d) => d.status === 'healthy')).toBe(true);
    });

    it('returns unavailable when Redis is unhealthy', async () => {
      (databaseService.isHealthy as jest.Mock).mockResolvedValue(true);
      (redisService.get as jest.Mock).mockRejectedValue(
        new Error('ECONNREFUSED'),
      );

      const result = await service.check();
      expect(result.status).toBe('unavailable');
      expect(result.dependencies.find((d) => d.name === 'redis')).toMatchObject({
        status: 'unhealthy',
      });
      expect(result.dependencies.find((d) => d.name === 'database')).toMatchObject({
        status: 'healthy',
      });
    });

    it('returns degraded when database service is not injected', async () => {
      const moduleRef: TestingModule = await Test.createTestingModule({
        providers: [
          HealthService,
          { provide: ConfigService, useValue: mockConfigService },
          { provide: RedisService, useValue: redisService },
          // DatabaseService intentionally omitted (undefined)
        ],
      }).compile();

      const svc = moduleRef.get<HealthService>(HealthService);
      (redisService.get as jest.Mock).mockResolvedValue(null);

      const result = await svc.check();
      expect(result.status).toBe('degraded');
      const dbCheck = result.dependencies.find((d) => d.name === 'database');
      expect(dbCheck).toMatchObject({
        status: 'degraded',
        error: 'DatabaseService not available (not injected)',
      });
    });

    it('returns unavailable when both Redis and database are unhealthy', async () => {
      (databaseService.isHealthy as jest.Mock).mockRejectedValue(
        new Error('FATAL'),
      );
      (redisService.get as jest.Mock).mockRejectedValue(
        new Error('Connection lost'),
      );

      const result = await service.check();
      expect(result.status).toBe('unavailable');
    });
  });

  describe('checkReadiness', () => {
    it('returns ready when all dependencies are healthy and workers are active', async () => {
      (databaseService.isHealthy as jest.Mock).mockResolvedValue(true);
      (redisService.get as jest.Mock).mockResolvedValue(null);

      const result = await service.checkReadiness({
        ready: true,
        queueDepth: 5,
        activeWorkers: 2,
        lastHeartbeat: new Date(),
      });

      expect(result.ready).toBe(true);
      expect(result.checks).toHaveLength(4);
      expect(result.checks.find((c) => c.name === 'workers')).toMatchObject({
        ready: true,
        reason: expect.stringContaining('Workers active'),
      });
    });

    it('returns not ready when workers are stalled', async () => {
      (databaseService.isHealthy as jest.Mock).mockResolvedValue(true);
      (redisService.get as jest.Mock).mockResolvedValue(null);

      const result = await service.checkReadiness({
        ready: false,
        queueDepth: 100,
        activeWorkers: 0,
        lastHeartbeat: new Date(Date.now() - 120_000),
      });

      expect(result.ready).toBe(false);
      const workerCheck = result.checks.find((c) => c.name === 'workers');
      expect(workerCheck).toMatchObject({ ready: false });
    });

    it('returns not ready when database is unhealthy', async () => {
      (databaseService.isHealthy as jest.Mock).mockRejectedValue(
        new Error('Connection refused to 10.0.0.5:5432'),
      );
      (redisService.get as jest.Mock).mockResolvedValue(null);

      const result = await service.checkReadiness();

      expect(result.ready).toBe(false);
      const dbCheck = result.checks.find((c) => c.name === 'database');
      expect(dbCheck?.ready).toBe(false);
      // Reason should be sanitized — no IP addresses leaked
      expect(dbCheck?.reason).not.toContain('10.0.0.5');
      expect(dbCheck?.reason).not.toContain('5432');
    });

    it('returns not ready when Redis is unhealthy', async () => {
      (databaseService.isHealthy as jest.Mock).mockResolvedValue(true);
      (redisService.get as jest.Mock).mockRejectedValue(
        new Error('redis://127.0.0.1:6379 connection refused'),
      );

      const result = await service.checkReadiness();

      expect(result.ready).toBe(false);
      const redisCheck = result.checks.find((c) => c.name === 'redis');
      expect(redisCheck?.ready).toBe(false);
      // Connection string should be sanitized
      expect(redisCheck?.reason).not.toContain('redis://');
      expect(redisCheck?.reason).not.toContain('127.0.0.1');
    });

    it('returns ready with infrastructure-only when no workerReadiness provided', async () => {
      (databaseService.isHealthy as jest.Mock).mockResolvedValue(true);
      (redisService.get as jest.Mock).mockResolvedValue(null);

      const result = await service.checkReadiness();

      expect(result.ready).toBe(true);
      expect(result.checks.find((c) => c.name === 'workers')).toBeUndefined();
    });

    it('sanitizes timeout reasons when probes hang', async () => {
      // Simulate slow database by never resolving the readiness check.
      // Use a fake ConfigService with a very short timeout for this test.
      const fastConfig = { get: jest.fn(() => 50) } as unknown as ConfigService;
      const slowDb = {
        isHealthy: () => new Promise<boolean>(() => {}), // never resolves
      } as unknown as DatabaseService;
      const healthyRedis = {
        get: jest.fn().mockResolvedValue(null),
      } as unknown as RedisService;

      const moduleRef: TestingModule = await Test.createTestingModule({
        providers: [
          HealthService,
          { provide: ConfigService, useValue: fastConfig },
          { provide: RedisService, useValue: healthyRedis },
          { provide: DatabaseService, useValue: slowDb },
        ],
      }).compile();

      const svc = moduleRef.get<HealthService>(HealthService);
      const result = await svc.checkReadiness();

      expect(result.ready).toBe(false);
      const dbCheck = result.checks.find((c) => c.name === 'database');
      expect(dbCheck?.ready).toBe(false);
      expect(dbCheck?.reason).toContain('timed out');
    });
  });
});
