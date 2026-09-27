"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export interface OnlineStatusContextValue {
  isOnline: boolean;
  wasOffline: boolean; // true if user ever went offline in this session
  offlineSince?: Date; // timestamp when user went offline
  isCheckingConnectivity?: boolean; // true while performing connectivity check
}

const OnlineStatusContext = createContext<OnlineStatusContextValue | null>(null);

// Heartbeat check configuration
const CONNECTIVITY_CHECK_INTERVAL_MS = 30 * 1000; // Check connectivity every 30s
const CONNECTIVITY_CHECK_TIMEOUT_MS = 5 * 1000; // 5 second timeout for check

/**
 * Perform a real connectivity check by attempting to fetch a minimal resource.
 * This is more reliable than navigator.onLine which only detects offline mode.
 */
async function checkRealConnectivity(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONNECTIVITY_CHECK_TIMEOUT_MS);

    // Use a small, cacheable resource to check connectivity
    // Cache busting with timestamp to bypass browser cache
    const response = await fetch("/manifest.webmanifest", {
      method: "HEAD",
      signal: controller.signal,
      cache: "no-store",
    });

    clearTimeout(timeoutId);

    // Any response (even error status) means we have network connectivity
    return true;
  } catch (err) {
    // Timeout or network error
    if (err instanceof Error && err.name === "AbortError") {
      // Request timed out, no connectivity
      return false;
    }
    return false;
  }
}

export function OnlineStatusProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isOnline, setIsOnline] = useState(true);
  const [wasOffline, setWasOffline] = useState(false);
  const [offlineSince, setOfflineSince] = useState<Date | undefined>();
  const [isCheckingConnectivity, setIsCheckingConnectivity] = useState(false);

  useEffect(() => {
    // Initialize with actual online status
    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      setOfflineSince(undefined);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setWasOffline(true);
      setOfflineSince(new Date());
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Periodic connectivity check (more reliable than navigator.onLine)
  useEffect(() => {
    let checkInterval: NodeJS.Timeout;

    const performCheck = async () => {
      setIsCheckingConnectivity(true);
      const hasConnectivity = await checkRealConnectivity();
      setIsCheckingConnectivity(false);

      // Only update state if navigator.onLine and real check disagree
      if (navigator.onLine && !hasConnectivity) {
        // navigator.onLine says online but actual connectivity check failed
        setIsOnline(false);
        setWasOffline(true);
        setOfflineSince(new Date());
      } else if (!navigator.onLine && hasConnectivity) {
        // navigator.onLine says offline but actual check succeeded
        setIsOnline(true);
        setOfflineSince(undefined);
      }
    };

    // Start checks after a slight delay to let page load
    const initialDelay = setTimeout(() => {
      performCheck();
      checkInterval = setInterval(performCheck, CONNECTIVITY_CHECK_INTERVAL_MS);
    }, 2000);

    return () => {
      clearTimeout(initialDelay);
      if (checkInterval) {
        clearInterval(checkInterval);
      }
    };
  }, []);

  const value = useMemo(
    () => ({ isOnline, wasOffline, offlineSince, isCheckingConnectivity }),
    [isOnline, wasOffline, offlineSince, isCheckingConnectivity]
  );

  return (
    <OnlineStatusContext.Provider value={value}>
      {children}
    </OnlineStatusContext.Provider>
  );
}

export function useOnlineStatus(): OnlineStatusContextValue {
  const context = useContext(OnlineStatusContext);
  if (!context) {
    throw new Error(
      "useOnlineStatus must be used within OnlineStatusProvider"
    );
  }
  return context;
}

export { OnlineStatusContext };
