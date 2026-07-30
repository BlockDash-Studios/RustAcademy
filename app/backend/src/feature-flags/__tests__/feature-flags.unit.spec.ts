import { Test, TestingModule } from '@nestjs/testing';
import { envSchema } from '../../config/env.schema';
import { AppConfigService } from '../../config/app-config.service';
import { AuditService } from '../../audit/audit.service';
import { SupabaseService } from '../../supabase/supabase.service';
import { FeatureFlagsService } from '../feature-flags.service';
import { FeatureFlagsController } from '../feature-flags.controller';

describe('Feature Flags Bootstrap & Controller Unit Tests', () => {
  describe('env.schema Joi Validation for FEATURE_FLAGS_BOOTSTRAP_JSON', () => {
    const baseEnv = {
      NETWORK: 'testnet',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'test-anon-key',
    };

    it('accepts valid JSON array of flag objects', () => {
      const validJson = JSON.stringify([
        { key: 'custom_flag', enabled: true, rolloutPercentage: 50 },
      ]);

      const { error, value } = envSchema.validate({
        ...baseEnv,
        FEATURE_FLAGS_BOOTSTRAP_JSON: validJson,
      });

      expect(error).toBeUndefined();
      expect(value.FEATURE_FLAGS_BOOTSTRAP_JSON).toBe(validJson);
    });

    it('accepts empty string or undefined', () => {
      const { error } = envSchema.validate({
        ...baseEnv,
        FEATURE_FLAGS_BOOTSTRAP_JSON: '',
      });

      expect(error).toBeUndefined();
    });

    it('rejects invalid JSON string', () => {
      const { error } = envSchema.validate({
        ...baseEnv,
        FEATURE_FLAGS_BOOTSTRAP_JSON: '{invalid-json',
      });

      expect(error).toBeDefined();
      expect(error?.message).toContain('invalid JSON');
    });

    it('rejects JSON that is not an array', () => {
      const { error } = envSchema.validate({
        ...baseEnv,
        FEATURE_FLAGS_BOOTSTRAP_JSON: JSON.stringify({ key: 'flag1' }),
      });

      expect(error).toBeDefined();
      expect(error?.message).toContain('must be a valid JSON array');
    });

    it('rejects array elements without a key string', () => {
      const { error } = envSchema.validate({
        ...baseEnv,
        FEATURE_FLAGS_BOOTSTRAP_JSON: JSON.stringify([{ enabled: true }]),
      });

      expect(error).toBeDefined();
      expect(error?.message).toContain("non-empty string 'key'");
    });
  });

  describe('FeatureFlagsService Bootstrap Parsing & Error Reporting', () => {
    let service: FeatureFlagsService;

    const mockAuditService = { log: jest.fn() };
    const mockSupabaseService = { getClient: jest.fn() };
    const mockConfigService = {
      nodeEnv: 'test',
      featureFlagsCacheTtlMs: 10_000,
      featureFlagsBootstrapJson: '',
    };

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          FeatureFlagsService,
          { provide: SupabaseService, useValue: mockSupabaseService },
          { provide: AuditService, useValue: mockAuditService },
          { provide: AppConfigService, useValue: mockConfigService },
        ],
      }).compile();

      service = module.get<FeatureFlagsService>(FeatureFlagsService);
      jest.clearAllMocks();
    });

    it('parses valid bootstrap JSON correctly and merges with default flags', () => {
      const bootstrap = [
        {
          key: 'mainnet.refunds',
          enabled: true,
          rolloutPercentage: 100,
          environments: ['production'],
        },
      ];

      const result = service.parseBootstrapFlags(JSON.stringify(bootstrap));

      expect(result.status.valid).toBe(true);
      expect(result.status.hasCustomBootstrap).toBe(true);

      const target = result.flags.find((f) => f.key === 'mainnet.refunds');
      expect(target?.enabled).toBe(true);
      expect(target?.rolloutPercentage).toBe(100);
    });

    it('captures error in bootstrapStatus when JSON is malformed', () => {
      const result = service.parseBootstrapFlags('{malformed');

      expect(result.status.valid).toBe(false);
      expect(result.status.error).toBeDefined();
      expect(result.flags.some((f) => f.key === 'bulk_link_generation')).toBe(true);
    });

    it('returns full operational state including bootstrap health', async () => {
      mockSupabaseService.getClient.mockReturnValue({
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          order: jest.fn().mockResolvedValue({ data: [], error: null }),
        }),
      });

      const state = await service.getOperationalState();

      expect(state.storeAvailable).toBe(true);
      expect(state.bootstrapStatus).toBeDefined();
      expect(state.bootstrapStatus.valid).toBe(true);
    });
  });

  describe('FeatureFlagsController Endpoints', () => {
    let controller: FeatureFlagsController;

    const mockFeatureFlagsService = {
      listFlags: jest.fn().mockResolvedValue({ flags: [], source: 'store', storeAvailable: true }),
      getOperationalState: jest.fn().mockResolvedValue({
        source: 'store',
        storeAvailable: true,
        cacheExpiresAt: 1000,
        bootstrapStatus: { valid: true, parsedCount: 5, hasCustomBootstrap: false },
      }),
      getFlagOrThrow: jest.fn().mockResolvedValue({ key: 'test_flag', enabled: true }),
      evaluateFlag: jest.fn().mockResolvedValue({ key: 'test_flag', enabled: true, reason: 'enabled', source: 'store' }),
    };

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        controllers: [FeatureFlagsController],
        providers: [
          { provide: FeatureFlagsService, useValue: mockFeatureFlagsService },
        ],
      }).compile();

      controller = module.get<FeatureFlagsController>(FeatureFlagsController);
    });

    it('delegates listFlags to service', async () => {
      const res = await controller.listFlags();
      expect(res.storeAvailable).toBe(true);
      expect(mockFeatureFlagsService.listFlags).toHaveBeenCalled();
    });

    it('delegates getOperationalState to service', async () => {
      const res = await controller.getOperationalState();
      expect(res.bootstrapStatus.valid).toBe(true);
      expect(mockFeatureFlagsService.getOperationalState).toHaveBeenCalled();
    });

    it('delegates evaluateFlag to service', async () => {
      const res = await controller.evaluateFlag('test_flag', { environment: 'test' });
      expect(res.enabled).toBe(true);
      expect(mockFeatureFlagsService.evaluateFlag).toHaveBeenCalledWith('test_flag', { environment: 'test' });
    });
  });
});
