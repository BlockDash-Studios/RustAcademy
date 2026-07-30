import { Test, TestingModule } from '@nestjs/testing';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';
import { ContractRegistryService } from './contract-registry.service';
import { MetricsService } from '../monitoring/metrics.service';
import {
  ContractDeployment,
  ContractEventLogEntry,
  ContractHealth,
  ContractInfo,
  ContractInvocationResult,
  ContractRegistryEntry,
  ReplayResult,
  StateReconciliationResult,
} from './interfaces/contracts.interface';

// ---------------------------------------------------------------------------
// Type-safe mock helpers
// ---------------------------------------------------------------------------

type DeepPartial<T> = T extends object
  ? { [P in keyof T]?: DeepPartial<T[P]> }
  : T;

type MockService<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R
    ? jest.Mock<R, A>
    : T[K];
};

// ---------------------------------------------------------------------------

describe('ContractsController', () => {
  let controller: ContractsController;
  let contractsService: MockService<ContractsService>;
  let registryService: MockService<ContractRegistryService>;
  let metricsService: MockService<MetricsService>;

  beforeEach(async () => {
    const mockContractsService: MockService<ContractsService> = {
      getReputation: jest.fn(),
      updateReputation: jest.fn(),
      issueCertificate: jest.fn(),
      getCertificate: jest.fn(),
      listCertificates: jest.fn(),
      issueBadge: jest.fn(),
      getBadge: jest.fn(),
      listBadges: jest.fn(),
      createPayout: jest.fn(),
      getPayout: jest.fn(),
      releasePayout: jest.fn(),
      createProposal: jest.fn(),
      getProposal: jest.fn(),
      listProposals: jest.fn(),
      castVote: jest.fn(),
      invokeContract: jest.fn(),
      deployContract: jest.fn(),
      getContractInfo: jest.fn(),
      getContractHealth: jest.fn(),
      getInvocationHistory: jest.fn(),
      getAllDeployments: jest.fn(),
      getEventLog: jest.fn(),
      replayEvents: jest.fn(),
      reconcileState: jest.fn(),
      getReplayHistory: jest.fn(),
      getEventLogStats: jest.fn(),
      healthCheck: jest.fn(),
      recordReward: jest.fn(),
      recordPayment: jest.fn(),
      mintCertificate: jest.fn(),
      mintBadge: jest.fn(),
    };

    const mockRegistryService: MockService<ContractRegistryService> = {
      register: jest.fn(),
      get: jest.fn(),
      list: jest.fn(),
      deregister: jest.fn(),
    } as unknown as MockService<ContractRegistryService>;

    const mockMetricsService: MockService<MetricsService> = {
      incrementCounter: jest.fn(),
      setGauge: jest.fn(),
      recordLatency: jest.fn(),
      getAllMetrics: jest.fn(),
      trackRequest: jest.fn(),
      getRequestStats: jest.fn(),
      getCronHealth: jest.fn(),
      recordCronRun: jest.fn(),
      recordCronError: jest.fn(),
    } as unknown as MockService<MetricsService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContractsController],
      providers: [
        { provide: ContractsService, useValue: mockContractsService },
        { provide: ContractRegistryService, useValue: mockRegistryService },
        { provide: MetricsService, useValue: mockMetricsService },
      ],
    }).compile();

    controller = module.get<ContractsController>(ContractsController);
    contractsService = module.get(ContractsService) as unknown as MockService<ContractsService>;
    registryService = module.get(ContractRegistryService) as unknown as MockService<ContractRegistryService>;
    metricsService = module.get(MetricsService) as unknown as MockService<MetricsService>;
  });

  // =========================================================================
  // Reputation endpoints
  // =========================================================================

  describe('GET contracts/reputation/:userId', () => {
    it('delegates to contractsService.getReputation', () => {
      const expected = { userId: 'user1', score: 100, level: 2, lastUpdated: new Date() };
      contractsService.getReputation.mockReturnValue(expected);

      const result = controller.getReputation('user1');
      expect(result).toBe(expected);
      expect(contractsService.getReputation).toHaveBeenCalledWith('user1');
    });
  });

  describe('POST contracts/reputation/:userId', () => {
    it('delegates to contractsService.updateReputation', () => {
      const expected = { success: true, data: { userId: 'user1', score: 500, level: 6, lastUpdated: new Date() } };
      contractsService.updateReputation.mockReturnValue(expected);

      const result = controller.updateReputation('user1', 500);
      expect(result).toBe(expected);
      expect(contractsService.updateReputation).toHaveBeenCalledWith('user1', 500);
    });
  });

  // =========================================================================
  // Certificate endpoints
  // =========================================================================

  describe('POST contracts/certificates/issue', () => {
    it('delegates to contractsService.issueCertificate', () => {
      const expected = { success: true, data: { id: 'cert_1', userId: 'user1', courseId: 'course-1', issuedAt: new Date() } };
      contractsService.issueCertificate.mockReturnValue(expected);

      const result = controller.issueCertificate('user1', 'course-1');
      expect(result).toBe(expected);
      expect(contractsService.issueCertificate).toHaveBeenCalledWith('user1', 'course-1');
    });
  });

  describe('GET contracts/certificates/:id', () => {
    it('delegates to contractsService.getCertificate', () => {
      const expected = { id: 'cert_abc', userId: 'user1', courseId: 'c1', issuedAt: new Date() };
      contractsService.getCertificate.mockReturnValue(expected);

      const result = controller.getCertificate('cert_abc');
      expect(result).toBe(expected);
    });
  });

  describe('GET contracts/certificates/user/:userId', () => {
    it('delegates to contractsService.listCertificates', () => {
      const expected = [{ id: 'cert_1', userId: 'user1', courseId: 'c1', issuedAt: new Date() }];
      contractsService.listCertificates.mockReturnValue(expected);

      const result = controller.listCertificates('user1');
      expect(result).toBe(expected);
    });
  });

  // =========================================================================
  // Badge endpoints
  // =========================================================================

  describe('POST contracts/badges/issue', () => {
    it('delegates to contractsService.issueBadge', () => {
      const expected = { success: true, data: { id: 'badge_1', userId: 'user1', badgeType: 'streak-master', issuedAt: new Date() } };
      contractsService.issueBadge.mockReturnValue(expected);

      const result = controller.issueBadge('user1', 'streak-master');
      expect(result).toBe(expected);
      expect(contractsService.issueBadge).toHaveBeenCalledWith('user1', 'streak-master');
    });
  });

  describe('GET contracts/badges/:id', () => {
    it('delegates to contractsService.getBadge', () => {
      const expected = { id: 'badge_abc', userId: 'user1', badgeType: 'early-adopter', issuedAt: new Date() };
      contractsService.getBadge.mockReturnValue(expected);
      expect(controller.getBadge('badge_abc')).toBe(expected);
    });
  });

  describe('GET contracts/badges/user/:userId', () => {
    it('delegates to contractsService.listBadges', () => {
      const expected = [{ id: 'badge_1', userId: 'user1', badgeType: 'a', issuedAt: new Date() }];
      contractsService.listBadges.mockReturnValue(expected);
      expect(controller.listBadges('user1')).toBe(expected);
    });
  });

  // =========================================================================
  // Payout endpoints
  // =========================================================================

  describe('POST contracts/payouts/create', () => {
    it('delegates to contractsService.createPayout', () => {
      const expected = { success: true, data: { id: 'payout_1', userId: 'user1', amount: 100, currency: 'XLM', status: 'pending' as const, createdAt: new Date() } };
      contractsService.createPayout.mockReturnValue(expected);

      const result = controller.createPayout('user1', 100, 'XLM');
      expect(result).toBe(expected);
    });
  });

  describe('GET contracts/payouts/:id', () => {
    it('delegates to contractsService.getPayout', () => {
      const expected = { id: 'payout_abc', userId: 'user1', amount: 100, currency: 'XLM', status: 'pending' as const, createdAt: new Date() };
      contractsService.getPayout.mockReturnValue(expected);
      expect(controller.getPayout('payout_abc')).toBe(expected);
    });
  });

  describe('POST contracts/payouts/:id/release', () => {
    it('delegates to contractsService.releasePayout', () => {
      const expected = { success: true, data: { id: 'payout_abc', userId: 'user1', amount: 100, currency: 'XLM', status: 'completed' as const, createdAt: new Date() } };
      contractsService.releasePayout.mockReturnValue(expected);
      expect(controller.releasePayout('payout_abc')).toBe(expected);
    });
  });

  // =========================================================================
  // Governance endpoints
  // =========================================================================

  describe('POST contracts/governance/proposals', () => {
    it('delegates to contractsService.createProposal', () => {
      const dto = { title: 'T', description: 'D', proposer: 'user1' };
      const expected = {
        success: true,
        message: 'Proposal created',
        data: {
          id: 'prop_1', title: 'T', description: 'D', proposer: 'user1',
          yesVotes: 0, noVotes: 0, status: 'active' as const, createdAt: new Date(),
        },
      };
      contractsService.createProposal.mockReturnValue(expected);

      const result = controller.createProposal(dto);
      expect(result).toBe(expected);
      expect(contractsService.createProposal).toHaveBeenCalledWith('T', 'D', 'user1');
    });
  });

  describe('GET contracts/governance/proposals', () => {
    it('delegates to contractsService.listProposals', () => {
      const expected = [{
        id: 'prop_1', title: 'T', description: 'D', proposer: 'user1',
        yesVotes: 0, noVotes: 0, status: 'active' as const, createdAt: new Date(),
      }];
      contractsService.listProposals.mockReturnValue(expected);
      expect(controller.listProposals()).toBe(expected);
    });
  });

  describe('GET contracts/governance/proposals/:id', () => {
    it('delegates to contractsService.getProposal', () => {
      const expected = {
        id: 'prop_1', title: 'T', description: 'D', proposer: 'user1',
        yesVotes: 0, noVotes: 0, status: 'active' as const, createdAt: new Date(),
      };
      contractsService.getProposal.mockReturnValue(expected);
      expect(controller.getProposal('prop_1')).toBe(expected);
    });
  });

  describe('POST contracts/governance/proposals/:id/vote', () => {
    it('delegates to contractsService.castVote', () => {
      const dto = { userId: 'voter1', vote: 'yes' as const };
      const expected = {
        success: true,
        message: 'Vote cast as yes',
        data: {
          id: 'prop_1', title: 'T', description: 'D', proposer: 'user1',
          yesVotes: 1, noVotes: 0, status: 'active' as const, createdAt: new Date(),
        },
      };
      contractsService.castVote.mockReturnValue(expected);

      const result = controller.castVote('prop_1', dto);
      expect(result).toBe(expected);
      expect(contractsService.castVote).toHaveBeenCalledWith('prop_1', 'voter1', 'yes');
    });
  });

  // =========================================================================
  // Invocation & deployment (gated #395)
  // =========================================================================

  describe('POST contracts/invoke', () => {
    it('delegates to contractsService.invokeContract and records metrics', async () => {
      const dto = {
        contractId: 'CRUSTDEFIABCDEFGHIJKLMNOPQRSTUVWXYZ42',
        method: 'transfer',
        args: ['a', 'b', '100'],
        sourceAccount: 'G' + 'A'.repeat(55),
      };
      const expected: ContractInvocationResult = {
        invocationId: 'inv_1',
        contractId: dto.contractId,
        method: 'transfer',
        success: true,
        result: { ok: true },
        transactionHash: 'a'.repeat(64),
        executedAt: new Date(),
      };
      contractsService.invokeContract.mockResolvedValue(expected);

      const result = await controller.invokeContract(dto);
      expect(result).toBe(expected);
      expect(metricsService.incrementCounter).toHaveBeenCalledWith(
        'contract_invocations_total',
        1,
        { contractId: dto.contractId, method: dto.method },
      );
    });
  });

  describe('POST contracts/deploy', () => {
    it('delegates to contractsService.deployContract and records metrics', async () => {
      const dto = {
        contractId: 'CRUSTDEFIABCDEFGHIJKLMNOPQRSTUVWXYZ42',
        wasmHash: 'a'.repeat(64),
        deployedBy: 'G' + 'B'.repeat(55),
        network: 'testnet',
      };
      const expected: ContractDeployment = {
        contractId: dto.contractId,
        wasmHash: dto.wasmHash,
        deployedBy: dto.deployedBy,
        network: 'testnet',
        deployedAt: new Date(),
      };
      contractsService.deployContract.mockResolvedValue(expected);

      const result = await controller.deployContract(dto);
      expect(result).toBe(expected);
      expect(metricsService.incrementCounter).toHaveBeenCalledWith(
        'contract_deployments_total',
        1,
        { network: dto.network },
      );
    });
  });

  describe('GET contracts/:contractId', () => {
    it('delegates to contractsService.getContractInfo', async () => {
      const expected: ContractInfo = {
        contractId: 'c1',
        wasmHash: 'a'.repeat(64),
        network: 'testnet',
        deployedBy: 'G'.repeat(56),
        deployedAt: new Date(),
        methods: ['balance'],
      };
      contractsService.getContractInfo.mockResolvedValue(expected);

      const result = await controller.getContractInfo('c1');
      expect(result).toBe(expected);
    });
  });

  describe('GET contracts/:contractId/health', () => {
    it('delegates to contractsService.getContractHealth', async () => {
      const expected: ContractHealth = { contractId: 'c1', status: 'active', invocationCount: 5, network: 'testnet' };
      contractsService.getContractHealth.mockResolvedValue(expected);
      expect(await controller.getContractHealth('c1')).toBe(expected);
    });
  });

  describe('GET contracts/:contractId/history', () => {
    it('delegates to contractsService.getInvocationHistory', async () => {
      const expected: ContractInvocationResult[] = [{
        invocationId: 'inv_1',
        contractId: 'c1',
        method: 'balance',
        success: true,
        result: { amount: '100' },
        transactionHash: 'a'.repeat(64),
        executedAt: new Date(),
      }];
      contractsService.getInvocationHistory.mockResolvedValue(expected);
      expect(await controller.getInvocationHistory('c1')).toBe(expected);
    });
  });

  describe('GET contracts/', () => {
    it('delegates to contractsService.getAllDeployments', async () => {
      const expected: ContractDeployment[] = [{
        contractId: 'c1',
        wasmHash: 'a'.repeat(64),
        deployedBy: 'G'.repeat(56),
        network: 'testnet',
        deployedAt: new Date(),
      }];
      contractsService.getAllDeployments.mockResolvedValue(expected);
      expect(await controller.getAllDeployments()).toBe(expected);
    });
  });

  // =========================================================================
  // #393: Registry endpoints
  // =========================================================================

  describe('POST contracts/registry/register', () => {
    it('delegates to registryService.register and records metrics', async () => {
      const entry = {
        contractId: 'CRUSTDEFIABCDEFGHIJKLMNOPQRSTUVWXYZ12',
        wasmHash: 'a'.repeat(64),
        network: 'testnet' as const,
        deployedBy: 'G' + 'B'.repeat(55),
        version: 1,
        schema: { version: '1.0.0', contractType: 'token', entryPoints: ['transfer'] },
      };
      const expected: ContractRegistryEntry = {
        ...entry,
        id: 'uuid',
        registeredAt: new Date(),
        validatedAt: new Date(),
        validationStatus: 'valid' as const,
      };
      registryService.register.mockResolvedValue(expected);

      const result = await controller.registerContract(entry);
      expect(result).toBe(expected);
      expect(metricsService.incrementCounter).toHaveBeenCalledWith(
        'contract_registry_entries_total',
        1,
        { network: 'testnet', status: 'valid' },
      );
    });
  });

  describe('GET contracts/registry', () => {
    it('delegates to registryService.list and includes total', async () => {
      const entries: ContractRegistryEntry[] = [{
        id: 'uuid',
        contractId: 'c1',
        wasmHash: 'a'.repeat(64),
        network: 'testnet',
        deployedBy: 'G'.repeat(56),
        registeredAt: new Date(),
        validatedAt: new Date(),
        validationStatus: 'valid',
      }];
      registryService.list.mockReturnValue(entries);

      const result = await controller.listRegistry();
      expect(result.entries).toBe(entries);
    });

    it('passes filter to registryService.list', async () => {
      registryService.list.mockReturnValue([]);

      const filter = { network: 'testnet' };
      await controller.listRegistry(filter);
      expect(registryService.list).toHaveBeenCalledWith(filter);
    });
  });

  describe('GET contracts/registry/:contractId', () => {
    it('returns entry when found', async () => {
      const expected: ContractRegistryEntry = {
        id: 'uuid',
        contractId: 'c1',
        wasmHash: 'a'.repeat(64),
        network: 'testnet',
        deployedBy: 'G'.repeat(56),
        registeredAt: new Date(),
        validatedAt: new Date(),
        validationStatus: 'valid',
      };
      registryService.get.mockReturnValue(expected);
      expect(await controller.getRegistryEntry('c1')).toBe(expected);
    });

    it('returns error object when not found', async () => {
      registryService.get.mockReturnValue(undefined);
      const result = await controller.getRegistryEntry('c1');
      expect(result).toEqual({
        error: 'CONTRACT_NOT_FOUND',
        message: 'Contract c1 not found in registry',
      });
    });
  });

  describe('DELETE contracts/registry/:contractId', () => {
    it('delegates to registryService.deregister and records metrics on success', async () => {
      registryService.deregister.mockReturnValue(true);

      const result = await controller.deregisterContract('c1');
      expect(result).toEqual({ success: true, contractId: 'c1' });
      expect(metricsService.incrementCounter).toHaveBeenCalledWith(
        'contract_registry_deregistrations_total',
        1,
        { contractId: 'c1' },
      );
    });

    it('does not record metrics on failure', async () => {
      registryService.deregister.mockReturnValue(false);

      const result = await controller.deregisterContract('c1');
      expect(result).toEqual({ success: false, contractId: 'c1' });
      // Only check that deregistration was not called with a matching counter
      expect(registryService.deregister).toHaveBeenCalledWith('c1');
    });
  });

  // =========================================================================
  // #394: Event replay & reconciliation endpoints
  // =========================================================================

  describe('GET contracts/:contractId/events', () => {
    it('delegates to contractsService.getEventLog with parsed options', async () => {
      const expected: ContractEventLogEntry[] = [{
        eventId: 'evt_1',
        contractId: 'c1',
        eventType: 'invoke',
        payload: {},
        recordedAt: new Date(),
        sequenceNumber: 1,
        replayed: false,
      }];
      contractsService.getEventLog.mockReturnValue(expected);

      const result = await controller.getEventLog('c1', 'true', '10');
      expect(result).toBe(expected);
      expect(contractsService.getEventLog).toHaveBeenCalledWith('c1', {
        onlyUnreplayed: true,
        limit: 10,
      });
    });

    it('works without query params', async () => {
      contractsService.getEventLog.mockReturnValue([]);
      await controller.getEventLog('c1');
      expect(contractsService.getEventLog).toHaveBeenCalledWith('c1', {
        onlyUnreplayed: false,
        limit: undefined,
      });
    });
  });

  describe('POST contracts/:contractId/replay', () => {
    it('delegates to contractsService.replayEvents and records metrics', async () => {
      const expected: ReplayResult = {
        replayId: 'replay_1',
        contractId: 'c1',
        eventsProcessed: 5,
        eventsSucceeded: 5,
        eventsFailed: 0,
        status: 'completed' as const,
        startedAt: new Date(),
        completedAt: new Date(),
      };
      contractsService.replayEvents.mockResolvedValue(expected);

      const result = await controller.replayEvents('c1', { maxEvents: 10 });
      expect(result).toBe(expected);
      expect(metricsService.incrementCounter).toHaveBeenCalledWith(
        'contract_replays_total',
        1,
        { contractId: 'c1', status: 'completed' },
      );
    });
  });

  describe('GET contracts/:contractId/reconcile', () => {
    it('delegates to contractsService.reconcileState and records metrics', async () => {
      const expected: StateReconciliationResult = {
        contractId: 'c1',
        isConsistent: true,
        eventLogCount: 5,
        currentStateVersion: 5,
        discrepancies: [],
        reconciledAt: new Date(),
      };
      contractsService.reconcileState.mockResolvedValue(expected);

      const result = await controller.reconcileState('c1');
      expect(result).toBe(expected);
      expect(metricsService.incrementCounter).toHaveBeenCalledWith(
        'contract_reconciliations_total',
        1,
        { contractId: 'c1', consistent: 'true' },
      );
    });
  });

  describe('GET contracts/events/stats', () => {
    it('delegates to contractsService.getEventLogStats', async () => {
      const expected = { totalEvents: 10, unreplayedEvents: 3, eventsByContract: {} };
      contractsService.getEventLogStats.mockReturnValue(expected);
      expect(await controller.getEventLogStats()).toBe(expected);
    });
  });

  describe('GET contracts/replay/history', () => {
    it('delegates to contractsService.getReplayHistory', async () => {
      const expected: ReplayResult[] = [{
        replayId: 'replay_1',
        contractId: 'c1',
        eventsProcessed: 5,
        eventsSucceeded: 5,
        eventsFailed: 0,
        status: 'completed',
        startedAt: new Date(),
        completedAt: new Date(),
      }];
      contractsService.getReplayHistory.mockReturnValue(expected);

      const result = await controller.getReplayHistory('c1');
      expect(result).toBe(expected);
      expect(contractsService.getReplayHistory).toHaveBeenCalledWith('c1');
    });

    it('works without contractId filter', async () => {
      contractsService.getReplayHistory.mockReturnValue([]);
      await controller.getReplayHistory();
      expect(contractsService.getReplayHistory).toHaveBeenCalledWith(undefined);
    });
  });

  // =========================================================================
  // #396: Adapter health
  // =========================================================================

  describe('GET contracts/adapter/health', () => {
    it('delegates to contractsService.healthCheck', async () => {
      const expected = { isHealthy: true, network: 'testnet', latency: 5 };
      contractsService.healthCheck.mockResolvedValue(expected);
      expect(await controller.adapterHealth()).toBe(expected);
    });
  });
});
