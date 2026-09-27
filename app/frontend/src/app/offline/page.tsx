"use client";

import { useEffect, useState } from "react";
import { useOnlineStatus } from "@/lib/onlineStatus";

export default function OfflinePage() {
  const { isOnline } = useOnlineStatus();
  const [redirectTimer, setRedirectTimer] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Only set up redirect if not already online
    if (!isOnline) return;

    // User came back online, redirect back to the previous page or home
    const timer = setTimeout(() => {
      // Try to restore the intended navigation from sessionStorage
      const intendedUrl = sessionStorage.getItem("intended-url");
      
      if (intendedUrl && intendedUrl !== window.location.href) {
        window.location.href = intendedUrl;
      } else {
        // Default to home if no intended URL
        window.location.href = "/";
      }
      
      // Clear the intended URL after redirect
      sessionStorage.removeItem("intended-url");
    }, 500);

    setRedirectTimer(timer);

    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [isOnline]);

  const handleRetry = () => {
    // Cancel pending redirect
    if (redirectTimer) {
      clearTimeout(redirectTimer);
      setRedirectTimer(null);
    }
    
    // Attempt to reload page
    window.location.reload();
  };

  const handleGoHome = () => {
    // Cancel pending redirect
    if (redirectTimer) {
      clearTimeout(redirectTimer);
      setRedirectTimer(null);
    }
    
    // Clear intended URL and navigate home
    sessionStorage.removeItem("intended-url");
    window.location.href = "/";
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <div className="w-24 h-24 mb-8 bg-neutral-900 border border-white/10 rounded-3xl flex items-center justify-center shadow-2xl">
        <svg
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="w-12 h-12 text-neutral-500"
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

      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button
          onClick={handleRetry}
          className="px-8 py-3 bg-white text-black font-bold rounded-xl hover:bg-neutral-200 transition-all transform hover:scale-105 active:scale-95 shadow-lg"
        >
          Retry Connection
        </button>

        <button
          onClick={handleGoHome}
          className="px-8 py-3 bg-neutral-800 text-white font-bold rounded-xl hover:bg-neutral-700 transition-all text-center border border-white/10"
        >
          Go Home
        </button>
      </div>

      <div className="mt-12 p-4 rounded-2xl bg-white/5 border border-white/5 backdrop-blur-sm max-w-md">
        <p className="text-sm text-neutral-500">
          <strong>Tip:</strong> You can still use the app for features that were
          already cached, like recently viewed courses or lessons.
        </p>
      </div>

      {isOnline && (
        <div className="mt-8 p-4 rounded-2xl bg-green-500/10 border border-green-500/30 backdrop-blur-sm max-w-md animate-in fade-in">
          <p className="text-sm font-medium text-green-400">
            ✓ You&apos;re back online! Redirecting...
          </p>
        </div>
      )}
    </div>
  );
}
