"use client";

import { useCallback, useState } from "react";

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
      const msg =
        err instanceof Error && err.message
          ? err.message
          : "Something went wrong. Please try again.";
      setError(msg);
      console.error(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, error, loading, callApi };
}