"use client";

import { useCallback, useState } from "react";
import { errorReporter } from "@/lib/errorReporter";

export function useApi<T>() {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const callApi = useCallback(async (fn: () => Promise<T>) => {
    setLoading(true);
    setError(null);

    try {
      const res = await fn();
      setData(res);
      setError(null);
      return res;
    } catch (err: unknown) {
      const capturedError = err instanceof Error ? err : new Error(String(err));
      const msg = capturedError.message || "Something went wrong. Please try again.";
      setError(msg);
      errorReporter.captureError(capturedError, {
        route: typeof window !== "undefined" ? window.location.pathname : undefined,
        extra: { source: "useApi" },
      });
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, error, loading, callApi };
}