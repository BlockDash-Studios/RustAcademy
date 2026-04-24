import { useCallback } from 'react';
import type { TransactionItem } from '../types/transaction';
import { fetchTransactions } from '../services/transactions';
import { useList, type UseListReturn } from './use-list';

export interface UseTransactionsReturn extends Omit<UseListReturn<TransactionItem>, 'data'> {
  /** Alias for `data` — kept for backward compatibility with existing screens. */
  transactions: TransactionItem[];
}

/**
 * Thin wrapper around `useList` for transaction data.
 * Exposes `transactions` as an alias for `data` so existing screens need no changes.
 */
export function useTransactions(accountId: string): UseTransactionsReturn {
  const fetcher = useCallback(
    (cursor?: string) => fetchTransactions(accountId, { cursor }),
    [accountId],
  );

  const { data, ...rest } = useList({ fetcher });

  return { transactions: data, ...rest };
}
