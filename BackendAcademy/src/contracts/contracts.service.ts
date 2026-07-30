import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { InvokeContractDto, DeployContractDto } from './dto/invoke-contract.dto';
import {
  ContractDeployment,
  ContractHealth,
  ContractInfo,
  ContractInvocationResult,
  ContractEventLogEntry,
  ReplayResult,
  StateReconciliationResult,
  StateDiscrepancy,
  IContractAdapter,
} from './interfaces/contracts.interface';
import { isFeatureEnabled } from '../config/env.schema';

/**
 * Contracts service providing:
 * - Contract deployment & invocation (existing)
 * - Reputation, certificates, badges, payouts, governance (existing)
 * - Event log for replay (#394)
 * - State reconciliation (#394)
 * - Adapter boundary for isolating contract integration (#396)
 */
@Injectable()
export class ContractsService implements IContractAdapter {
  private readonly logger = new Logger(ContractsService.name);
  private readonly deployments = new Map<string, ContractDeployment>();
  private readonly invocationHistory = new Map<string, ContractInvocationResult[]>();
  private readonly invocationCounts = new Map<string, number>();

  // ── Existing domain stores ─────────────────────────────────────
  private readonly reputations = new Map<string, { userId: string; score: number; level: number; lastUpdated: Date }>();
  private readonly certificates = new Map<string, { id: string; userId: string; courseId: string; issuedAt: Date }>();
  private readonly badges = new Map<string, { id: string; userId: string; badgeType: string; issuedAt: Date }>();
  private readonly payouts = new Map<string, { id: string; userId: string; amount: number; currency: string; status: 'pending' | 'completed' | 'failed'; createdAt: Date }>();
  private readonly proposals = new Map<string, {
    id: string; title: string; description: string; proposer: string;
    yesVotes: number; noVotes: number;
    status: 'active' | 'passed' | 'rejected'; createdAt: Date;
  }>();

  // ── #394: Event log for replay ──────────────────────────────────
  private readonly eventLog: ContractEventLogEntry[] = [];
  private eventSequenceCounter = 0;

  // ── Feature flags ──────────────────────────────────────────────
  private readonly replayEnabled: boolean;
  private readonly ingestionEnabled: boolean;

  constructor(private readonly configService: ConfigService) {
    this.replayEnabled = isFeatureEnabled(
      this.configService.get<string>('CONTRACT_EVENT_REPLAY_ENABLED'),
    );
    this.ingestionEnabled = isFeatureEnabled(
      this.configService.get<string>('CONTRACT_INGESTION_ENABLED'),
    );
  }

  // ──────────────────────────────────────────────────────────────────
  // Reputation
  // ──────────────────────────────────────────────────────────────────

  getReputation(userId: string) {
    return this.reputations.get(userId) ?? { userId, score: 0, level: 1, lastUpdated: new Date() };
  }

  updateReputation(userId: string, score: number) {
    const record = { userId, score, level: Math.floor(score / 100) + 1, lastUpdated: new Date() };
    this.reputations.set(userId, record);
    return { success: true, data: record };
  }

  // ──────────────────────────────────────────────────────────────────
  // Certificates
  // ──────────────────────────────────────────────────────────────────

  issueCertificate(userId: string, courseId: string) {
    const cert = { id: `cert_${uuidv4()}`, userId, courseId, issuedAt: new Date() };
    this.certificates.set(cert.id, cert);
    return { success: true, data: cert };
  }

  getCertificate(id: string) {
    const cert = this.certificates.get(id);
    if (!cert) throw new NotFoundException('Certificate not found');
    return cert;
  }

  listCertificates(userId: string) {
    return Array.from(this.certificates.values()).filter((c) => c.userId === userId);
  }

  // ──────────────────────────────────────────────────────────────────
  // Badges
  // ──────────────────────────────────────────────────────────────────

  issueBadge(userId: string, badgeType: string) {
    const badge = { id: `badge_${uuidv4()}`, userId, badgeType, issuedAt: new Date() };
    this.badges.set(badge.id, badge);
    return { success: true, data: badge };
  }

  getBadge(id: string) {
    const badge = this.badges.get(id);
    if (!badge) throw new NotFoundException('Badge not found');
    return badge;
  }

