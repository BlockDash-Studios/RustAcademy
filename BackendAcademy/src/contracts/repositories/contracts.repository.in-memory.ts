import {
  ContractDeployment,
  ContractInvocationResult,
  ContractEventLogEntry,
} from '../interfaces/contracts.interface';
import { IContractsRepository } from './contracts.repository.interface';

/**
 * In-memory implementation of the contracts repository.
 * Stores contracts, invocations, and domain data in process-local Maps and arrays.
 */
export class InMemoryContractsRepository implements IContractsRepository {
  private readonly deployments = new Map<string, ContractDeployment>();
  private readonly invocationHistory = new Map<string, ContractInvocationResult[]>();
  private readonly invocationCounts = new Map<string, number>();

  // Domain stores
  private readonly reputations = new Map<string, { userId: string; score: number; level: number; lastUpdated: Date }>();
  private readonly certificates = new Map<string, { id: string; userId: string; courseId: string; issuedAt: Date }>();
  private readonly badges = new Map<string, { id: string; userId: string; badgeType: string; issuedAt: Date }>();
  private readonly payouts = new Map<string, { id: string; userId: string; amount: number; currency: string; status: 'pending' | 'completed' | 'failed'; createdAt: Date }>();
  private readonly proposals = new Map<string, {
    id: string; title: string; description: string; proposer: string;
    yesVotes: number; noVotes: number;
    status: 'active' | 'passed' | 'rejected'; createdAt: Date;
  }>();

  // Event log
  private readonly eventLog: ContractEventLogEntry[] = [];

  // Contract deployments
  getDeployment(contractId: string): ContractDeployment | undefined {
    return this.deployments.get(contractId);
  }

  setDeployment(contractId: string, deployment: ContractDeployment): void {
    this.deployments.set(contractId, deployment);
  }

  getAllDeployments(): ContractDeployment[] {
    return Array.from(this.deployments.values());
  }

  hasDeployment(contractId: string): boolean {
    return this.deployments.has(contractId);
  }

  // Invocation history
  getInvocationHistory(contractId: string): ContractInvocationResult[] {
    return this.invocationHistory.get(contractId) ?? [];
  }

  recordInvocation(contractId: string, result: ContractInvocationResult): void {
    const history = this.invocationHistory.get(contractId) ?? [];
    history.push(result);
    this.invocationHistory.set(contractId, history);

    const count = (this.invocationCounts.get(contractId) ?? 0) + 1;
    this.invocationCounts.set(contractId, count);
  }

  getInvocationCount(contractId: string): number {
    return this.invocationCounts.get(contractId) ?? 0;
  }

  setInvocationCount(contractId: string, count: number): void {
    this.invocationCounts.set(contractId, count);
  }

  // Domain stores
  getReputation(userId: string): { userId: string; score: number; level: number; lastUpdated: Date } | undefined {
    return this.reputations.get(userId);
  }

  setReputation(userId: string, data: { userId: string; score: number; level: number; lastUpdated: Date }): void {
    this.reputations.set(userId, data);
  }

  getCertificate(id: string): { id: string; userId: string; courseId: string; issuedAt: Date } | undefined {
    return this.certificates.get(id);
  }

  setCertificate(id: string, cert: { id: string; userId: string; courseId: string; issuedAt: Date }): void {
    this.certificates.set(id, cert);
  }

  listCertificates(userId: string): { id: string; userId: string; courseId: string; issuedAt: Date }[] {
    return Array.from(this.certificates.values()).filter((c) => c.userId === userId);
  }

  getBadge(id: string): { id: string; userId: string; badgeType: string; issuedAt: Date } | undefined {
    return this.badges.get(id);
  }

  setBadge(id: string, badge: { id: string; userId: string; badgeType: string; issuedAt: Date }): void {
    this.badges.set(id, badge);
  }

  listBadges(userId: string): { id: string; userId: string; badgeType: string; issuedAt: Date }[] {
    return Array.from(this.badges.values()).filter((b) => b.userId === userId);
  }

  getPayout(id: string): { id: string; userId: string; amount: number; currency: string; status: 'pending' | 'completed' | 'failed'; createdAt: Date } | undefined {
    return this.payouts.get(id);
  }

  setPayout(id: string, payout: { id: string; userId: string; amount: number; currency: string; status: 'pending' | 'completed' | 'failed'; createdAt: Date }): void {
    this.payouts.set(id, payout);
  }

  getProposal(id: string): {
    id: string; title: string; description: string; proposer: string;
    yesVotes: number; noVotes: number;
    status: 'active' | 'passed' | 'rejected'; createdAt: Date;
  } | undefined {
    return this.proposals.get(id);
  }

  setProposal(id: string, proposal: {
    id: string; title: string; description: string; proposer: string;
    yesVotes: number; noVotes: number;
    status: 'active' | 'passed' | 'rejected'; createdAt: Date;
  }): void {
    this.proposals.set(id, proposal);
  }

  listProposals(): {
    id: string; title: string; description: string; proposer: string;
    yesVotes: number; noVotes: number;
    status: 'active' | 'passed' | 'rejected'; createdAt: Date;
  }[] {
    return Array.from(this.proposals.values());
  }

  // Event log
  getEventLog(contractId: string, options?: { onlyUnreplayed?: boolean; limit?: number }): ContractEventLogEntry[] {
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

  appendEventLog(entry: ContractEventLogEntry): void {
    this.eventLog.push(entry);
  }

  getEventLogStats(): { totalEvents: number; unreplayedEvents: number; eventsByContract: Record<string, number> } {
    const eventsByContract: Record<string, number> = {};
    let unreplayed = 0;
    for (const event of this.eventLog) {
      eventsByContract[event.contractId] = (eventsByContract[event.contractId] ?? 0) + 1;
      if (!event.replayed) unreplayed++;
    }
    return { totalEvents: this.eventLog.length, unreplayedEvents: unreplayed, eventsByContract };
  }

  clearAll(): void {
    this.deployments.clear();
    this.invocationHistory.clear();
    this.invocationCounts.clear();
    this.reputations.clear();
    this.certificates.clear();
    this.badges.clear();
    this.payouts.clear();
    this.proposals.clear();
    this.eventLog.length = 0;
  }
}
