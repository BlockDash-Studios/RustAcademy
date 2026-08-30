/**
 * Wallet domain interfaces.
 *
 * Financial integrity (BA-088 / BA-091 / BA-090): wallet balances are never
 * stored as mutable strings. The authoritative source of truth is an
 * immutable ledger ({@link WalletLedgerEntry}) whose entries are only ever
 * appended. Balances are always *derived* by folding the ledger for an
 * account + asset, so re-processing the same sequence of events (e.g. after
 * a restart) always yields the same result.
 */

/**
 * A wallet (registered by address + asset). The balance is intentionally
 * NOT a stored field — see {@link WalletLedgerEntry}.
 */
export interface WalletAccount {
  address: string;
  assetCode: string;
  /** Stellar issuer G-address for non-native assets; `native` for XLM. */
  assetIssuer: string;
  createdAt: Date;
}

/**
 * An immutable, append-only ledger entry. Each entry represents a single
 * balance-affecting event for one account + asset. Entries are never
 * mutated or removed — balances are re-computed by folding these entries.
 */
export interface WalletLedgerEntry {
  /** Unique id for this ledger entry. */
  entryId: string;
  /** Account (G...) the entry applies to. */
  account: string;
  assetCode: string;
  /** Issuer for non-native assets; `native` for XLM. */
  assetIssuer: string;
  /**
   * Signed decimal delta (e.g. "+10.00000" or "-5.00000"). Crediting an
   * account appends a positive entry, debiting appends a negative one.
   */
  delta: string;
  /**
   * The business reason this entry was created.
   * - `seed`: initial credit when a wallet is registered.
   * - `transfer`: a verified transfer between two accounts.
   */
  reason: 'seed' | 'transfer';
  /** Transfer entry link: the originating verified transaction id. */
  transactionId?: string;
  createdAt: Date;
}

/**
 * Record kept for idempotent transaction verification (BA-091). The first
 * time a transaction id is verified its payload hash and result are stored;
 * an exact retry returns the stored result, while a conflicting retry
 * (same id, different payload) is rejected.
 */
export interface TransactionIdempotencyRecord {
  transactionId: string;
  payloadHash: string;
  result: TransactionVerificationResult;
  createdAt: Date;
}

export interface TransactionVerificationRequest {
  transactionId: string;
  sourceAccount: string;
  destinationAccount: string;
  amount: string;
  assetCode: string;
  /** Issuer of the asset when it is not native XLM. */
  assetIssuer?: string;
  memo?: string;
}

export interface TransactionVerificationResult {
  transactionId: string;
  verified: boolean;
  status: 'pending' | 'verified' | 'rejected' | 'failed';
  message: string;
  verifiedAt: Date;
  details?: {
    sourceBalance: string;
    destinationBalance: string;
    fee: string;
    networkPassphrase: string;
  };
}

export interface WalletTransaction {
  transactionId: string;
  sourceAccount: string;
  destinationAccount: string;
  amount: string;
  assetCode: string;
  assetIssuer?: string;
  memo?: string;
  hash?: string;
  status: 'pending' | 'completed' | 'failed';
  createdAt: Date;
  completedAt?: Date;
}

export interface WalletBalance {
  address: string;
  balances: Array<{
    assetCode: string;
    amount: string;
    assetIssuer?: string;
  }>;
  lastUpdated: Date;
}