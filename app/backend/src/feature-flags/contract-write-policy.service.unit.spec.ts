import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';

import { AppConfigService } from '../config/app-config.service';
import { AuditService } from '../audit/audit.service';
import { FeatureFlagsService } from './feature-flags.service';
import { ContractWritePolicyService } from './contract-write-policy.service';

describe('ContractWritePolicyService', () => {
  let service: ContractWritePolicyService;
  let configService: AppConfigService;
  let featureFlagsService: FeatureFlagsService;
  let auditService: AuditService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContractWritePolicyService,
        {
          provide: AppConfigService,
          useValue: {
            network: 'testnet',
            isTestnet: true,
          },
        },
        {
          provide: FeatureFlagsService,
          useValue: {
            evaluateFlag: jest.fn(),
            evaluateFlagFresh: jest.fn(),
          },
        },
        {
          provide: AuditService,
          useValue: {
            log: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ContractWritePolicyService>(ContractWritePolicyService);
    configService = module.get<AppConfigService>(AppConfigService);
    featureFlagsService = module.get<FeatureFlagsService>(FeatureFlagsService);
    auditService = module.get<AuditService>(AuditService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkWritePermission', () => {
    it('should allow write when flag is enabled', async () => {
      (featureFlagsService.evaluateFlagFresh as jest.Mock).mockResolvedValue({
        enabled: true,
        reason: 'enabled',
        source: 'store',
      });

      const result = await service.checkWritePermission({
        userId: 'test-user',
        operation: 'test.operation',
        contractId: 'test-contract',
      });

      expect(result.allowed).toBe(true);
      expect(result.decision).toBe('allowed');
      expect(auditService.log).toHaveBeenCalledWith(
        'test-user',
        'contract_write_policy.decision',
        'test.operation',
        expect.objectContaining({
          decision: 'allowed',
          reason: 'enabled',
        }),
      );
    });

    it('should block write when flag is disabled', async () => {
      (featureFlagsService.evaluateFlagFresh as jest.Mock).mockResolvedValue({
        enabled: false,
        reason: 'kill-switch',
        source: 'store',
      });

      const result = await service.checkWritePermission({
        userId: 'test-user',
        operation: 'test.operation',
        contractId: 'test-contract',
      });

      expect(result.allowed).toBe(false);
      expect(result.decision).toBe('blocked');
      expect(auditService.log).toHaveBeenCalledWith(
        'test-user',
        'contract_write_policy.decision',
        'test.operation',
        expect.objectContaining({
          decision: 'blocked',
          reason: 'kill-switch',
        }),
      );
    });

    it('should use evaluateFlagFresh for testnet', async () => {
      (featureFlagsService.evaluateFlagFresh as jest.Mock).mockResolvedValue({
        enabled: true,
        reason: 'enabled',
        source: 'store',
      });

      await service.checkWritePermission({
        userId: 'test-user',
        operation: 'test.operation',
      });

      expect(featureFlagsService.evaluateFlagFresh).toHaveBeenCalled();
      expect(featureFlagsService.evaluateFlag).not.toHaveBeenCalled();
    });

    it('should use evaluateFlag for mainnet', async () => {
      Object.defineProperty(configService, 'network', { value: 'mainnet', configurable: true, writable: true });
      Object.defineProperty(configService, 'isTestnet', { value: false, configurable: true, writable: true });

      (featureFlagsService.evaluateFlag as jest.Mock).mockResolvedValue({
        enabled: true,
        reason: 'enabled',
        source: 'store',
      });

      await service.checkWritePermission({
        userId: 'test-user',
        operation: 'test.operation',
      });

      expect(featureFlagsService.evaluateFlag).toHaveBeenCalled();
      expect(featureFlagsService.evaluateFlagFresh).not.toHaveBeenCalled();
    });

    it('should include additional context in audit log', async () => {
      (featureFlagsService.evaluateFlagFresh as jest.Mock).mockResolvedValue({
        enabled: true,
        reason: 'enabled',
        source: 'store',
      });

      await service.checkWritePermission({
        userId: 'test-user',
        operation: 'test.operation',
        contractId: 'test-contract',
        contractName: 'test-contract-name',
        network: 'testnet',
        additionalContext: {
          customField: 'custom-value',
        },
      });

      expect(auditService.log).toHaveBeenCalledWith(
        'test-user',
        'contract_write_policy.decision',
        'test.operation',
        expect.objectContaining({
          decision: 'allowed',
          contractId: 'test-contract',
          contractName: 'test-contract-name',
          network: 'testnet',
          customField: 'custom-value',
        }),
      );
    });
  });

  describe('assertWritePermission', () => {
    it('should not throw when write is allowed', async () => {
      (featureFlagsService.evaluateFlagFresh as jest.Mock).mockResolvedValue({
        enabled: true,
        reason: 'enabled',
        source: 'store',
      });

      await expect(
        service.assertWritePermission({
          userId: 'test-user',
          operation: 'test.operation',
        }),
      ).resolves.not.toThrow();
    });

    it('should throw ServiceUnavailableException when write is blocked', async () => {
      (featureFlagsService.evaluateFlagFresh as jest.Mock).mockResolvedValue({
        enabled: false,
        reason: 'kill-switch',
        source: 'store',
      });

      await expect(
        service.assertWritePermission({
          userId: 'test-user',
          operation: 'test.operation',
        }),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('should include error details in exception', async () => {
      (featureFlagsService.evaluateFlagFresh as jest.Mock).mockResolvedValue({
        enabled: false,
        reason: 'kill-switch',
        source: 'store',
      });

      try {
        await service.assertWritePermission({
          userId: 'test-user',
          operation: 'test.operation',
        });
        fail('Should have thrown ServiceUnavailableException');
      } catch (error) {
        expect(error).toBeInstanceOf(ServiceUnavailableException);
        expect(error.response).toMatchObject({
          code: 'CONTRACT_WRITES_DISABLED',
          error: 'CONTRACT_WRITES_DISABLED',
          flag: 'testnet.contract_writes',
          reason: 'kill-switch',
        });
      }
    });
  });

  describe('isWriteAllowed', () => {
    it('should return true when write is allowed', async () => {
      (featureFlagsService.evaluateFlagFresh as jest.Mock).mockResolvedValue({
        enabled: true,
        reason: 'enabled',
        source: 'store',
      });

      const result = await service.isWriteAllowed({
        userId: 'test-user',
        operation: 'test.operation',
      });

      expect(result).toBe(true);
    });

    it('should return false when write is blocked', async () => {
      (featureFlagsService.evaluateFlagFresh as jest.Mock).mockResolvedValue({
        enabled: false,
        reason: 'kill-switch',
        source: 'store',
      });

      const result = await service.isWriteAllowed({
        userId: 'test-user',
        operation: 'test.operation',
      });

      expect(result).toBe(false);
    });
  });
});
