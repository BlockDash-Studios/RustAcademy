import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ContractsService } from './contracts.service';

// ---------------------------------------------------------------------------
// Helper to create a valid source account (56-char string starting with G)
// ---------------------------------------------------------------------------
const validSourceAccount = 'G' + 'A'.repeat(55);
const validDeployer = 'G' + 'B'.repeat(55);

describe('ContractsService', () => {
  let service: ContractsService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContractsService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: unknown) => {
              const overrides: Record<string, unknown> = {
                CONTRACT_INGESTION_ENABLED: 'true',
                CONTRACT_EVENT_REPLAY_ENABLED: 'true',
                CONTRACT_REPLAY_MAX_EVENTS: 1000,
                CONTRACT_EVENT_RETENTION_DAYS: 90,
                CONTRACT_NETWORK: 'testnet',
              };
              return overrides[key] ?? defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<ContractsService>(ContractsService);
    configService = module.get<ConfigService>(ConfigService);
  });

  // =========================================================================
  // Reputation
  // =========================================================================

  describe('getReputation(userId)', () => {
    it('returns default reputation for unknown user', () => {
      const rep = service.getReputation('unknown-user');
      expect(rep).toMatchObject({ userId: 'unknown-user', score: 0, level: 1 });
      expect(rep.lastUpdated).toBeInstanceOf(Date);
    });

    it('returns updated reputation after updateReputation', () => {
      service.updateReputation('user1', 350);
      const rep = service.getReputation('user1');
      expect(rep.score).toBe(350);
      expect(rep.level).toBe(4); // floor(350/100) + 1
    });
  });

  describe('updateReputation(userId, score)', () => {
    it('returns success with data', () => {
      const result = service.updateReputation('user1', 500);
      expect(result.success).toBe(true);
      expect(result.data.score).toBe(500);
    });

    it('level is computed from score', () => {
      const result = service.updateReputation('user2', 0);
      expect(result.data.level).toBe(1);

      const result2 = service.updateReputation('user2', 999);
      expect(result2.data.level).toBe(10); // floor(999/100) + 1
    });
  });

  // =========================================================================
  // Certificates
  // =========================================================================

  describe('issueCertificate(userId, courseId)', () => {
    it('issues a certificate with auto-generated id', () => {
      const result = service.issueCertificate('user1', 'course-rust-101');
      expect(result.success).toBe(true);
      expect(result.data.userId).toBe('user1');
      expect(result.data.courseId).toBe('course-rust-101');
      expect(result.data.id).toMatch(/^cert_/);
      expect(result.data.issuedAt).toBeInstanceOf(Date);
    });
  });

  describe('getCertificate(id)', () => {
    it('returns an issued certificate', () => {
      const { data } = service.issueCertificate('user1', 'course-1');
      const cert = service.getCertificate(data.id);
      expect(cert.id).toBe(data.id);
    });

    it('throws NotFoundException for unknown id', () => {
      expect(() => service.getCertificate('cert_nonexistent')).toThrow(
        NotFoundException,
      );
    });
  });

  describe('listCertificates(userId)', () => {
    it('returns certificates for a user', () => {
      service.issueCertificate('alice', 'c1');
      service.issueCertificate('alice', 'c2');
      service.issueCertificate('bob', 'c3');

      const aliceCerts = service.listCertificates('alice');
      expect(aliceCerts).toHaveLength(2);
      expect(aliceCerts.every((c) => c.userId === 'alice')).toBe(true);
    });

    it('returns empty array for user with no certificates', () => {
      expect(service.listCertificates('nobody')).toEqual([]);
    });
  });

  // =========================================================================
  // Badges
  // =========================================================================

  describe('issueBadge(userId, badgeType)', () => {
    it('issues a badge with auto-generated id', () => {
      const result = service.issueBadge('user1', 'streak-master');
      expect(result.success).toBe(true);
      expect(result.data.userId).toBe('user1');
      expect(result.data.badgeType).toBe('streak-master');
      expect(result.data.id).toMatch(/^badge_/);
      expect(result.data.issuedAt).toBeInstanceOf(Date);
    });
  });

  describe('getBadge(id)', () => {
    it('returns an issued badge', () => {
      const { data } = service.issueBadge('user1', 'early-adopter');
      const badge = service.getBadge(data.id);
      expect(badge.id).toBe(data.id);
    });

    it('throws NotFoundException for unknown id', () => {
      expect(() => service.getBadge('badge_nonexistent')).toThrow(
        NotFoundException,
      );
    });
  });

  describe('listBadges(userId)', () => {
    it('returns badges for a user', () => {
      service.issueBadge('alice', 'contributor');
      service.issueBadge('alice', 'streak-master');
      service.issueBadge('bob', 'early-adopter');

      const aliceBadges = service.listBadges('alice');
      expect(aliceBadges).toHaveLength(2);
      expect(aliceBadges.every((b) => b.userId === 'alice')).toBe(true);
    });

    it('returns empty array for user with no badges', () => {
      expect(service.listBadges('nobody')).toEqual([]);
    });
  });

  // =========================================================================
  // Payouts
  // =========================================================================

  describe('createPayout(userId, amount, currency)', () => {
    it('creates a pending payout', () => {
      const result = service.createPayout('user1', 100, 'XLM');
      expect(result.success).toBe(true);
      expect(result.data.status).toBe('pending');
      expect(result.data.amount).toBe(100);
      expect(result.data.currency).toBe('XLM');
      expect(result.data.id).toMatch(/^payout_/);
    });
  });

  describe('getPayout(id)', () => {
    it('returns a created payout', () => {
      const { data } = service.createPayout('user1', 50, 'USDC');
      const payout = service.getPayout(data.id);
      expect(payout.id).toBe(data.id);
    });

    it('throws NotFoundException for unknown id', () => {
      expect(() => service.getPayout('payout_nonexistent')).toThrow(
        NotFoundException,
      );
    });
  });

  describe('releasePayout(id)', () => {
    it('transitions payout status to completed', () => {
      const { data } = service.createPayout('user1', 50, 'XLM');
      const result = service.releasePayout(data.id);
      expect(result.success).toBe(true);
      expect(result.data.status).toBe('completed');
    });

    it('throws NotFoundException for unknown id', () => {
      expect(() => service.releasePayout('payout_nonexistent')).toThrow(
        NotFoundException,
      );
    });
  });

  // =========================================================================
  // Governance
  // =========================================================================

  describe('createProposal(title, description, proposer)', () => {
    it('creates an active proposal', () => {
      const result = service.createProposal('Increase rewards', 'Double XP for all', 'user1');
      expect(result.success).toBe(true);
      expect(result.data.status).toBe('active');
      expect(result.data.yesVotes).toBe(0);
      expect(result.data.noVotes).toBe(0);
      expect(result.data.id).toMatch(/^prop_/);
    });
  });

  describe('getProposal(id)', () => {
    it('returns a created proposal', () => {
      const { data } = service.createProposal('Title', 'Desc', 'user1');
      const prop = service.getProposal(data.id);
      expect(prop.id).toBe(data.id);
    });

    it('throws NotFoundException for unknown id', () => {
      expect(() => service.getProposal('prop_nonexistent')).toThrow(
        NotFoundException,
      );
    });
  });

  describe('listProposals()', () => {
    it('returns all proposals', () => {
      service.createProposal('P1', 'Desc 1', 'user1');
      service.createProposal('P2', 'Desc 2', 'user2');
      expect(service.listProposals()).toHaveLength(2);
    });

    it('returns empty array when no proposals exist', () => {
      // Fresh service from beforeEach already has none
      expect(service.listProposals()).toEqual([]);
    });
  });

  describe('castVote(proposalId, userId, vote)', () => {
    it('casts a yes vote', () => {
      const { data } = service.createProposal('Title', 'Desc', 'user1');
      const result = service.castVote(data.id, 'voter1', 'yes');
      expect(result.success).toBe(true);
      expect(result.data!.yesVotes).toBe(1);
    });

    it('casts a no vote', () => {
      const { data } = service.createProposal('Title', 'Desc', 'user1');
      const result = service.castVote(data.id, 'voter1', 'no');
      expect(result.data!.noVotes).toBe(1);
    });

    it('throws NotFoundException for unknown proposal', () => {
      expect(() =>
        service.castVote('prop_nonexistent', 'voter1', 'yes'),
      ).toThrow(NotFoundException);
    });
  });

  // =========================================================================
  // Contract deployment
  // =========================================================================

  describe('deployContract(dto)', () => {
    it('deploys a contract successfully', async () => {
      const result = await service.deployContract({
        contractId: 'CRUSTDEFIABCDEFGHIJKLMNOPQRSTUVWXYZ12',
        wasmHash: 'a'.repeat(64),
        deployedBy: validDeployer,
        network: 'testnet',
      });

      expect(result.contractId).toBe('CRUSTDEFIABCDEFGHIJKLMNOPQRSTUVWXYZ12');
      expect(result.wasmHash).toBe('a'.repeat(64));
      expect(result.network).toBe('testnet');
      expect(result.deployedAt).toBeInstanceOf(Date);
    });

    it('throws on duplicate deployment', async () => {
      const dto = {
        contractId: 'CRUSTDEFIABCDEFGHIJKLMNOPQRSTUVWXYZ99',
        wasmHash: 'b'.repeat(64),
        deployedBy: validDeployer,
        network: 'testnet',
      };
      await service.deployContract(dto);
      await expect(service.deployContract(dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws on invalid contractId (empty)', async () => {
      await expect(
        service.deployContract({
          contractId: '',
          wasmHash: 'a'.repeat(64),
          deployedBy: validDeployer,
          network: 'testnet',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =========================================================================
  // Contract invocation
  // =========================================================================

  describe('invokeContract(dto)', () => {
    const contractId = 'CRUSTDEFIABCDEFGHIJKLMNOPQRSTUVWXYZ42';

    beforeEach(async () => {
      await service.deployContract({
        contractId,
        wasmHash: 'c'.repeat(64),
        deployedBy: validDeployer,
        network: 'testnet',
      });
      // Make simulateInvocation deterministic: always succeed
      jest.spyOn(Math, 'random').mockReturnValue(0.1);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('invokes a contract method successfully', async () => {
      const result = await service.invokeContract({
        contractId,
        method: 'transfer',
        args: ['alice', 'bob', '100'],
        sourceAccount: validSourceAccount,
      });

      expect(result.success).toBe(true);
      expect(result.contractId).toBe(contractId);
      expect(result.method).toBe('transfer');
      expect(result.invocationId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(result.transactionHash).toHaveLength(64);
      expect(result.executedAt).toBeInstanceOf(Date);
    });

    it('throws when contract is not deployed', async () => {
      await expect(
        service.invokeContract({
          contractId: 'CRUSTDEFIABCDEFGHIJKLMNOPQRSTUVWXYZ99',
          method: 'balance',
          args: [],
          sourceAccount: validSourceAccount,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws on invalid source account (wrong prefix)', async () => {
      await expect(
        service.invokeContract({
          contractId,
          method: 'balance',
          args: [],
          sourceAccount: 'X' + 'A'.repeat(55),
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws on invalid source account (wrong length)', async () => {
      await expect(
        service.invokeContract({
          contractId,
          method: 'balance',
          args: [],
          sourceAccount: 'GABC',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws on missing source account', async () => {
      await expect(
        service.invokeContract({
          contractId,
          method: 'balance',
          args: [],
          sourceAccount: '',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws on missing contractId', async () => {
      await expect(
        service.invokeContract({
          contractId: '',
          method: 'balance',
          args: [],
          sourceAccount: validSourceAccount,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('balance method returns token amount', async () => {
      const result = await service.invokeContract({
        contractId,
        method: 'balance',
        args: [],
        sourceAccount: validSourceAccount,
      });

      expect(result.success).toBe(true);
      const val = result.result as { amount: string; token: string };
      expect(val.token).toBe('XLM');
      expect(parseFloat(val.amount)).toBeGreaterThan(0);
    });

    it('allowance method returns owner/spender/amount', async () => {
      const result = await service.invokeContract({
        contractId,
        method: 'allowance',
        args: ['owner1', 'spender1'],
        sourceAccount: validSourceAccount,
      });

      expect(result.success).toBe(true);
      const val = result.result as { owner: string; spender: string; amount: string };
      expect(val.owner).toBe('owner1');
      expect(val.spender).toBe('spender1');
    });
  });

  // =========================================================================
  // getContractInfo / getContractHealth / getInvocationHistory / deployments
  // =========================================================================

  describe('getContractInfo(contractId)', () => {
    it('returns contract info for deployed contract', async () => {
      const contractId = 'CRUSTDEFIABCDEFGHIJKLMNOPQRSTUVWXYZ77';
      await service.deployContract({
        contractId,
        wasmHash: 'd'.repeat(64),
        deployedBy: validDeployer,
        network: 'futurenet',
      });

      const info = await service.getContractInfo(contractId);
      expect(info.contractId).toBe(contractId);
      expect(info.network).toBe('futurenet');
      expect(info.methods).toContain('transfer');
      expect(info.methods).toContain('balance');
    });

    it('throws on non-existent contract', async () => {
      await expect(
        service.getContractInfo('CRUSTDEFIABCDEFGHIJKLMNOPQRSTUVWXYZ99'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getContractHealth(contractId)', () => {
    it('returns inactive for never-invoked contract', async () => {
      const contractId = 'CRUSTDEFIABCDEFGHIJKLMNOPQRSTUVWXYZ88';
      await service.deployContract({
        contractId,
        wasmHash: 'e'.repeat(64),
        deployedBy: validDeployer,
        network: 'testnet',
      });

      const health = await service.getContractHealth(contractId);
      expect(health.status).toBe('inactive');
      expect(health.invocationCount).toBe(0);
    });

    it('returns active after invocation', async () => {
      const contractId = 'CRUSTDEFIABCDEFGHIJKLMNOPQRSTUVWXYZ55';
      await service.deployContract({
        contractId,
        wasmHash: 'f'.repeat(64),
        deployedBy: validDeployer,
        network: 'testnet',
      });
      await service.invokeContract({
        contractId,
        method: 'balance',
        args: [],
        sourceAccount: validSourceAccount,
      });

      const health = await service.getContractHealth(contractId);
      expect(health.status).toBe('active');
      expect(health.invocationCount).toBe(1);
    });
  });

  describe('getInvocationHistory(contractId)', () => {
    it('returns empty array for no invocations', async () => {
      const history = await service.getInvocationHistory('CRUSTDEFIABCDEFGHIJKLMNOPQRSTUVWXYZ00');
      expect(history).toEqual([]);
    });

    it('returns invocations in order', async () => {
      const contractId = 'CRUSTDEFIABCDEFGHIJKLMNOPQRSTUVWXYZ33';
      await service.deployContract({
        contractId,
        wasmHash: 'g'.repeat(64),
        deployedBy: validDeployer,
        network: 'testnet',
      });
      await service.invokeContract({
        contractId,
        method: 'balance',
        args: [],
        sourceAccount: validSourceAccount,
      });
      await service.invokeContract({
        contractId,
        method: 'transfer',
        args: ['a', 'b', '10'],
        sourceAccount: validSourceAccount,
      });

      const history = await service.getInvocationHistory(contractId);
      expect(history).toHaveLength(2);
      expect(history[0].method).toBe('balance');
      expect(history[1].method).toBe('transfer');
    });
  });

  describe('getAllDeployments()', () => {
    it('returns all deployments', async () => {
      await service.deployContract({
        contractId: 'CRUSTDEFIABCDEFGHIJKLMNOPQRSTUVWXYZ11',
        wasmHash: 'h'.repeat(64),
        deployedBy: validDeployer,
        network: 'testnet',
      });
      await service.deployContract({
        contractId: 'CRUSTDEFIABCDEFGHIJKLMNOPQRSTUVWXYZ22',
        wasmHash: 'i'.repeat(64),
        deployedBy: validDeployer,
        network: 'futurenet',
      });

      const deployments = await service.getAllDeployments();
      expect(deployments).toHaveLength(2);
    });
  });

  // =========================================================================
  // #394: Event log
  // =========================================================================

  describe('getEventLog(contractId, options?)', () => {
    it('returns events matching contractId', async () => {
      const contractId = 'CRUSTDEFIABCDEFGHIJKLMNOPQRSTUVWXYZ66';
      await service.deployContract({
        contractId,
        wasmHash: 'j'.repeat(64),
        deployedBy: validDeployer,
        network: 'testnet',
      });

      const events = service.getEventLog(contractId);
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].contractId).toBe(contractId);
      expect(events[0].eventType).toBe('deploy');
    });

    it('filters only unreplayed events', async () => {
      const contractId = 'CRUSTDEFIABCDEFGHIJKLMNOPQRSTUVWXYZ44';
      await service.deployContract({
        contractId,
        wasmHash: 'k'.repeat(64),
        deployedBy: validDeployer,
        network: 'testnet',
      });

      // All events start as unreplayed
      const unreplayed = service.getEventLog(contractId, { onlyUnreplayed: true });
      expect(unreplayed.length).toBeGreaterThan(0);
      expect(unreplayed.every((e) => !e.replayed)).toBe(true);
    });

    it('respects limit option', async () => {
      const contractId = 'CRUSTDEFIABCDEFGHIJKLMNOPQRSTUVWXYZ09';
      await service.deployContract({
        contractId,
        wasmHash: 'l'.repeat(64),
        deployedBy: validDeployer,
        network: 'testnet',
      });
      // Invoke several times to create multiple events
      for (let i = 0; i < 5; i++) {
        await service.invokeContract({
          contractId,
          method: 'balance',
          args: [],
          sourceAccount: validSourceAccount,
        });
      }

      const events = service.getEventLog(contractId, { limit: 2 });
      expect(events).toHaveLength(2);
    });
  });

  // =========================================================================
  // #394: Event replay
  // =========================================================================

  describe('replayEvents(contractId, options?)', () => {
    it('replays events and marks them as replayed', async () => {
      const contractId = 'CRUSTDEFIABCDEFGHIJKLMNOPQRSTUVWXYZ08';
      await service.deployContract({
        contractId,
        wasmHash: 'm'.repeat(64),
        deployedBy: validDeployer,
        network: 'testnet',
      });

      const result = await service.replayEvents(contractId);
      expect(result.status).toBe('completed');
      expect(result.eventsProcessed).toBeGreaterThan(0);
      expect(result.eventsSucceeded).toBe(result.eventsProcessed);
      expect(result.eventsFailed).toBe(0);
      expect(result.replayId).toMatch(/^replay_/);
    });

    it('returns empty result for contract with no events', async () => {
      const result = await service.replayEvents('CRUSTDEFIABCDEFGHIJKLMNOPQRSTUVWXYZ00');
      expect(result.eventsProcessed).toBe(0);
      expect(result.status).toBe('completed');
    });

    it('respects maxEvents option', async () => {
      const contractId = 'CRUSTDEFIABCDEFGHIJKLMNOPQRSTUVWXYZ07';
      await service.deployContract({
        contractId,
        wasmHash: 'n'.repeat(64),
        deployedBy: validDeployer,
        network: 'testnet',
      });
      for (let i = 0; i < 5; i++) {
        await service.invokeContract({
          contractId,
          method: 'balance',
          args: [],
          sourceAccount: validSourceAccount,
        });
      }

      const result = await service.replayEvents(contractId, { maxEvents: 2 });
      expect(result.eventsProcessed).toBeLessThanOrEqual(2);
    });
  });

  // =========================================================================
  // #394: State reconciliation
  // =========================================================================

  describe('reconcileState(contractId)', () => {
    it('returns consistent state for deployed contract', async () => {
      const contractId = 'CRUSTDEFIABCDEFGHIJKLMNOPQRSTUVWXYZ06';
      await service.deployContract({
        contractId,
        wasmHash: 'o'.repeat(64),
        deployedBy: validDeployer,
        network: 'testnet',
      });

      const result = await service.reconcileState(contractId);
      expect(result.contractId).toBe(contractId);
      expect(result.isConsistent).toBe(true);
      expect(result.reconciledAt).toBeInstanceOf(Date);
    });

    it('reports critical discrepancy for non-existent contract', async () => {
      const result = await service.reconcileState('CRUSTDEFIABCDEFGHIJKLMNOPQRSTUVWXYZ99');
      expect(result.isConsistent).toBe(false);
      expect(result.discrepancies.some((d) => d.severity === 'critical')).toBe(true);
    });

    it('reports warning for invocation count mismatch (after some invocations)', async () => {
      const contractId = 'CRUSTDEFIABCDEFGHIJKLMNOPQRSTUVWXYZ05';
      await service.deployContract({
        contractId,
        wasmHash: 'p'.repeat(64),
        deployedBy: validDeployer,
        network: 'testnet',
      });
      await service.invokeContract({
        contractId,
        method: 'balance',
        args: [],
        sourceAccount: validSourceAccount,
      });

      const result = await service.reconcileState(contractId);
      // After invocation, counts should match (1 event, 1 count)
      expect(result.isConsistent).toBe(true);
    });
  });

  // =========================================================================
  // #394: Replay history & stats
  // =========================================================================

  describe('getReplayHistory(contractId?)', () => {
    it('returns empty array when no replays exist', () => {
      expect(service.getReplayHistory()).toEqual([]);
    });

    it('returns replay records after replayEvents', async () => {
      const contractId = 'CRUSTDEFIABCDEFGHIJKLMNOPQRSTUVWXYZ04';
      await service.deployContract({
        contractId,
        wasmHash: 'q'.repeat(64),
        deployedBy: validDeployer,
        network: 'testnet',
      });
      await service.replayEvents(contractId);

      const history = service.getReplayHistory();
      expect(history.length).toBeGreaterThan(0);
    });

    it('filters by contractId', async () => {
      const history = service.getReplayHistory('CRUSTDEFIABCDEFGHIJKLMNOPQRSTUVWXYZ00');
      expect(history).toEqual([]);
    });
  });

  describe('getEventLogStats()', () => {
    it('returns zero totals when no events', () => {
      const stats = service.getEventLogStats();
      expect(stats.totalEvents).toBe(0);
      expect(stats.unreplayedEvents).toBe(0);
    });

    it('returns correct totals after deployment and invocation', async () => {
      const contractId = 'CRUSTDEFIABCDEFGHIJKLMNOPQRSTUVWXYZ03';
      await service.deployContract({
        contractId,
        wasmHash: 'r'.repeat(64),
        deployedBy: validDeployer,
        network: 'testnet',
      });

      const stats = service.getEventLogStats();
      expect(stats.totalEvents).toBeGreaterThan(0);
      expect(stats.eventsByContract[contractId]).toBeDefined();
    });
  });

  // =========================================================================
  // #396: IContractAdapter methods
  // =========================================================================

  describe('recordReward(userId, amount, reason)', () => {
    it('returns transaction hash and block number', async () => {
      const result = await service.recordReward('user1', 100, 'course-completion');
      expect(result.transactionHash).toHaveLength(64);
      expect(result.blockNumber).toBeGreaterThan(0);
    });
  });

  describe('recordPayment(fromUserId, toUserId, amount, currency, memo?)', () => {
    it('records a payment between two users', async () => {
      const result = await service.recordPayment('alice', 'bob', 50, 'XLM', 'thanks!');
      expect(result.transactionHash).toHaveLength(64);
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('works without a memo', async () => {
      const result = await service.recordPayment('alice', 'bob', 50, 'USDC');
      expect(result.transactionHash).toHaveLength(64);
    });
  });

  describe('mintCertificate(userId, courseId, metadata)', () => {
    it('returns tokenId and transaction hash', async () => {
      const result = await service.mintCertificate('user1', 'rust-101', { grade: 'A' });
      expect(result.tokenId).toMatch(/^cert_/);
      expect(result.transactionHash).toHaveLength(64);
    });
  });

  describe('mintBadge(userId, badgeType, metadata)', () => {
    it('returns tokenId and transaction hash', async () => {
      const result = await service.mintBadge('user1', 'streak-master', {
        streakDays: 30,
      });
      expect(result.tokenId).toMatch(/^badge_/);
      expect(result.transactionHash).toHaveLength(64);
    });
  });

  describe('healthCheck()', () => {
    it('returns healthy when ingestion is enabled', async () => {
      const result = await service.healthCheck();
      expect(result.isHealthy).toBe(true);
      expect(result.network).toBe('testnet');
      expect(result.latency).toBeGreaterThanOrEqual(0);
    });
  });

  // =========================================================================
  // Feature flag: ingestion disabled
  // =========================================================================

  describe('when CONTRACT_INGESTION_ENABLED is false', () => {
    let disabledService: ContractsService;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ContractsService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string, defaultValue?: unknown) => {
                const overrides: Record<string, unknown> = {
                  CONTRACT_INGESTION_ENABLED: 'false',
                  CONTRACT_EVENT_REPLAY_ENABLED: 'true',
                  CONTRACT_NETWORK: 'testnet',
                };
                return overrides[key] ?? defaultValue;
              }),
            },
          },
        ],
      }).compile();

      disabledService = module.get<ContractsService>(ContractsService);
    });

    it('throws when invoking a contract', async () => {
      await expect(
        disabledService.invokeContract({
          contractId: 'CRUSTDEFIABCDEFGHIJKLMNOPQRSTUVWXYZ01',
          method: 'balance',
          args: [],
          sourceAccount: validSourceAccount,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('healthCheck reports unhealthy', async () => {
      const result = await disabledService.healthCheck();
      expect(result.isHealthy).toBe(false);
    });
  });

  // =========================================================================
  // Feature flag: replay disabled
  // =========================================================================

  describe('when CONTRACT_EVENT_REPLAY_ENABLED is false', () => {
    let disabledService: ContractsService;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ContractsService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string, defaultValue?: unknown) => {
                const overrides: Record<string, unknown> = {
                  CONTRACT_INGESTION_ENABLED: 'true',
                  CONTRACT_EVENT_REPLAY_ENABLED: 'false',
                  CONTRACT_NETWORK: 'testnet',
                };
                return overrides[key] ?? defaultValue;
              }),
            },
          },
        ],
      }).compile();

      disabledService = module.get<ContractsService>(ContractsService);
    });

    it('throws when replaying events', async () => {
      await expect(
        disabledService.replayEvents('CRUSTDEFIABCDEFGHIJKLMNOPQRSTUVWXYZ01'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
