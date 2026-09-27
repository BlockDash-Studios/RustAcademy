"use client";

/**
 * MarketplaceApiContext
 *
 * Provides the active MarketplaceApiProvider to the component tree.
 * The provider implementation is selected by the factory below:
 *
 *   NEXT_PUBLIC_API_MOCK=true  → mockMarketplaceProvider   (local dev / CI)
 *   (default / production)    → productionMarketplaceProvider
 *
 * Usage in components:
 *   const api = useMarketplaceApi();
 *   const listings = await api.fetchListings();
 *
 * Usage in tests — wrap the component under test with a custom provider:
 *   <MarketplaceApiContext.Provider value={myTestProvider}>
 *     <ComponentUnderTest />
 *   </MarketplaceApiContext.Provider>
 */

import { createContext, useContext, type ReactNode } from "react";
import type { MarketplaceApiProvider } from "@/hooks/marketplaceApi";
import { mockMarketplaceProvider } from "@/hooks/providers/mockMarketplaceProvider";
import { productionMarketplaceProvider } from "@/hooks/providers/productionMarketplaceProvider";

// ── Factory ──────────────────────────────────────────────────────────────────

/**
 * Returns the correct provider for the current environment.
 * Call once at module load; the result is stable.
 */
function createMarketplaceProvider(): MarketplaceApiProvider {
  const useMock =
    process.env.NEXT_PUBLIC_API_MOCK === "true" ||
    process.env.NODE_ENV === "test";

  return useMock ? mockMarketplaceProvider : productionMarketplaceProvider;
}

const defaultProvider = createMarketplaceProvider();

// ── Context ──────────────────────────────────────────────────────────────────

export const MarketplaceApiContext =
  createContext<MarketplaceApiProvider>(defaultProvider);

// ── Provider component ───────────────────────────────────────────────────────

type MarketplaceApiProviderProps = {
  /** Override the provider — useful in tests and Storybook. */
  provider?: MarketplaceApiProvider;
  children: ReactNode;
};

export function MarketplaceApiProvider({
  provider = defaultProvider,
  children,
}: MarketplaceApiProviderProps) {
  return (
    <MarketplaceApiContext.Provider value={provider}>
      {children}
    </MarketplaceApiContext.Provider>
  );
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useMarketplaceApi(): MarketplaceApiProvider {
  return useContext(MarketplaceApiContext);
}
