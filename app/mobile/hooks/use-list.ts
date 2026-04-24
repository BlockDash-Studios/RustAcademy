import { useState, useCallback, useRef, useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';

export interface ListPage<T> {
  items: T[];
  nextCursor?: string;
}

export interface UseListOptions<T> {
  /** Fetch function: receives cursor (undefined = first page) and returns a page. */
  fetcher: (cursor?: string) => Promise<ListPage<T>>;
  /** If true, the initial fetch is skipped until you call `refresh()` manually. */
  lazy?: boolean;
}

export interface UseListState<T> {
  data: T[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  hasMore: boolean;
}

export interface UseListReturn<T> extends UseListState<T> {
  refresh: () => void;
  loadMore: () => void;
  retry: () => void;
}

/**
 * Generic list hook that standardises pull-to-refresh, cursor-based pagination,
 * offline detection, and error/retry across all list screens.
 *
 * @example
 * const { data, loading, refreshing, error, hasMore, refresh, loadMore, retry } =
 *   useList({ fetcher: (cursor) => fetchTransactions(accountId, { cursor }) });
 */
export function useList<T>({
  fetcher,
  lazy = false,
}: UseListOptions<T>): UseListReturn<T> {
  const [state, setState] = useState<UseListState<T>>({
    data: [],
    loading: !lazy,
    refreshing: false,
    error: null,
    hasMore: false,
  });

  const nextCursorRef = useRef<string | undefined>(undefined);
  const isFetchingRef = useRef(false);

  const load = useCallback(
    async (opts: { reset?: boolean; isRefreshing?: boolean } = {}) => {
      const { reset = false, isRefreshing = false } = opts;

      if (isFetchingRef.current) return;

      const netInfo = await NetInfo.fetch();
      if (!netInfo.isConnected) {
        setState((prev) => ({
          ...prev,
          loading: false,
          refreshing: false,
          error: 'You are offline. Please check your connection and try again.',
        }));
        return;
      }

      isFetchingRef.current = true;

      if (reset) {
        nextCursorRef.current = undefined;
      }

      setState((prev) => ({
        ...prev,
        loading: reset && !isRefreshing,
        refreshing: isRefreshing,
        error: null,
      }));

      try {
        const page = await fetcher(reset ? undefined : nextCursorRef.current);
        nextCursorRef.current = page.nextCursor;

        setState((prev) => ({
          data: reset ? page.items : [...prev.data, ...page.items],
          loading: false,
          refreshing: false,
          error: null,
          hasMore: !!page.nextCursor,
        }));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
        setState((prev) => ({
          ...prev,
          loading: false,
          refreshing: false,
          error: message,
        }));
      } finally {
        isFetchingRef.current = false;
      }
    },
    [fetcher],
  );

  useEffect(() => {
    if (!lazy) {
      void load({ reset: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const refresh = useCallback(() => {
    void load({ reset: true, isRefreshing: true });
  }, [load]);

  const loadMore = useCallback(() => {
    if (state.hasMore && !isFetchingRef.current) {
      void load();
    }
  }, [load, state.hasMore]);

  const retry = useCallback(() => {
    void load({ reset: true });
  }, [load]);

  return { ...state, refresh, loadMore, retry };
}
