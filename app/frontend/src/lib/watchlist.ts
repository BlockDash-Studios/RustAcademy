export type WatchlistItem = {
  id: string;
  username: string;
  addedAt: Date;
};

export const WATCHLIST_STORAGE_KEY = " RustAcademy-marketplace-watchlist";

export function serializeWatchlist(watchlist: WatchlistItem[]): string {
  return JSON.stringify(watchlist);
}

export function deserializeWatchlist(stored: string): WatchlistItem[] {
  try {
    const parsed: { id: string; username: string; addedAt: string }[] = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    
    return parsed.map((item) => ({
      ...item,
      addedAt: new Date(item.addedAt),
    }));
  } catch (error) {
    console.error("Failed to parse watchlist:", error);
    return [];
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