  listBadges(userId: string) {
    return Array.from(this.badges.values()).filter((b) => b.userId === userId);
  }

  // ──────────────────────────────────────────────────────────────────
  // Payouts
  // ──────────────────────────────────────────────────────────────────

  createPayout(userId: string, amount: number, currency: string) {
    const payout = {
      id: `payout_${uuidv4()}`, userId, amount, currency,
      status: 'pending' as const, createdAt: new Date(),
    };
    this.payouts.set(payout.id, payout);
    return { success: true, data: payout };
  }

  getPayout(id: string) {
    const payout = this.payouts.get(id);
    if (!payout) throw new NotFoundException('Payout not found');
    return payout;
  }

  releasePayout(id: string) {
    const payout = this.payouts.get(id);
    if (!payout) throw new NotFoundException('Payout not found');
    payout.status = 'completed';
    return { success: true, data: payout };
  }

  // ──────────────────────────────────────────────────────────────────
  // Governance
  // ──────────────────────────────────────────────────────────────────

  createProposal(title: string, description: string, proposer: string) {
    const proposal = {
      id: `prop_${uuidv4()}`, title, description, proposer,
      yesVotes: 0, noVotes: 0,
      status: 'active' as const, createdAt: new Date(),
    };
    this.proposals.set(proposal.id, proposal);
    return { success: true, message: 'Proposal created', data: proposal };
  }

  getProposal(id: string) {
    const proposal = this.proposals.get(id);
    if (!proposal) throw new NotFoundException('Proposal not found');
    return proposal;
  }

  listProposals() {
    return Array.from(this.proposals.values());
  }

