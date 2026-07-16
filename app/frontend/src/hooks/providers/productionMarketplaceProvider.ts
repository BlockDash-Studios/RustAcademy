/**
 * Production marketplace provider.
 *
 * Calls the real RustAcademy backend REST API. Replace the TODO stubs
 * below with genuine fetch calls once the endpoints are finalised.
 *
 * Environment variable:
 *   NEXT_PUBLIC_RustAcademy_API_URL  — backend base URL (no trailing slash)
 *   Defaults to http://localhost:4000 when unset.
 */

import { getRustAcademyApiBase } from "@/lib/api";
import type {
  BidResult,
  MarketplaceApiProvider,
  MarketplaceListing,
  UserBid,
  UserListing,
} from "@/hooks/marketplaceApi";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${getRustAcademyApiBase()}${path}`;
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    throw new Error(`API error ${res.status} on ${path}`);
  }
  return res.json() as Promise<T>;
}

export const productionMarketplaceProvider: MarketplaceApiProvider = {
  async fetchListings(): Promise<MarketplaceListing[]> {
    // TODO: wire up to GET /marketplace/listings
    return apiFetch<MarketplaceListing[]>("/marketplace/listings");
  },

  async fetchUserBids(): Promise<UserBid[]> {
    // TODO: wire up to GET /marketplace/bids/me (requires auth header)
    return apiFetch<UserBid[]>("/marketplace/bids/me");
  },

  async fetchUserListings(): Promise<UserListing[]> {
    // TODO: wire up to GET /marketplace/listings/me (requires auth header)
    return apiFetch<UserListing[]>("/marketplace/listings/me");
  },

  async placeBid(username: string, amount: number): Promise<BidResult> {
    // TODO: wire up to POST /marketplace/bids with Stellar wallet signature
    try {
      return await apiFetch<BidResult>("/marketplace/bids", {
        method: "POST",
        body: JSON.stringify({ username, amount }),
      });
    } catch (err) {
      const reason =
        err instanceof Error ? err.message : "Unknown error placing bid.";
      return { success: false, reason };
    }
  },

  formatCountdown(date: Date): string {
    const diff = date.getTime() - Date.now();
    if (diff <= 0) return "Ended";
    const h = Math.floor(diff / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  },
};
