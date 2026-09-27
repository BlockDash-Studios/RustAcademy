"use client";

import {
  createContext,
  useContext,
  useCallback,
  ReactNode,
} from "react";
import {
  WatchlistItem,
  WATCHLIST_STORAGE_KEY,
  serializeWatchlist,
  deserializeWatchlist,
  syncWatchlistToBackend,
} from "@/lib/watchlist";
import { usePersistentState } from "@/hooks/usePersistentState";

export type { WatchlistItem };

type WatchlistContextType = {
  watchlist: WatchlistItem[];
  addToWatchlist: (id: string, username: string) => void;
  removeFromWatchlist: (id: string) => void;
  isInWatchlist: (id: string) => boolean;
  toggleWatchlist: (id: string, username: string) => void;
  isHydrated: boolean;
};

const WatchlistContext = createContext<WatchlistContextType | undefined>(
  undefined,
);

export function WatchlistProvider({
  children,
  userId,
}: {
  children: ReactNode;
  userId?: string;
}) {
  const [watchlist, setWatchlist, isHydrated] = usePersistentState<WatchlistItem[]>(
    WATCHLIST_STORAGE_KEY,
    [],
    {
      userId,
      syncToBackend: syncWatchlistToBackend,
      serialize: serializeWatchlist,
      deserialize: deserializeWatchlist,
    }
  );

  const addToWatchlist = useCallback((id: string, username: string) => {
    setWatchlist((prev) => {
      // Don't add if already exists
      if (prev.some((item) => item.id === id)) return prev;

      return [
        ...prev,
        {
          id,
          username,
          addedAt: new Date(),
        },
      ];
    });
  }, [setWatchlist]);

  const removeFromWatchlist = useCallback((id: string) => {
    setWatchlist((prev) => prev.filter((item) => item.id !== id));
  }, [setWatchlist]);

  const isInWatchlist = useCallback(
    (id: string) => {
      return watchlist.some((item) => item.id === id);
    },
    [watchlist]
  );

  const toggleWatchlist = useCallback(
    (id: string, username: string) => {
      if (isInWatchlist(id)) {
        removeFromWatchlist(id);
      } else {
        addToWatchlist(id, username);
      }
    },
    [isInWatchlist, removeFromWatchlist, addToWatchlist]
  );

  return (
    <WatchlistContext.Provider
      value={{
        watchlist,
        addToWatchlist,
        removeFromWatchlist,
        isInWatchlist,
        toggleWatchlist,
        isHydrated,
      }}
    >
      {children}
    </WatchlistContext.Provider>
  );
}

export function useWatchlist() {
  const context = useContext(WatchlistContext);
  if (context === undefined) {
    throw new Error("useWatchlist must be used within a WatchlistProvider");
  }
  return context;
}
