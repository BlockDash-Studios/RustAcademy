/**
 * Subset of the Stellar transaction shape that this MVP exposes.
 * Mirrors the most relevant fields from Horizon's `Transaction` and
 * `Payment` response records; missing fields can be added without a
 * breaking change since callers should treat this as additive.
 */
export type StellarTxType =
  | 'payment'
  | 'path_payment'
  | 'create_account'
  | 'account_merge'
  | 'other';

export interface StellarTransaction {
  /** Horizon transaction id (opaque hex). */
  id: string;
  /** Account (G...) that initiated or received the transaction. */
  account: string;
  /** Transaction hash in hex. */
  hash: string;
  /** ISO-8601 timestamp as returned by Horizon's `created_at`. */
  createdAt: string;
  type: StellarTxType;
  /** Stringified decimal amount to preserve Stellar 7-decimal precision. */
  amount: string;
  assetCode: string;
  /** Asset issuer address or `null` for native XLM. */
  assetIssuer: string | null;
  memo?: string;
  successful: boolean;
}

export interface TransactionHistoryResponse {
  entries: StellarTransaction[];
  /** Total matching entries for the requested account. */
  total: number;
  /** Cursor for the next page; absent when no more pages remain. */
  nextCursor?: string;
}
