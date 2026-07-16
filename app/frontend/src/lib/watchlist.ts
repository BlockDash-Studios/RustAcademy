export type WatchlistItem = {
  id: string;
  username: string;
  addedAt: Date;
};

export const WATCHLIST_STORAGE_KEY = " RustAcademy-marketplace-watchlist";

export function getWatchlistFromStorage(): WatchlistItem[] {
  try {
    const stored = localStorage.getItem(WATCHLIST_STORAGE_KEY);
    if (!stored) return [];
    
    const parsed: { id: string; username: string; addedAt: string }[] = JSON.parse(stored);
    return parsed.map((item) => ({
      ...item,
      addedAt: new Date(item.addedAt),
    }));
  } catch (error) {
    console.error("Failed to load watchlist from localStorage:", error);
    return [];
  }
}

export function saveWatchlistToStorage(watchlist: WatchlistItem[]): void {
  try {
    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(watchlist));
  } catch (error) {
    console.error("Failed to save watchlist to localStorage:", error);
  }
}

// Optional backend sync - placeholder for future implementation
export async function syncWatchlistToBackend(watchlist: WatchlistItem[], userId?: string): Promise<void> {
  if (!userId) return;
  // TODO: implement actual backend API call
  console.log(`Syncing watchlist for user ${userId} to backend...`, watchlist);
}

export async function fetchWatchlistFromBackend(userId?: string): Promise<WatchlistItem[] | null> {
  if (!userId) return null;
  // TODO: implement actual backend API call
  console.log(`Fetching watchlist for user ${userId} from backend...`);
  return null;
}
