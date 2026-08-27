import { Test, TestingModule } from '@nestjs/testing';
import { JobsService } from './jobs/jobs.service';
import { RedisService } from './redis/redis.service';
import { DatabaseService } from './database/database.service';
import { ConfigService } from '@nestjs/config';

import { TransactionManagerService } from './common/transaction-manager.service';

describe('Termination & Graceful Shutdown', () => {
  let app: TestingModule;
  let jobsService: JobsService;
  let redisService: RedisService;
  let databaseService: DatabaseService;

  beforeAll(async () => {
    app = await Test.createTestingModule({
      providers: [
        JobsService,
        RedisService,
        DatabaseService,
        TransactionManagerService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('false'),
          },
        },
      ],
    }).compile();

    jobsService = app.get<JobsService>(JobsService);
    redisService = app.get<RedisService>(RedisService);
    databaseService = app.get<DatabaseService>(DatabaseService);

    // Initialize modules to start intervals/etc
    if (jobsService.onModuleInit) {
      jobsService.onModuleInit();
    }
    if (databaseService.onModuleInit) {
      databaseService.onModuleInit();
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('should drain and clean up resources on shutdown', async () => {
    // Assert heartbeat interval is set
    expect((jobsService as any).heartbeatInterval).not.toBeNull();
    
    // Set some dummy data
    (redisService as any).cache.set('test', { value: 1, expiresAt: Date.now() });
    (databaseService as any).coupons.set('TEST_COUPON', { id: 'TEST_COUPON' });

    // Call shutdown hooks manually to simulate termination
    if (jobsService.onApplicationShutdown) {
      jobsService.onApplicationShutdown('SIGTERM');
    }
    if (redisService.onApplicationShutdown) {
      redisService.onApplicationShutdown('SIGTERM');
    }
    if (databaseService.onApplicationShutdown) {
      databaseService.onApplicationShutdown('SIGTERM');
    }

    // Verify cleanup
    expect((jobsService as any).heartbeatInterval).toBeNull();
    expect((jobsService as any).workerReady).toBe(false);
    expect((redisService as any).cache.size).toBe(0);
    expect((databaseService as any).coupons.size).toBe(0);
  });
});
