"use client";

import { useEffect, useState } from "react";
import { useOnlineStatus } from "@/lib/onlineStatus";

/**
 * Displays real-time online/offline status to users.
 * Shows in bottom-left corner with appropriate styling.
 * Hidden on desktop, visible on mobile by default.
 */
export function OnlineStatusBadge() {
  const { isOnline, offlineSince } = useOnlineStatus();
  const [showBadge, setShowBadge] = useState(false);

  useEffect(() => {
    // Show badge when offline
    setShowBadge(!isOnline);
  }, [isOnline]);

  if (showBadge) {
    const offlineDuration = offlineSince
      ? Math.round((Date.now() - offlineSince.getTime()) / 1000)
      : 0;
    const minutes = Math.floor(offlineDuration / 60);
    const seconds = offlineDuration % 60;

    const durationText =
      minutes > 0
        ? `${minutes}m ${seconds}s`
        : `${seconds}s`;

    return (
      <div className="fixed bottom-20 left-6 md:hidden z-40 animate-in fade-in slide-in-from-left-5 duration-300">
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/30 backdrop-blur-sm">
          <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
            Offline • {durationText}
          </span>
        </div>
      </div>
    );
  }

  return null;
}
