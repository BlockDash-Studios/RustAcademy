import { useState, useEffect, useCallback, useRef } from "react";

interface PersistentStateOptions<T> {
  userId?: string;
  syncToBackend?: (data: T, userId: string) => Promise<void>;
  serialize?: (data: T) => string;
  deserialize?: (str: string) => T;
}

export function usePersistentState<T>(
  baseKey: string,
  initialValue: T,
  options?: PersistentStateOptions<T>
) {
  const {
    userId,
    syncToBackend,
    serialize = JSON.stringify,
    deserialize = JSON.parse,
  } = options || {};

  const key = userId ? `${baseKey}_${userId}` : baseKey;
  const [state, setState] = useState<T>(initialValue);
  const [isHydrated, setIsHydrated] = useState(false);

  // Keep the latest serialize/deserialize implementations in refs so that
  // unstable (inline) callback identities don't cause effects to re-run and
  // loop (e.g. when a parent re-renders with a fresh inline deserialize).
  const deserializeRef = useRef(deserialize);
  deserializeRef.current = deserialize;
  const serializeRef = useRef(serialize);
  serializeRef.current = serialize;

  // Load initial state from local storage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        setState(deserializeRef.current(stored));
      }
    } catch (e) {
      console.error(`Error loading state for key ${key}:`, e);
    } finally {
      setIsHydrated(true);
    }
  }, [key]);

  // Sync state across tabs
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === key && e.newValue !== null) {
        try {
          setState(deserializeRef.current(e.newValue));
        } catch (e) {
          console.error(`Error parsing storage event for key ${key}:`, e);
        }
      } else if (e.key === key && e.newValue === null) {
          setState(initialValue);
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [key, initialValue]);

  // Update state locally and notify backend if required
  const setPersistentState = useCallback(
    (value: T | ((val: T) => T)) => {
      setState((prev) => {
        const nextState = value instanceof Function ? value(prev) : value;
        try {
          localStorage.setItem(key, serializeRef.current(nextState));
          if (userId && syncToBackend) {
            syncToBackend(nextState, userId).catch((err) =>
              console.error("Backend sync failed:", err)
            );
          }
        } catch (e) {
          console.error(`Error saving state for key ${key}:`, e);
        }
        return nextState;
      });
    },
    [key, userId, syncToBackend]
  );

  return [state, setPersistentState, isHydrated] as const;
}
