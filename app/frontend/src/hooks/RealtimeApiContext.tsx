"use client";

/**
 * RealtimeApiContext
 *
 * Provides the active RealtimeApiProvider to the component tree and
 * manages the connection lifecycle (connect on mount, disconnect on
 * unmount).
 *
 * Provider selection:
 *   NEXT_PUBLIC_API_MOCK=true  → mockRealtimeProvider   (local dev / CI)
 *   (default / production)    → productionRealtimeProvider
 *
 * Usage in components:
 *   const rt = useRealtimeApi();
 *   rt.subscribeToListing(id);
 *   const unsub = rt.onBidUpdate(cb);
 *
 * Usage in tests — wrap with a fresh MockRealtimeProvider so you
 * control updates imperatively:
 *   const rt = new MockRealtimeProvider({ autoStart: false });
 *   <RealtimeApiContext.Provider value={rt}>
 *     <ComponentUnderTest />
 *   </RealtimeApiContext.Provider>
 *   rt.triggerBidUpdate({ ... });
 */

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import type { RealtimeApiProvider } from "@/hooks/realtimeApi";
import { mockRealtimeProvider } from "@/hooks/providers/mockRealtimeProvider";
import { productionRealtimeProvider } from "@/hooks/providers/productionRealtimeProvider";

// ── Factory ──────────────────────────────────────────────────────────────────

function createRealtimeProvider(): RealtimeApiProvider {
  const useMock =
    process.env.NEXT_PUBLIC_API_MOCK === "true" ||
    process.env.NODE_ENV === "test";

  return useMock ? mockRealtimeProvider : productionRealtimeProvider;
}

const defaultProvider = createRealtimeProvider();

// ── Context ──────────────────────────────────────────────────────────────────

export const RealtimeApiContext =
  createContext<RealtimeApiProvider>(defaultProvider);

// ── Provider component ───────────────────────────────────────────────────────

type RealtimeApiProviderProps = {
  /** Override the provider — useful in tests and Storybook. */
  provider?: RealtimeApiProvider;
  children: ReactNode;
};

/**
 * Mounts/unmounts the realtime connection automatically.
 * Place this high in the tree (e.g. inside the marketplace layout).
 */
export function RealtimeApiProvider({
  provider = defaultProvider,
  children,
}: RealtimeApiProviderProps) {
  // Keep a stable ref so the effect doesn't re-run if the prop identity changes.
  const providerRef = useRef(provider);
  providerRef.current = provider;

  useEffect(() => {
    providerRef.current.connect();
    return () => {
      providerRef.current.disconnect();
    };
  }, []); // intentionally empty — connect once on mount

  return (
    <RealtimeApiContext.Provider value={provider}>
      {children}
    </RealtimeApiContext.Provider>
  );
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useRealtimeApi(): RealtimeApiProvider {
  return useContext(RealtimeApiContext);
}
