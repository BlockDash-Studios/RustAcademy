/**
 * Marketplace API — shared types and provider interface.
 *
 * Concrete implementations live in:
 *   hooks/providers/mockMarketplaceProvider.ts    (local dev / test)
 *   hooks/providers/productionMarketplaceProvider.ts  (production)
 *
 * The active provider is selected by the factory in
 *   hooks/MarketplaceApiContext.tsx
 * and exposed via React context so consumers never import a
 * concrete provider directly.
 */

// ── Domain types ────────────────────────────────────────────────────────────

export type UsernameStatus = "auction" | "buyNow" | "sold" | "listed";

export type MarketplaceListing = {
  id: string;
  username: string;
  currentBid: number;
  buyNowPrice: number | null;
  ownerAddress: string;
  endsAt: Date;
  /** Used for "Newest First" sort. */
  createdAt: Date;
  status: UsernameStatus;
  category: "trending" | "short" | "og" | "crypto" | "brand";
  bidCount: number;
  watchers: number;
  verified: boolean;
};

export type UserBid = {
  username: string;
  myBid: number;
  currentBid: number;
  endsAt: Date;
  isWinning: boolean;
};

export type UserListing = {
  username: string;
  minBid: number;
  currentBid: number;
  bidCount: number;
  endsAt: Date;
};

export type BidResult = { success: true } | { success: false; reason: string };

// ── Provider interface ───────────────────────────────────────────────────────

/**
 * All marketplace data operations that a provider must implement.
 * Both mock and production providers satisfy this contract.
 */
export interface MarketplaceApiProvider {
  /** Fetch all active listings. */
  fetchListings(): Promise<MarketplaceListing[]>;

  /** Fetch the current user's active bids. */
  fetchUserBids(): Promise<UserBid[]>;

  /** Fetch listings created by the current user. */
  fetchUserListings(): Promise<UserListing[]>;

  /** Submit a bid on a listing. */
  placeBid(username: string, amount: number): Promise<BidResult>;

  /**
   * Human-readable countdown to the given date.
   * e.g. "2d 3h", "47m", "Ended"
   *
   * Provided by the provider so that tests can inject a deterministic
   * clock without monkey-patching Date.now globally.
   */
  formatCountdown(date: Date): string;
}
