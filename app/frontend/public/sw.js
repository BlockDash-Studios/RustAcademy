/**
 * RustAcademy Service Worker
 *
 * Caching strategies:
 *  - Navigation requests  → Network-first, fall back to /offline
 *  - API requests         → Stale-while-revalidate (serve cache, then update)
 *  - Static assets        → Cache-first (long-lived hashed files)
 *
 * A custom header `x-sw-cache-state` is injected into responses so the client
 * can distinguish between fresh network responses and cached ones.
 */

const VERSION = "v2";
const PRECACHE = `rustacademy-precache-${VERSION}`;
const RUNTIME = `rustacademy-runtime-${VERSION}`;
const API_CACHE = `rustacademy-api-${VERSION}`;
const OFFLINE_URL = "/offline";

const PRECACHE_ASSETS = [
  "/",
  "/offline",
  "/icon-192.png",
  "/icon-512.png",
  "/favicon.ico",
  "/manifest.webmanifest",
];

// ---------------------------------------------------------------------------
// Lifecycle: install
// ---------------------------------------------------------------------------
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PRECACHE)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .catch((err) => console.warn("Precache failed", err)),
  );
  self.skipWaiting();
});

// ---------------------------------------------------------------------------
// Lifecycle: activate — prune old caches
// ---------------------------------------------------------------------------
self.addEventListener("activate", (event) => {
  const ACTIVE_CACHES = new Set([PRECACHE, RUNTIME, API_CACHE]);
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => !ACTIVE_CACHES.has(name))
          .map((name) => caches.delete(name)),
      ),
    ),
  );
  self.clients.claim();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Clone a response and add an x-sw-cache-state header so pages know whether
 * they received a fresh or stale response.
 */
function tagResponse(response, cacheState) {
  const headers = new Headers(response.headers);
  headers.set("x-sw-cache-state", cacheState);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// Network-first for page navigations: fresh content when online,
// last-seen copy (or /offline) when the network is down.
async function handleNavigation(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(RUNTIME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || caches.match(OFFLINE_URL);
  }
}

// Cache-first for static assets. Hashed _next/static files are immutable,
// so serving from cache is always safe.
async function handleAsset(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(RUNTIME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Offline and not cached — return a real Response so the rejection
    // doesn't escape the fetch handler.
    return new Response("Offline", {
      status: 408,
      statusText: "Request Timeout",
      headers: { "Content-Type": "text/plain" },
    });
  }
}

// Stale-while-revalidate for backend API calls.
// Serves cached response immediately and refreshes in the background.
async function handleApiRequest(event, request) {
  const cache = await caches.open(API_CACHE);
  const cached = await cache.match(request);

  const networkFetch = fetch(request)
    .then((res) => {
      if (res.ok) {
        cache.put(request, res.clone()).catch(() => {});
      }
      return tagResponse(res, "fresh");
    })
    .catch(() => null);

  if (cached) {
    // Serve stale immediately; revalidation runs in background.
    event.waitUntil(networkFetch);
    return tagResponse(cached, "stale");
  }

  const fresh = await networkFetch;
  return (
    fresh ??
    new Response(JSON.stringify({ error: "Offline" }), {
      status: 503,
      headers: {
        "Content-Type": "application/json",
        "x-sw-cache-state": "unavailable",
      },
    })
  );
}

// ---------------------------------------------------------------------------
// Fetch handler
// ---------------------------------------------------------------------------
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never cache cross-origin requests — payment data must be live.
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  // Backend API calls: stale-while-revalidate so the UI stays responsive
  // offline while still refreshing data in the background.
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(handleApiRequest(event, request));
    return;
  }

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

// ---------------------------------------------------------------------------
// Message handler — clients can request cache stats or trigger skip-waiting
// ---------------------------------------------------------------------------
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }

  if (event.data?.type === "GET_CACHE_STATS") {
    caches.open(API_CACHE).then(async (cache) => {
      const keys = await cache.keys();
      event.source?.postMessage({
        type: "CACHE_STATS",
        payload: { apiCacheEntries: keys.length },
      });
    });
  }
});
