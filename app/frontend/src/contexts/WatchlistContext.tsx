"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import {
  type CacheState,
  type WatchlistItem,
  getCacheState,
  loadWatchlistFromStorage,
  saveWatchlistToStorage,
} from "@/lib/watchlist";

type WatchlistContextType = {
  watchlist: WatchlistItem[];
  /** Indicates how fresh the locally cached watchlist data is. */
  cacheState: CacheState;
  addToWatchlist: (id: string, username: string) => void;
  removeFromWatchlist: (id: string) => void;
  isInWatchlist: (id: string) => boolean;
  toggleWatchlist: (id: string, username: string) => void;
};

const WatchlistContext = createContext<WatchlistContextType | undefined>(
  undefined,
);

export function WatchlistProvider({ children }: { children: ReactNode }) {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [cacheState, setCacheState] = useState<CacheState>("unavailable");

  // Load watchlist from localStorage on mount
  useEffect(() => {
    const entry = loadWatchlistFromStorage();
    if (entry) {
      setWatchlist(entry.items);
      setCacheState(getCacheState(entry.syncedAt));
    } else {
      setCacheState("unavailable");
    }
  }, []);

  // Save watchlist to localStorage whenever it changes.
  // We do NOT mark the data as freshly synced here — that only happens when
  // a real server response confirms the data, preventing stale server
  // responses from overwriting newer local mutations.
  useEffect(() => {
    saveWatchlistToStorage(watchlist, false);
  }, [watchlist]);

  const addToWatchlist = (id: string, username: string) => {
    setWatchlist((prev) => {
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
  };

  const removeFromWatchlist = (id: string) => {
    setWatchlist((prev) => prev.filter((item) => item.id !== id));
  };

  const isInWatchlist = (id: string) => {
    return watchlist.some((item) => item.id === id);
  };

  const toggleWatchlist = (id: string, username: string) => {
    if (isInWatchlist(id)) {
      removeFromWatchlist(id);
    } else {
      addToWatchlist(id, username);
    }
  };

  return (
    <WatchlistContext.Provider
      value={{
        watchlist,
        cacheState,
        addToWatchlist,
        removeFromWatchlist,
        isInWatchlist,
        toggleWatchlist,
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
