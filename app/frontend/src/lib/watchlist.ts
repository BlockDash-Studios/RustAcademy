/**
 * Watchlist cache state utilities.
 *
 * Three distinct cache states are used throughout the watchlist feature:
 *  - "fresh"       — data was loaded or confirmed within STALE_THRESHOLD_MS
 *  - "stale"       — data exists in storage but is older than STALE_THRESHOLD_MS
 *  - "unavailable" — no cached data could be found at all
 */

export type CacheState = "fresh" | "stale" | "unavailable";

/**
 * How old a cached record can be (in ms) before it's considered stale.
 * Default: 5 minutes.
 */
export const STALE_THRESHOLD_MS = 5 * 60 * 1000;

export const WATCHLIST_STORAGE_KEY = "RustAcademy-marketplace-watchlist";
export const WATCHLIST_SYNC_TS_KEY = "RustAcademy-marketplace-watchlist-syncTs";

export type WatchlistItem = {
  id: string;
  username: string;
  addedAt: Date;
};

export type WatchlistCacheEntry = {
  items: WatchlistItem[];
  /** ISO timestamp of when this data was last confirmed fresh from the server */
  syncedAt: string | null;
};

/**
 * Derive the cache state for a given sync timestamp.
 */
export function getCacheState(syncedAt: string | null): CacheState {
  if (!syncedAt) return "unavailable";
  const ageMs = Date.now() - Date.parse(syncedAt);
  return ageMs <= STALE_THRESHOLD_MS ? "fresh" : "stale";
}

/**
 * Load watchlist items from localStorage.
 * Returns null when storage is empty or unreadable.
 */
export function loadWatchlistFromStorage(): WatchlistCacheEntry | null {
  try {
    const raw = localStorage.getItem(WATCHLIST_STORAGE_KEY);
    if (!raw) return null;

    const parsed: { id: string; username: string; addedAt: string }[] =
      JSON.parse(raw);

    const syncedAt = localStorage.getItem(WATCHLIST_SYNC_TS_KEY) ?? null;

    return {
      items: parsed.map((item) => ({
        ...item,
        addedAt: new Date(item.addedAt),
      })),
      syncedAt,
    };
  } catch {
    return null;
  }
}

/**
 * Persist watchlist items to localStorage and update the sync timestamp.
 */
export function saveWatchlistToStorage(
  items: WatchlistItem[],
  markSynced = false,
): void {
  try {
    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(items));
    if (markSynced) {
      localStorage.setItem(WATCHLIST_SYNC_TS_KEY, new Date().toISOString());
    }
  } catch {
    // Storage quota exceeded or private browsing — fail silently.
  }
}

/**
 * Returns true only when an incoming server payload is newer than
 * the locally stored sync timestamp, preventing stale responses from
 * overwriting user state that was mutated locally after the last fetch.
 */
export function isNewerThanLocal(
  incomingTs: string,
  localSyncedAt: string | null,
): boolean {
  if (!localSyncedAt) return true;
  return Date.parse(incomingTs) > Date.parse(localSyncedAt);
}
