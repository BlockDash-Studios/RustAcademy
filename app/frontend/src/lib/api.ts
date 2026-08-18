import { Profile } from "@/types/profile";

/**
 * Backend origin for browser calls. Override in `.env.local`:
 * `NEXT_PUBLIC_RustAcademy_API_URL=https://api.example.com`
 */
export const getRustAcademyApiBase = (): string =>
  process.env.NEXT_PUBLIC_RustAcademy_API_URL?.replace(/\/$/, "") ||
  "http://localhost:4000";

/**
 * Simulate API call to fetch a user profile, with localStorage fallback.
 */
export async function getProfile(username: string): Promise<Profile> {
  await new Promise((resolve) => setTimeout(resolve, 500));

  if (typeof window !== "undefined") {
    const stored = localStorage.getItem(`profile_${username}`);
    if (stored) {
      try {
        return JSON.parse(stored) as Profile;
      } catch (e) {
        console.error("Failed to parse stored profile:", e);
      }
    }
  }

  return {
    username,
    primaryColor: "#6366f1",
    avatarUrl: "",
    bio: "",
    twitterHandle: "",
    discordHandle: "",
    githubHandle: "",
  };
}

/**
 * Simulate API call to save a user profile, persisting to localStorage.
 */
export async function saveProfile(profile: Profile): Promise<Profile> {
  await new Promise((resolve) => setTimeout(resolve, 800));

  if (typeof window !== "undefined") {
    localStorage.setItem(`profile_${profile.username}`, JSON.stringify(profile));
  }
  return profile;
}

// ---------------------------------------------------------------------------
// Cache metadata helpers (issue #534 — stale data resilience)
// ---------------------------------------------------------------------------

const CACHE_META_PREFIX = "RustAcademy.cache-meta.";

export type CachedResponse<T> = {
  data: T;
  /** ISO timestamp of when this response was cached. */
  cachedAt: string;
};

/**
 * Returns the age in milliseconds of a cached entry, or null if no entry
 * exists for the given key.
 */
export function getCacheAge(cacheKey: string): number | null {
  try {
    const raw = localStorage.getItem(`${CACHE_META_PREFIX}${cacheKey}`);
    if (!raw) return null;
    const { cachedAt } = JSON.parse(raw) as { cachedAt: string };
    return Date.now() - Date.parse(cachedAt);
  } catch {
    return null;
  }
}

/**
 * Fetches `url` and caches the JSON response in localStorage under `cacheKey`.
 *
 * Stale-while-revalidate behaviour:
 *  1. If a cached value exists it is returned immediately.
 *  2. A background network request is always issued.
 *  3. The cache is only updated when the fresh response is newer than what
 *     is already stored, preventing a delayed response from overwriting newer
 *     local state.
 *
 * Returns the cached value when offline or on network error.
 */
export async function fetchWithCache<T>(
  url: string,
  cacheKey: string,
  options?: RequestInit,
): Promise<CachedResponse<T> | null> {
  const storageKey = `${CACHE_META_PREFIX}${cacheKey}`;

  let cached: CachedResponse<T> | null = null;
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) cached = JSON.parse(raw) as CachedResponse<T>;
  } catch {
    cached = null;
  }

  // Fire background revalidation
  (async () => {
    try {
      const res = await fetch(url, options);
      if (!res.ok) return;
      const freshData = (await res.json()) as T;
      const freshEntry: CachedResponse<T> = {
        data: freshData,
        cachedAt: new Date().toISOString(),
      };
      // Only overwrite if the incoming response is newer than what we have
      if (
        !cached ||
        Date.parse(freshEntry.cachedAt) > Date.parse(cached.cachedAt)
      ) {
        localStorage.setItem(storageKey, JSON.stringify(freshEntry));
      }
    } catch {
      // Network unavailable — keep serving cached value.
    }
  })();

  return cached;
}
