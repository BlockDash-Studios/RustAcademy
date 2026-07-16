"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import {
  WatchlistItem,
  WATCHLIST_STORAGE_KEY,
  getWatchlistFromStorage,
  saveWatchlistToStorage,
  syncWatchlistToBackend,
} from "@/lib/watchlist";

export type { WatchlistItem };

type WatchlistContextType = {
  watchlist: WatchlistItem[];
  addToWatchlist: (id: string, username: string) => void;
  removeFromWatchlist: (id: string) => void;
  isInWatchlist: (id: string) => boolean;
  toggleWatchlist: (id: string, username: string) => void;
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
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [hasHydrated, setHasHydrated] = useState(false);

  // Load watchlist from localStorage on mount and optional backend sync
  useEffect(() => {
    const loadedWatchlist = getWatchlistFromStorage();
    setWatchlist(loadedWatchlist);
    setHasHydrated(true);
    
    // Attempt backend sync on mount if user is present
    if (userId) {
      syncWatchlistToBackend(loadedWatchlist, userId);
    }
  }, [userId]);

  // Sync state across tabs
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === WATCHLIST_STORAGE_KEY && e.newValue) {
        try {
          const parsed: { id: string; username: string; addedAt: string }[] = JSON.parse(e.newValue);
          const watchlistWithDates = parsed.map((item) => ({
            ...item,
            addedAt: new Date(item.addedAt),
          }));
          setWatchlist(watchlistWithDates);
        } catch (error) {
          console.error("Failed to parse watchlist from storage event:", error);
        }
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  // Save watchlist to localStorage whenever it changes
  useEffect(() => {
    if (!hasHydrated) return;
    saveWatchlistToStorage(watchlist);
    
    // Sync to backend when watchlist changes
    if (userId) {
      syncWatchlistToBackend(watchlist, userId);
    }
  }, [watchlist, hasHydrated, userId]);

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
  }, []);

  const removeFromWatchlist = useCallback((id: string) => {
    setWatchlist((prev) => prev.filter((item) => item.id !== id));
  }, []);

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
