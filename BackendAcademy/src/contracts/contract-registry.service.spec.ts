import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ContractRegistryService } from './contract-registry.service';
import { ContractRegistryEntry } from './interfaces/contracts.interface';

// ---------------------------------------------------------------------------
// Helper to build a valid registry entry
// ---------------------------------------------------------------------------
const validEntry = (overrides?: Partial<Omit<ContractRegistryEntry, 'id' | 'registeredAt' | 'validatedAt' | 'validationStatus'>>) => ({
  contractId: 'CRUSTDEFIABCDEFGHIJKLMNOPQRSTUVWXYZ12',
  wasmHash: 'a'.repeat(64),
  network: 'testnet' as const,
  deployedBy: 'G' + 'B'.repeat(55),
  version: 1,
  schema: {
    version: '1.0.0',
    contractType: 'token',
    entryPoints: ['transfer', 'balance', 'approve'],
    methods: [
      { name: 'transfer', args: ['from', 'to', 'amount'], returnType: 'bool' },
      { name: 'balance', args: ['owner'], returnType: 'u128' },
    ],
    isMainnetCompatible: false,
    metadata: { author: 'rustacademy' },
  },
  ...overrides,
});

describe('ContractRegistryService', () => {
  let service: ContractRegistryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContractRegistryService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: unknown) => {
              const overrides: Record<string, unknown> = {
                CONTRACT_REGISTRY_REQUIRE_SCHEMA: 'true',
                CONTRACT_SCHEMA_VERSION: '1.0.0',
                CONTRACT_REGISTRY_MAX_ENTRIES: 1000,
              };
              return overrides[key] ?? defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<ContractRegistryService>(ContractRegistryService);
  });

  // =========================================================================
  // register()
  // =========================================================================

  describe('register(entry)', () => {
    it('registers a valid contract entry', async () => {
      const result = await service.register(validEntry());

      expect(result.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(result.contractId).toBe('CRUSTDEFIABCDEFGHIJKLMNOPQRSTUVWXYZ12');
      expect(result.validationStatus).toBe('valid');
      expect(result.registeredAt).toBeInstanceOf(Date);
      expect(result.validatedAt).toBeInstanceOf(Date);
    });

    it('throws on missing contractId', async () => {
      await expect(
        service.register(validEntry({ contractId: '' })),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws on invalid contractId format', async () => {
      await expect(
        service.register(validEntry({ contractId: 'bad-format' })),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws on missing wasmHash', async () => {
      await expect(
        service.register(validEntry({ wasmHash: '' })),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws on invalid wasmHash format', async () => {
      await expect(
        service.register(validEntry({ wasmHash: 'not-hex' })),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws on missing network', async () => {
      await expect(
        service.register(validEntry({ network: undefined as unknown as 'testnet' })),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws on invalid network value', async () => {
      await expect(
        service.register(validEntry({ network: 'ethereum' as 'testnet' })),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws on missing deployedBy', async () => {
      await expect(
        service.register(validEntry({ deployedBy: '' })),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws on invalid deployedBy (wrong prefix)', async () => {
      await expect(
        service.register(validEntry({ deployedBy: 'X' + 'B'.repeat(55) })),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws on invalid deployedBy (wrong length)', async () => {
      await expect(
        service.register(validEntry({ deployedBy: 'GABC' })),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws on invalid version (negative)', async () => {
      await expect(
        service.register(validEntry({ version: -1 })),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws on version 0', async () => {
      await expect(
        service.register(validEntry({ version: 0 })),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws on invalid version (not a number)', async () => {
      await expect(
        service.register(validEntry({ version: 'abc' as unknown as number })),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws on duplicate contractId', async () => {
      await service.register(validEntry());
      await expect(service.register(validEntry())).rejects.toThrow(
        BadRequestException,
      );
    });

    // ── Schema compatibility ───────────────────────────────────────

    it('throws when schema is missing and requireSchema is true', async () => {
      await expect(
        service.register(validEntry({ schema: undefined })),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws on incompatible schema version', async () => {
      await expect(
        service.register(
          validEntry({ schema: { ...validEntry().schema!, version: '2.0.0' } }),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws when schema has no entryPoints', async () => {
      await expect(
        service.register(
          validEntry({ schema: { ...validEntry().schema!, entryPoints: [] } }),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws when schema has no contractType', async () => {
      await expect(
        service.register(
          validEntry({ schema: { ...validEntry().schema!, contractType: '' } }),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts mainnet contract without mainnet compatibility flag (status: valid)', async () => {
      const result = await service.register(
        validEntry({
          network: 'mainnet',
          schema: { ...validEntry().schema!, isMainnetCompatible: false },
        }),
      );
      expect(result.validationStatus).toBe('valid');
    });

    it('accepts schema with compatible minor version bump', async () => {
      const result = await service.register(
        validEntry({ schema: { ...validEntry().schema!, version: '1.5.0' } }),
      );
      expect(result.validationStatus).toBe('valid');
    });
  });

  // =========================================================================
  // get()
  // =========================================================================

  describe('get(contractId)', () => {
    it('returns an entry for a registered contract', async () => {
      await service.register(validEntry());
      const entry = service.get('CRUSTDEFIABCDEFGHIJKLMNOPQRSTUVWXYZ12');
      expect(entry).toBeDefined();
      expect(entry!.contractId).toBe('CRUSTDEFIABCDEFGHIJKLMNOPQRSTUVWXYZ12');
    });

    it('returns undefined for unknown contract', () => {
      expect(service.get('CRUSTDEFIABCDEFGHIJKLMNOPQRSTUVWXYZ99')).toBeUndefined();
    });
  });

  // =========================================================================
  // list()
  // =========================================================================

  describe('list(filter?)', () => {
    beforeEach(async () => {
      await service.register(validEntry({ contractId: 'CRUSTDEFIABCDEFGHIJKLMNOPQRSTUVWXYZ11' }));
      await service.register(
        validEntry({
          contractId: 'CRUSTDEFIABCDEFGHIJKLMNOPQRSTUVWXYZ22',
          network: 'futurenet',
          deployedBy: 'G' + 'C'.repeat(55),
        }),
      );
    });

    it('returns all entries without filter', () => {
      expect(service.list()).toHaveLength(2);
    });

    it('filters by network', () => {
      const results = service.list({ network: 'futurenet' });
      expect(results).toHaveLength(1);
      expect(results[0].network).toBe('futurenet');
    });

    it('filters by validationStatus', () => {
      const results = service.list({ validationStatus: 'valid' });
      expect(results.every((e) => e.validationStatus === 'valid')).toBe(true);
    });

    it('filters by deployedBy', () => {
      const results = service.list({ deployedBy: 'G' + 'C'.repeat(55) });
      expect(results).toHaveLength(1);
      expect(results[0].deployedBy).toBe('G' + 'C'.repeat(55));
    });

    it('returns empty array when no matches', () => {
      expect(service.list({ network: 'mainnet' })).toEqual([]);
    });
  });

  // =========================================================================
  // deregister()
  // =========================================================================

  describe('deregister(contractId)', () => {
    it('removes a registered contract', async () => {
      await service.register(validEntry());
      expect(service.deregister('CRUSTDEFIABCDEFGHIJKLMNOPQRSTUVWXYZ12')).toBe(true);
      expect(service.get('CRUSTDEFIABCDEFGHIJKLMNOPQRSTUVWXYZ12')).toBeUndefined();
    });

    it('returns false for unknown contract', () => {
      expect(service.deregister('CRUSTDEFIABCDEFGHIJKLMNOPQRSTUVWXYZ99')).toBe(false);
    });
  });

  // =========================================================================
  // count
  // =========================================================================

  describe('count', () => {
    it('starts at 0', () => {
      expect(service.count).toBe(0);
    });

    it('increments after registration', async () => {
      await service.register(validEntry());
      expect(service.count).toBe(1);
    });

    it('decrements after deregistration', async () => {
      await service.register(validEntry());
      service.deregister('CRUSTDEFIABCDEFGHIJKLMNOPQRSTUVWXYZ12');
      expect(service.count).toBe(0);
    });
  });

  // =========================================================================
  // Max entries enforcement
  // =========================================================================

  describe('max entries enforcement', () => {
    it('throws when registry is full', async () => {
      // Create service with max of 1
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ContractRegistryService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string, defaultValue?: unknown) => {
                const overrides: Record<string, unknown> = {
                  CONTRACT_REGISTRY_REQUIRE_SCHEMA: 'true',
                  CONTRACT_SCHEMA_VERSION: '1.0.0',
                  CONTRACT_REGISTRY_MAX_ENTRIES: 1,
                };
                return overrides[key] ?? defaultValue;
              }),
            },
          },
        ],
      }).compile();

      const limitedService = module.get<ContractRegistryService>(ContractRegistryService);

      await limitedService.register(validEntry({ contractId: 'CRUSTDEFIABCDEFGHIJKLMNOPQRSTUVWXYZ01' }));

      await expect(
        limitedService.register(validEntry({ contractId: 'CRUSTDEFIABCDEFGHIJKLMNOPQRSTUVWXYZ02' })),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =========================================================================
  // Schema not required (permissive mode)
  // =========================================================================

  describe('when CONTRACT_REGISTRY_REQUIRE_SCHEMA is false', () => {
    let permissiveService: ContractRegistryService;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ContractRegistryService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string, defaultValue?: unknown) => {
                const overrides: Record<string, unknown> = {
                  CONTRACT_REGISTRY_REQUIRE_SCHEMA: 'false',
                  CONTRACT_SCHEMA_VERSION: '1.0.0',
                  CONTRACT_REGISTRY_MAX_ENTRIES: 1000,
                };
                return overrides[key] ?? defaultValue;
              }),
            },
          },
        ],
      }).compile();

      permissiveService = module.get<ContractRegistryService>(ContractRegistryService);
    });

    it('accepts entries with schema issues as warnings', async () => {
      const result = await permissiveService.register(
        validEntry({ schema: { ...validEntry().schema!, version: '2.0.0' } }),
      );
      expect(result.validationStatus).toBe('warning');
    });
  });
});
