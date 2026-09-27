/**
 * Hook to sync queued errors when connectivity is restored.
 * Integrates with the error reporting system to retry offline errors.
 */

import { useEffect } from "react";
import { useOnlineStatus } from "@/lib/onlineStatus";
import { retryQueuedErrors } from "@/lib/errorQueue";

export function useErrorSyncOnReconnect(
  submitErrorFn: (payload: unknown) => Promise<void>
) {
  const { isOnline } = useOnlineStatus();

  useEffect(() => {
    if (!isOnline) return;

    // Small delay to ensure connectivity is stable
    const timer = setTimeout(() => {
      retryQueuedErrors(submitErrorFn).catch((err) => {
        console.warn("Failed to sync queued errors:", err);
      });
    }, 1000);

    return () => clearTimeout(timer);
  }, [isOnline, submitErrorFn]);
}
