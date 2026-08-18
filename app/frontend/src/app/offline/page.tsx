"use client";

import React, { useEffect, useState } from "react";

function formatRelativeTime(isoString: string): string {
  const diffMs = Date.now() - Date.parse(isoString);
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

type CacheStatus = {
  lastOnlineAt: string | null;
  notificationSyncTs: string | null;
  watchlistSyncTs: string | null;
  apiCacheEntries: number | null;
};

export default function OfflinePage() {
  const [cacheStatus, setCacheStatus] = useState<CacheStatus>({
    lastOnlineAt: null,
    notificationSyncTs: null,
    watchlistSyncTs: null,
    apiCacheEntries: null,
  });

  useEffect(() => {
    setCacheStatus({
      lastOnlineAt: localStorage.getItem("RustAcademy.lastOnlineAt"),
      notificationSyncTs: localStorage.getItem(
        "RustAcademy.notification-center.syncTs",
      ),
      watchlistSyncTs: localStorage.getItem(
        "RustAcademy-marketplace-watchlist-syncTs",
      ),
      apiCacheEntries: (() => {
        const raw = sessionStorage.getItem("RustAcademy.sw.apiCacheEntries");
        return raw !== null ? Number(raw) : null;
      })(),
    });
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <div className="w-24 h-24 mb-8 bg-neutral-900 border border-white/10 rounded-3xl flex items-center justify-center shadow-2xl">
        <svg
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="w-12 h-12 text-neutral-500"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8.25 21v-4.875c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125V21m0 0h4.5V3.545M12.75 21h7.5V10.75M2.25 21h1.5m18 0h-18M2.25 9l4.5-1.636M18.75 3l-1.5.545m0 6.205 3 1m1.5-1.5-1.5.545m-15 10.605V15M9 3.75 3 5.625v13.5L9 17.25m6-13.5 6 1.875v13.5L15 17.25m-6 0v-13.5"
          />
        </svg>
      </div>

      <h1 className="text-4xl font-bold text-white mb-4 bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
        You&apos;re Offline
      </h1>
      <p className="text-neutral-400 max-w-md mx-auto mb-8 text-lg">
        It looks like you&apos;ve lost your connection. Don&apos;t worry,
        RustAcademy is ready to resume once you&apos;re back online.
      </p>

      <button
        onClick={() => window.location.reload()}
        className="px-8 py-3 bg-white text-black font-bold rounded-xl hover:bg-neutral-200 transition-all transform hover:scale-105 active:scale-95 shadow-lg"
      >
        Retry Connection
      </button>

      {/* Cached data status panel */}
      <div className="mt-10 w-full max-w-md rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm p-5 text-left space-y-3">
        <h2 className="text-sm font-semibold text-neutral-300 uppercase tracking-widest mb-3">
          Cached Data Status
        </h2>

        <CacheRow
          label="Last online"
          value={
            cacheStatus.lastOnlineAt
              ? formatRelativeTime(cacheStatus.lastOnlineAt)
              : "Unknown"
          }
        />
        <CacheRow
          label="Notifications synced"
          value={
            cacheStatus.notificationSyncTs
              ? formatRelativeTime(cacheStatus.notificationSyncTs)
              : "Not cached"
          }
          stale={isStale(cacheStatus.notificationSyncTs)}
        />
        <CacheRow
          label="Watchlist synced"
          value={
            cacheStatus.watchlistSyncTs
              ? formatRelativeTime(cacheStatus.watchlistSyncTs)
              : "Not cached"
          }
          stale={isStale(cacheStatus.watchlistSyncTs)}
        />
        {cacheStatus.apiCacheEntries !== null && (
          <CacheRow
            label="API responses cached"
            value={String(cacheStatus.apiCacheEntries)}
          />
        )}
      </div>

      <p className="mt-6 text-xs text-neutral-600 max-w-sm">
        Tip: Cached data is served instantly when you&apos;re offline. It will
        be refreshed automatically once you reconnect.
      </p>
    </div>
  );
}

/** Row in the cache status table. */
function CacheRow({
  label,
  value,
  stale = false,
}: {
  label: string;
  value: string;
  stale?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-neutral-400">{label}</span>
      <span
        className={`font-medium ${stale ? "text-amber-300" : "text-neutral-200"}`}
      >
        {value}
        {stale && (
          <span className="ml-1.5 rounded-full bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
            stale
          </span>
        )}
      </span>
    </div>
  );
}

function isStale(syncTs: string | null): boolean {
  if (!syncTs) return false;
  return Date.now() - Date.parse(syncTs) > 5 * 60 * 1000;
}
