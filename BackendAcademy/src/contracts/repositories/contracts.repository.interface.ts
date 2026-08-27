import {
  ContractDeployment,
  ContractInvocationResult,
  ContractEventLogEntry,
} from '../interfaces/contracts.interface';

/**
 * Repository interface for contracts storage.
 * Isolates persistence concerns from business logic.
 */
export interface IContractsRepository {
  // Contract deployments
  getDeployment(contractId: string): ContractDeployment | undefined;
  setDeployment(contractId: string, deployment: ContractDeployment): void;
  getAllDeployments(): ContractDeployment[];
  hasDeployment(contractId: string): boolean;

  // Invocation history
  getInvocationHistory(contractId: string): ContractInvocationResult[];
  recordInvocation(contractId: string, result: ContractInvocationResult): void;
  getInvocationCount(contractId: string): number;
  setInvocationCount(contractId: string, count: number): void;

  // Domain stores
  getReputation(userId: string): { userId: string; score: number; level: number; lastUpdated: Date } | undefined;
  setReputation(userId: string, data: { userId: string; score: number; level: number; lastUpdated: Date }): void;

  getCertificate(id: string): { id: string; userId: string; courseId: string; issuedAt: Date } | undefined;
  setCertificate(id: string, cert: { id: string; userId: string; courseId: string; issuedAt: Date }): void;
  listCertificates(userId: string): { id: string; userId: string; courseId: string; issuedAt: Date }[];

  getBadge(id: string): { id: string; userId: string; badgeType: string; issuedAt: Date } | undefined;
  setBadge(id: string, badge: { id: string; userId: string; badgeType: string; issuedAt: Date }): void;
  listBadges(userId: string): { id: string; userId: string; badgeType: string; issuedAt: Date }[];

  getPayout(id: string): { id: string; userId: string; amount: number; currency: string; status: 'pending' | 'completed' | 'failed'; createdAt: Date } | undefined;
  setPayout(id: string, payout: { id: string; userId: string; amount: number; currency: string; status: 'pending' | 'completed' | 'failed'; createdAt: Date }): void;

  getProposal(id: string): {
    id: string; title: string; description: string; proposer: string;
    yesVotes: number; noVotes: number;
    status: 'active' | 'passed' | 'rejected'; createdAt: Date;
  } | undefined;
  setProposal(id: string, proposal: {
    id: string; title: string; description: string; proposer: string;
    yesVotes: number; noVotes: number;
    status: 'active' | 'passed' | 'rejected'; createdAt: Date;
  }): void;
  listProposals(): {
    id: string; title: string; description: string; proposer: string;
    yesVotes: number; noVotes: number;
    status: 'active' | 'passed' | 'rejected'; createdAt: Date;
  }[];

  // Event log
  getEventLog(contractId: string, options?: { onlyUnreplayed?: boolean; limit?: number }): ContractEventLogEntry[];
  appendEventLog(entry: ContractEventLogEntry): void;
  getEventLogStats(): { totalEvents: number; unreplayedEvents: number; eventsByContract: Record<string, number> };

  // Clear all data (useful for testing)
  clearAll(): void;
}
