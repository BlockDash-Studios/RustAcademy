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
}

export interface ContractInvocation {
  contractId: string;
  method: string;
  args: string[];
  sourceAccount: string;
  fee?: number;
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

// ────────────────────────────────────────────────────────────────────
// Issue #393: Contract registry types
// ────────────────────────────────────────────────────────────────────

/** Schema definition for a contract registered in the registry */
export interface ContractSchemaDefinition {
  /** Semantic version of the contract schema (e.g. "1.2.0") */
  version: string;
  /** Type of contract (e.g. "token", "governance", "escrow") */
  contractType: string;
  /** Public entry point function names */
  entryPoints: string[];
  /** Method signatures with arg validation */
  methods?: ContractMethodSignature[];
  /** Whether the contract has been tested on mainnet */
  isMainnetCompatible?: boolean;
  /** Arbitrary metadata key-value pairs */
  metadata?: Record<string, string>;
}

/** A single method signature in a contract schema */
export interface ContractMethodSignature {
  name: string;
  args: string[];
  returnType?: string;
  description?: string;
}

/** Validation result for a contract registry entry */
export interface ContractRegistryValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

/** A contract registry entry */
export interface ContractRegistryEntry {
  id: string;
  contractId: string;
  wasmHash: string;
  network: 'testnet' | 'futurenet' | 'mainnet';
  deployedBy: string;
  version?: number;
  schema?: ContractSchemaDefinition;
  registeredAt: Date;
  validatedAt: Date;
  validationStatus: 'valid' | 'warning' | 'invalid';
}

/** Filter options for listing registry entries */
export interface ContractRegistryFilter {
  network?: string;
  validationStatus?: 'valid' | 'warning' | 'invalid';
  deployedBy?: string;
}

// ────────────────────────────────────────────────────────────────────
// Issue #394: Event replay and state reconciliation types
// ────────────────────────────────────────────────────────────────────

/** A single contract event in the event log for replay */
export interface ContractEventLogEntry {
  eventId: string;
  contractId: string;
  eventType: string;
  payload: Record<string, unknown>;
  transactionHash?: string;
  recordedAt: Date;
  sequenceNumber: number;
  replayed: boolean;
  replayedAt?: Date;
  replayId?: string;
}

/** Result of a replay operation */
export interface ReplayResult {
  replayId: string;
  contractId: string;
  eventsProcessed: number;
  eventsSucceeded: number;
  eventsFailed: number;
  status: 'completed' | 'partial' | 'failed';
  startedAt: Date;
  completedAt: Date;
  errors?: Array<{ eventId: string; error: string }>;
}

/** State reconciliation result comparing event log to current state */
export interface StateReconciliationResult {
  contractId: string;
  isConsistent: boolean;
  eventLogCount: number;
  currentStateVersion: number;
  discrepancies: StateDiscrepancy[];
  reconciledAt: Date;
}

/** A single discrepancy found during state reconciliation */
export interface StateDiscrepancy {
  field: string;
  expected: unknown;
  actual: unknown;
  severity: 'critical' | 'warning' | 'info';
}

// ────────────────────────────────────────────────────────────────────
// Issue #396: Contract adapter boundary types
// ────────────────────────────────────────────────────────────────────

/**
 * Contract adapter interface that isolates contract integration
 * from core domain services. All contract operations should go
 * through this adapter rather than reaching directly into
 * contract-specific logic.
 */
export interface IContractAdapter {
  /** Record a reward on-chain for a user */
  recordReward(
    userId: string,
    amount: number,
    reason: string,
  ): Promise<{ transactionHash: string; blockNumber: number }>;

  /** Record a payment transaction on-chain */
  recordPayment(
    fromUserId: string,
    toUserId: string,
    amount: number,
    currency: string,
    memo?: string,
  ): Promise<{ transactionHash: string; timestamp: Date }>;

  /** Mint a certificate NFT for a completed course */
  mintCertificate(
    userId: string,
    courseId: string,
    metadata: Record<string, unknown>,
  ): Promise<{ tokenId: string; transactionHash: string }>;

  /** Mint a badge NFT for an achievement */
  mintBadge(
    userId: string,
    badgeType: string,
    metadata: Record<string, unknown>,
  ): Promise<{ tokenId: string; transactionHash: string }>;

  /** Check the health/connectivity of the contract adapter */
  healthCheck(): Promise<{ isHealthy: boolean; network: string; latency: number }>;
}