  castVote(proposalId: string, userId: string, vote: 'yes' | 'no') {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) throw new NotFoundException('Proposal not found');
    if (proposal.status !== 'active') {
      return { success: false, message: 'Proposal is no longer active' };
    }
    if (vote === 'yes') proposal.yesVotes++;
    else proposal.noVotes++;
    return { success: true, message: `Vote cast as ${vote}`, data: proposal };
  }

  // ──────────────────────────────────────────────────────────────────
  // Contract invocation & deployment
  // ──────────────────────────────────────────────────────────────────

  async invokeContract(dto: InvokeContractDto): Promise<ContractInvocationResult> {
    this.validateContractId(dto.contractId);
    this.validateSourceAccount(dto.sourceAccount);

    if (!this.ingestionEnabled) {
      throw new BadRequestException({
        error: 'CONTRACT_INGESTION_DISABLED',
        message:
          'Contract ingestion is disabled. Set CONTRACT_INGESTION_ENABLED=true to enable.',
      });
    }

    const deployment = this.deployments.get(dto.contractId);
    if (!deployment) {
      throw new BadRequestException({
        error: 'CONTRACT_NOT_DEPLOYED',
        message: `Contract ${dto.contractId} has not been deployed yet`,
      });
    }

    const invocationId = uuidv4();
    const txHash = this.generateTransactionHash();
    const result = this.simulateInvocation(dto.method, dto.args);

    const invocationResult: ContractInvocationResult = {
      invocationId,
      contractId: dto.contractId,
      method: dto.method,
      success: result.success,
      result: result.value,
      error: result.error,
      transactionHash: txHash,
      executedAt: new Date(),
    };

    this.recordInvocation(dto.contractId, invocationResult);
    this.appendEventLog(dto.contractId, dto.method, {
      args: dto.args,
      sourceAccount: dto.sourceAccount,
      success: result.success,
      txHash,
      result: result.value,
    });

    return invocationResult;
  }

  async deployContract(dto: DeployContractDto): Promise<ContractDeployment> {
    this.validateContractId(dto.contractId);

    if (this.deployments.has(dto.contractId)) {
      throw new BadRequestException({
        error: 'CONTRACT_ALREADY_DEPLOYED',
        message: `Contract ${dto.contractId} is already deployed`,
      });
    }

    const deployment: ContractDeployment = {
      contractId: dto.contractId,
      wasmHash: dto.wasmHash,
      deployedAt: new Date(),
      deployedBy: dto.deployedBy,
      network: dto.network as ContractDeployment['network'],
    };

    this.deployments.set(dto.contractId, deployment);
    this.appendEventLog(dto.contractId, 'deploy', {
      wasmHash: dto.wasmHash,
      deployedBy: dto.deployedBy,
      network: dto.network,
    });

    return deployment;
  }

  async getContractInfo(contractId: string): Promise<ContractInfo> {
    const deployment = this.deployments.get(contractId);
    if (!deployment) {
      throw new BadRequestException({
        error: 'CONTRACT_NOT_FOUND',
        message: `Contract ${contractId} not found`,
      });
    }

    return {
      contractId: deployment.contractId,
      wasmHash: deployment.wasmHash,
      network: deployment.network,
      deployedBy: deployment.deployedBy,
      deployedAt: deployment.deployedAt,
      methods: ['transfer', 'balance', 'approve', 'burn', 'mint', 'allowance'],
    };
  }

  async getContractHealth(contractId: string): Promise<ContractHealth> {
    const count = this.invocationCounts.get(contractId) ?? 0;
    const history = this.invocationHistory.get(contractId) ?? [];
    const lastInvokedAt = history.length > 0 ? history[history.length - 1].executedAt : undefined;

    let status: ContractHealth['status'] = 'active';
    if (count === 0) {
      status = 'inactive';
    } else if (history.length > 0) {
      const last = history[history.length - 1];
      const hoursSinceLastInvocation =
        (Date.now() - last.executedAt.getTime()) / (1000 * 60 * 60);
      if (hoursSinceLastInvocation > 24) {
        status = 'degraded';
      }
    }

    return {
      contractId,
      status,
      lastInvokedAt,
      invocationCount: count,
      network: this.deployments.get(contractId)?.network ?? 'testnet',
    };
  }

  async getInvocationHistory(contractId: string): Promise<ContractInvocationResult[]> {
    return this.invocationHistory.get(contractId) ?? [];
  }

  async getAllDeployments(): Promise<ContractDeployment[]> {
    return Array.from(this.deployments.values());
  }

  // ──────────────────────────────────────────────────────────────────
  // #394: Event replay and state reconciliation
  // ──────────────────────────────────────────────────────────────────

  getEventLog(
    contractId: string,
    options?: { onlyUnreplayed?: boolean; limit?: number },
  ): ContractEventLogEntry[] {
    let events = this.eventLog.filter((e) => e.contractId === contractId);
    if (options?.onlyUnreplayed) {
      events = events.filter((e) => !e.replayed);
    }
    events.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
    if (options?.limit && options.limit > 0) {
      events = events.slice(0, options.limit);
    }
    return events;
  }

  async replayEvents(
    contractId: string,
    options?: { fromSequence?: number; maxEvents?: number },
  ): Promise<ReplayResult> {
    if (!this.replayEnabled) {
      throw new BadRequestException({
        error: 'EVENT_REPLAY_DISABLED',
        message: 'Contract event replay is disabled. Set CONTRACT_EVENT_REPLAY_ENABLED=true to enable.',
      });
    }

    const maxEvents = options?.maxEvents ?? this.configService.get<number>('CONTRACT_REPLAY_MAX_EVENTS', 1000);
    let events = this.eventLog.filter((e) => e.contractId === contractId);
    if (options?.fromSequence !== undefined) {
      events = events.filter((e) => e.sequenceNumber >= options!.fromSequence!);
    }
    events = events.slice(0, maxEvents);

    const replayId = `replay_${uuidv4()}`;
    const startedAt = new Date();
    let succeeded = 0;
    let failed = 0;
    const errors: Array<{ eventId: string; error: string }> = [];

    for (const event of events) {
      try {
        this.logger.debug(`Replaying event ${event.eventId} (seq=${event.sequenceNumber})`);
        event.replayed = true;
        event.replayedAt = new Date();
        event.replayId = replayId;
        succeeded++;
      } catch (err) {
        failed++;
        errors.push({ eventId: event.eventId, error: err instanceof Error ? err.message : String(err) });
        this.logger.error(`Replay failed for event ${event.eventId}: ${err}`);
      }
    }

    const completedAt = new Date();
    const result: ReplayResult = {
      replayId,
      contractId,
      eventsProcessed: events.length,
      eventsSucceeded: succeeded,
      eventsFailed: failed,
      status: failed === 0 ? 'completed' : failed === events.length ? 'failed' : 'partial',
      startedAt,
      completedAt,
      errors: errors.length > 0 ? errors : undefined,
    };

    this.logger.log(`Replay ${replayId} completed: ${succeeded}/${events.length} events (${result.status})`);
    return result;
  }

  async reconcileState(contractId: string): Promise<StateReconciliationResult> {
    const events = this.eventLog.filter((e) => e.contractId === contractId);
    const deployment = this.deployments.get(contractId);
    const discrepancies: StateDiscrepancy[] = [];

    if (!deployment) {
      discrepancies.push({ field: 'deployment', expected: 'exists', actual: 'missing', severity: 'critical' });
    }

    const invocationEvents = events.filter((e) => e.eventType === 'invoke');
    const recordedCount = this.invocationCounts.get(contractId) ?? 0;
    if (invocationEvents.length !== recordedCount) {
      discrepancies.push({ field: 'invocationCount', expected: invocationEvents.length, actual: recordedCount, severity: 'warning' });
    }

    const unreplayedCount = events.filter((e) => !e.replayed).length;
    if (unreplayedCount > 0) {
      discrepancies.push({ field: 'unreplayedEvents', expected: 0, actual: unreplayedCount, severity: 'info' });
    }

    return {
      contractId,
      isConsistent: discrepancies.filter((d) => d.severity === 'critical').length === 0,
      eventLogCount: events.length,
      currentStateVersion: this.invocationCounts.get(contractId) ?? 0,
      discrepancies,
      reconciledAt: new Date(),
    };
  }

  getReplayHistory(contractId?: string): ReplayResult[] {
    const replays: ReplayResult[] = [];
    const replayIds = new Set<string>();
    for (const event of this.eventLog) {
      if (event.replayId && !replayIds.has(event.replayId)) {
        replayIds.add(event.replayId);
        const contractEvents = this.eventLog.filter((e) => e.replayId === event.replayId);
        replays.push({
          replayId: event.replayId,
          contractId: event.contractId,
          eventsProcessed: contractEvents.length,
          eventsSucceeded: contractEvents.filter((e) => e.replayed).length,
          eventsFailed: contractEvents.filter((e) => !e.replayed).length,
          status: 'completed',
          startedAt: event.replayedAt ?? event.recordedAt,
          completedAt: event.replayedAt ?? event.recordedAt,
        });
      }
    }
    return contractId ? replays.filter((r) => r.contractId === contractId) : replays;
  }

  getEventLogStats(): {
    totalEvents: number;
    unreplayedEvents: number;
    eventsByContract: Record<string, number>;
  } {
    const eventsByContract: Record<string, number> = {};
    let unreplayed = 0;
    for (const event of this.eventLog) {
      eventsByContract[event.contractId] = (eventsByContract[event.contractId] ?? 0) + 1;
      if (!event.replayed) unreplayed++;
    }
    return { totalEvents: this.eventLog.length, unreplayedEvents: unreplayed, eventsByContract };
  }

  // ──────────────────────────────────────────────────────────────────
  // #396: IContractAdapter implementation
  // ──────────────────────────────────────────────────────────────────

  async recordReward(userId: string, amount: number, reason: string): Promise<{ transactionHash: string; blockNumber: number }> {
    const txHash = this.generateTransactionHash();
    this.logger.log(`[Adapter] Recording reward: userId=${userId}, amount=${amount}, reason=${reason}`);
    this.appendEventLog('reward_contract', 'record_reward', { userId, amount, reason, txHash });
    return { transactionHash: txHash, blockNumber: Date.now() };
  }

  async recordPayment(fromUserId: string, toUserId: string, amount: number, currency: string, memo?: string): Promise<{ transactionHash: string; timestamp: Date }> {
    const txHash = this.generateTransactionHash();
    const timestamp = new Date();
    this.logger.log(`[Adapter] Recording payment: from=${fromUserId} to=${toUserId}, amount=${amount} ${currency}`);
    this.appendEventLog('payment_contract', 'record_payment', { fromUserId, toUserId, amount, currency, memo, txHash });
    return { transactionHash: txHash, timestamp };
  }

  async mintCertificate(userId: string, courseId: string, metadata: Record<string, unknown>): Promise<{ tokenId: string; transactionHash: string }> {
    const tokenId = `cert_${uuidv4()}`;
    const txHash = this.generateTransactionHash();
    this.logger.log(`[Adapter] Minting certificate: userId=${userId}, courseId=${courseId}`);
    this.appendEventLog('certificate_contract', 'mint_certificate', { userId, courseId, metadata, tokenId, txHash });
    return { tokenId, transactionHash: txHash };
  }

  async mintBadge(userId: string, badgeType: string, metadata: Record<string, unknown>): Promise<{ tokenId: string; transactionHash: string }> {
    const tokenId = `badge_${uuidv4()}`;
    const txHash = this.generateTransactionHash();
    this.logger.log(`[Adapter] Minting badge: userId=${userId}, badgeType=${badgeType}`);
    this.appendEventLog('badge_contract', 'mint_badge', { userId, badgeType, metadata, tokenId, txHash });
    return { tokenId, transactionHash: txHash };
  }

  async healthCheck(): Promise<{ isHealthy: boolean; network: string; latency: number }> {
    const start = Date.now();
    const network = this.configService.get<string>('CONTRACT_NETWORK') ?? 'testnet';
    const latency = Date.now() - start;
    return { isHealthy: this.ingestionEnabled, network, latency };
  }

  // ──────────────────────────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────────────────────────

  private appendEventLog(contractId: string, eventType: string, payload: Record<string, unknown>): void {
    this.eventSequenceCounter++;
    const entry: ContractEventLogEntry = {
      eventId: `event_${uuidv4()}`,
      contractId,
      eventType,
      payload,
      recordedAt: new Date(),
      sequenceNumber: this.eventSequenceCounter,
      replayed: false,
    };
    this.eventLog.push(entry);
    this.pruneEventLog();
  }

  private pruneEventLog(): void {
    const retentionDays = this.configService.get<number>('CONTRACT_EVENT_RETENTION_DAYS', 90);
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const before = this.eventLog.length;
    const pruned = this.eventLog.filter((e) => e.recordedAt >= cutoff || !e.replayed);
    this.eventLog.length = 0;
    this.eventLog.push(...pruned);
    if (before !== this.eventLog.length) {
      this.logger.log(`Pruned ${before - this.eventLog.length} events older than ${retentionDays} days`);
    }
  }

  private validateContractId(contractId: string): void {
    if (!contractId || !contractId.trim()) {
      throw new BadRequestException({ error: 'INVALID_CONTRACT_ID', message: 'contractId is required' });
    }
  }

  private validateSourceAccount(sourceAccount: string): void {
    if (!sourceAccount || !sourceAccount.trim()) {
      throw new BadRequestException({ error: 'INVALID_SOURCE_ACCOUNT', message: 'sourceAccount is required' });
    }
    if (!sourceAccount.startsWith('G') || sourceAccount.length !== 56) {
      throw new BadRequestException({
        error: 'INVALID_SOURCE_ACCOUNT',
        message: 'sourceAccount must be a valid Stellar public key starting with G and 56 characters long',
      });
    }
  }

  private simulateInvocation(method: string, args: string[]): { success: boolean; value?: unknown; error?: string } {
    const successRate = 0.9;
    const succeeded = Math.random() < successRate;
    if (!succeeded) {
      return { success: false, error: `Contract invocation failed: method ${method} reverted` };
    }
    switch (method) {
      case 'balance':
        return { success: true, value: { amount: (Math.random() * 10000).toFixed(2), token: 'XLM' } };
      case 'transfer':
        return { success: true, value: { from: args[0] ?? 'unknown', to: args[1] ?? 'unknown', amount: args[2] ?? '0', timestamp: new Date().toISOString() } };
      case 'allowance':
        return { success: true, value: { owner: args[0] ?? 'unknown', spender: args[1] ?? 'unknown', amount: '1000' } };
      default:
        return { success: true, value: { method, args, result: 'ok' } };
    }
  }

  private generateTransactionHash(): string {
    return Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  }

  private recordInvocation(contractId: string, result: ContractInvocationResult): void {
    if (!this.invocationHistory.has(contractId)) {
      this.invocationHistory.set(contractId, []);
    }
    this.invocationHistory.get(contractId)!.push(result);
    this.invocationCounts.set(contractId, (this.invocationCounts.get(contractId) ?? 0) + 1);
  }
}