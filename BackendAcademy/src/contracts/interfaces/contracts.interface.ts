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
  createdAt: Date;
  txHash?: string;
}

export interface Vote {
  userId: string;
  vote: 'yes' | 'no';
  votedAt: Date;
}

export interface Proposal {
  id: string;
  title: string;
  description: string;
  proposer: string;
  votes: Vote[];
  createdAt: Date;
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
}