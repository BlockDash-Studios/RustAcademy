/**
 * Mock marketplace provider.
 *
 * Used in local dev (NEXT_PUBLIC_API_MOCK=true) and in unit/integration
 * tests. All data is self-contained; no network calls are made.
 */

import type {
  BidResult,
  MarketplaceApiProvider,
  MarketplaceListing,
  UserBid,
  UserListing,
} from "@/hooks/marketplaceApi";

// ── Static mock data ─────────────────────────────────────────────────────────

const MOCK_LISTINGS: MarketplaceListing[] = [
  {
    id: "1",
    username: "pay",
    currentBid: 5800,
    buyNowPrice: 12000,
    ownerAddress: "GDRH...4T9F",
    endsAt: new Date(Date.now() + 1000 * 60 * 60 * 2.5),
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2),
    status: "auction",
    category: "og",
    bidCount: 34,
    watchers: 210,
    verified: true,
  },
  {
    id: "2",
    username: "sol",
    currentBid: 3200,
    buyNowPrice: 8500,
    ownerAddress: "GCXY...8K3J",
    endsAt: new Date(Date.now() + 1000 * 60 * 60 * 5),
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 12),
    status: "auction",
    category: "crypto",
    bidCount: 19,
    watchers: 98,
    verified: true,
  },
  {
    id: "3",
    username: "nova",
    currentBid: 1400,
    buyNowPrice: 4000,
    ownerAddress: "GBXT...2R7K",
    endsAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 6),
    status: "auction",
    category: "brand",
    bidCount: 8,
    watchers: 54,
    verified: false,
  },
  {
    id: "4",
    username: "satoshi",
    currentBid: 9900,
    buyNowPrice: null,
    ownerAddress: "GDKL...5W1M",
    endsAt: new Date(Date.now() + 1000 * 60 * 47),
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48),
    status: "auction",
    category: "trending",
    bidCount: 62,
    watchers: 445,
    verified: true,
  },
  {
    id: "5",
    username: "alex",
    currentBid: 780,
    buyNowPrice: 2000,
    ownerAddress: "GCMQ...9P2N",
    endsAt: new Date(Date.now() + 1000 * 60 * 60 * 36),
    createdAt: new Date(Date.now() - 1000 * 60 * 30),
    status: "auction",
    category: "short",
    bidCount: 5,
    watchers: 31,
    verified: false,
  },
  {
    id: "6",
    username: "defi",
    currentBid: 4100,
    buyNowPrice: null,
    ownerAddress: "GBKR...1Q0C",
    endsAt: new Date(Date.now() + 1000 * 60 * 60 * 12),
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
    status: "auction",
    category: "crypto",
    bidCount: 27,
    watchers: 182,
    verified: true,
  },
  {
    id: "7",
    username: "lux",
    currentBid: 620,
    buyNowPrice: 1500,
    ownerAddress: "GDXP...3F4G",
    endsAt: new Date(Date.now() + 1000 * 60 * 60 * 48),
    createdAt: new Date(Date.now() - 1000 * 60 * 15),
    status: "listed",
    category: "brand",
    bidCount: 3,
    watchers: 22,
    verified: false,
  },
  {
    id: "8",
    username: "web3",
    currentBid: 2700,
    buyNowPrice: 6000,
    ownerAddress: "GBNH...7T5Q",
    endsAt: new Date(Date.now() + 1000 * 60 * 60 * 8),
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3),
    status: "auction",
    category: "trending",
    bidCount: 15,
    watchers: 113,
    verified: true,
  },
];

const MOCK_USER_BIDS: UserBid[] = [
  {
    username: "nova",
    myBid: 1200,
    currentBid: 1400,
    endsAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
    isWinning: false,
  },
  {
    username: "lux",
    myBid: 620,
    currentBid: 620,
    endsAt: new Date(Date.now() + 1000 * 60 * 60 * 48),
    isWinning: true,
  },
];

const MOCK_USER_LISTINGS: UserListing[] = [
  {
    username: "stellardev",
    minBid: 300,
    currentBid: 480,
    bidCount: 3,
    endsAt: new Date(Date.now() + 1000 * 60 * 60 * 72),
  },
];

// ── In-memory cache (mimics real caching behaviour) ──────────────────────────

let cachedListings: MarketplaceListing[] | null = null;
let cachedUserBids: UserBid[] | null = null;
let cachedUserListings: UserListing[] | null = null;

// ── Provider implementation ──────────────────────────────────────────────────

export const mockMarketplaceProvider: MarketplaceApiProvider = {
  async fetchListings(): Promise<MarketplaceListing[]> {
    if (cachedListings) return cachedListings;
    return new Promise((resolve) =>
      setTimeout(() => {
        cachedListings = MOCK_LISTINGS;
        resolve(MOCK_LISTINGS);
      }, 900),
    );
  },

  async fetchUserBids(): Promise<UserBid[]> {
    if (cachedUserBids) return cachedUserBids;
    return new Promise((resolve) =>
      setTimeout(() => {
        cachedUserBids = MOCK_USER_BIDS;
        resolve(MOCK_USER_BIDS);
      }, 700),
    );
  },

  async fetchUserListings(): Promise<UserListing[]> {
    if (cachedUserListings) return cachedUserListings;
    return new Promise((resolve) =>
      setTimeout(() => {
        cachedUserListings = MOCK_USER_LISTINGS;
        resolve(MOCK_USER_LISTINGS);
      }, 700),
    );
  },

  async placeBid(username: string, amount: number): Promise<BidResult> {
    return new Promise((resolve) => {
      setTimeout(() => {
        // Simulate ~10 % wallet-rejection rate.
        if (Math.random() < 0.1) {
          resolve({
            success: false,
            reason: "User rejected the transaction in wallet.",
          });
        } else {
          console.log(`[mock] Bid placed: ${amount} USDC on @${username}`);
          resolve({ success: true });
        }
      }, 2200);
    });
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

/**
 * Reset the in-memory cache between tests so each test starts fresh.
 * Call this in a `beforeEach` or `afterEach` inside your test suite.
 */
export function resetMockMarketplaceCache(): void {
  cachedListings = null;
  cachedUserBids = null;
  cachedUserListings = null;
}
