export interface ReputationRecord {
  userId: string;
  score: number;
  level: number;
  lastUpdated: Date;
}

export interface CertificateNft {
  id: string;
  userId: string;
  courseId: string;
  issuedAt: Date;
  txHash?: string;
}

export interface BadgeNft {
  id: string;
  userId: string;
  badgeType: string;
  issuedAt: Date;
  txHash?: string;
}

export interface EscrowPayout {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed';
export interface ContractInvocation {
  contractId: string;
  method: string;
  args: string[];
  sourceAccount: string;
  fee?: number;
}

export interface ContractInvocationResult {
  invocationId: string;
  contractId: string;
  method: string;
  success: boolean;
  result?: unknown;
  error?: string;
  transactionHash?: string;
  executedAt: Date;
}

export interface ContractDeployment {
  contractId: string;
  wasmHash: string;
  deployedAt: Date;
  deployedBy: string;
  network: 'testnet' | 'futurenet' | 'mainnet';
}

export interface ContractHealth {
  contractId: string;
  status: 'active' | 'degraded' | 'inactive';
  lastInvokedAt?: Date;
  invocationCount: number;
  network: string;
}

export interface ContractInfo {
  contractId: string;
  wasmHash: string;
  network: string;
  deployedBy: string;
  deployedAt: Date;
  methods: string[];
export interface GovernanceProposal {
  id: string;
  title: string;
  description: string;
  proposer: string;
  yesVotes: number;
  noVotes: number;
  status: 'active' | 'passed' | 'rejected';
  createdAt: Date;
}
