const VERSION = "v3";
const PRECACHE = `rustacademy-precache-${VERSION}`;
const RUNTIME = `rustacademy-runtime-${VERSION}`;
const OFFLINE_URL = "/offline";

// Assets that must be available for the app to function
const PRECACHE_ASSETS = [
  "/",
  "/offline",
  "/icon-192.png",
  "/icon-512.png",
  "/favicon.ico",
  "/manifest.webmanifest",
];

// Cache strategy configuration
const CACHE_CONFIG = {
  // How long to consider a cached response fresh (in milliseconds)
  STALE_WHILE_REVALIDATE_MS: 24 * 60 * 60 * 1000, // 24 hours
  // Assets that can be safely served stale
  STALE_ASSET_PATTERNS: [
    "/_next/static/",
    "/_next/image",
  ],
  // Cache size management
  MAX_CACHE_SIZE_MB: 50, // Maximum cache size in MB
  MAX_CACHE_ITEMS: 500, // Maximum number of items in cache
};

/**
 * Calculate size of a response in bytes
 */
async function getResponseSize(response) {
  try {
    const blob = await response.clone().blob();
    return blob.size;
  } catch {
    return 0;
  }
}

/**
 * Get total size of all caches
 */
async function getTotalCacheSize() {
  const cacheNames = await caches.keys();
  let totalSize = 0;
  
  for (const cacheName of cacheNames) {
    const cache = await caches.open(cacheName);
    const requests = await cache.keys();
    
    for (const request of requests) {
      const response = await cache.match(request);
      if (response) {
        totalSize += await getResponseSize(response);
      }
    }
  }
  
  return totalSize;
}

/**
 * Evict oldest entries from cache when size limit exceeded (LRU strategy)
 */
async function evictOldCacheEntries() {
  const cache = await caches.open(RUNTIME);
  const requests = await cache.keys();
  
  if (requests.length > CACHE_CONFIG.MAX_CACHE_ITEMS) {
    // Remove oldest entries (FIFO within this batch)
    const toRemove = requests.length - CACHE_CONFIG.MAX_CACHE_ITEMS + 10;
    for (let i = 0; i < toRemove; i++) {
      await cache.delete(requests[i]);
    }
  }
  
  // Check total size
  const totalSize = await getTotalCacheSize();
  const maxSizeBytes = CACHE_CONFIG.MAX_CACHE_SIZE_MB * 1024 * 1024;
  
  if (totalSize > maxSizeBytes) {
    // Remove entries until under limit
    for (let i = 0; i < Math.min(50, requests.length); i++) {
      await cache.delete(requests[i]);
      const newSize = await getTotalCacheSize();
      if (newSize <= maxSizeBytes) break;
    }
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PRECACHE)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .catch((err) => console.warn("Precache failed", err)),
  );
  // Skip waiting allows new SW to activate immediately
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== PRECACHE && name !== RUNTIME)
          .map((name) => {
            console.log("Cleaning up old cache:", name);
            return caches.delete(name);
          }),
      );
    }),
  );
  self.clients.claim();
});

/**
 * Checks if a cached response is still fresh
 */
function isCacheFresh(response) {
  if (!response) return false;
  
  const dateHeader = response.headers.get("date");
  if (!dateHeader) {
    // No date header, assume cache is fresh for critical assets
    return true;
  }
  
  const cacheTime = new Date(dateHeader).getTime();
  const now = Date.now();
  return now - cacheTime < CACHE_CONFIG.STALE_WHILE_REVALIDATE_MS;
}

/**
 * Stale-while-revalidate pattern: serve cached if available (fresh or stale),
 * but also fetch fresh copy in background. For navigations, always try network first
 * to provide latest content.
 */
async function handleNavigation(request) {
  try {
    // Try network first for navigations
    const response = await fetch(request);
    if (response.ok) {
      // Cache the fresh response for offline fallback
      const cache = await caches.open(RUNTIME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // Network failed, use cache
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    // No cache, show offline page
    return caches.match(OFFLINE_URL);
  }
}

/**
 * Cache-first for static assets with background revalidation.
 * Hashed Next.js assets are immutable, so cache hits are always safe.
 */
async function handleAsset(request) {
  const cached = await caches.match(request);
  
  if (cached && isCacheFresh(cached)) {
    // Cache is fresh, use it immediately
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(RUNTIME);
      cache.put(request, response.clone());
      // Evict old entries if cache is getting too large
      await evictOldCacheEntries();
    }
    return response;
  } catch (err) {
    // Network failed
    if (cached) {
      // Return stale cache as fallback
      return cached;
    }
    // No cache available, return offline response
    return new Response("Offline", {
      status: 408,
      statusText: "Request Timeout",
      headers: { "Content-Type": "text/plain" },
    });
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  
  // Only cache GET requests
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never cache:
  // - Cross-origin requests (security)
  // - API calls (must be live, especially payment data)
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // Navigation requests (HTML page loads)
  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  // Static assets (cache-first)
  const isStaticAsset =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/_next/image") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/favicon.ico" ||
    request.destination === "manifest" ||
    request.destination === "style" ||
    request.destination === "script" ||
    request.destination === "image" ||
    request.destination === "font";

  if (isStaticAsset) {
    event.respondWith(handleAsset(request));
  }
});
