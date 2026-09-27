import { describe, expect, it } from "vitest";
import { applyBidUpdate, applyLocalBid } from "@/lib/bidUpdates";
import type { MarketplaceListing } from "@/hooks/marketplaceApi";

function makeListing(
  overrides: Partial<MarketplaceListing> = {},
): MarketplaceListing {
  return {
    id: "1",
    username: "nova",
    currentBid: 1000,
    buyNowPrice: null,
    ownerAddress: "GBXT...2R7K",
    endsAt: new Date(Date.now() + 3600_000),
    createdAt: new Date(Date.now() - 3600_000),
    status: "auction",
    category: "brand",
    bidCount: 10,
    watchers: 5,
    verified: false,
    ...overrides,
  };
}

describe("applyBidUpdate", () => {
  it("applies an update with a higher bid and increments bidCount once", () => {
    const listings = [makeListing(), makeListing({ id: "2", username: "lux" })];
    const next = applyBidUpdate(listings, { listingId: "1", newBid: 1200 });

    expect(next).not.toBe(listings);
    expect(next[0].currentBid).toBe(1200);
    expect(next[0].bidCount).toBe(11);
    // Other listings untouched
    expect(next[1]).toBe(listings[1]);
    // Input not mutated
    expect(listings[0].currentBid).toBe(1000);
  });

  it("discards a duplicate delivery (same bid) without touching bidCount", () => {
    const listings = [makeListing()];
    const next = applyBidUpdate(listings, { listingId: "1", newBid: 1000 });

    expect(next).toBe(listings);
    expect(next[0].bidCount).toBe(10);
  });

  it("discards a stale out-of-order delivery (lower bid)", () => {
    const listings = [makeListing()];
    const next = applyBidUpdate(listings, { listingId: "1", newBid: 700 });

    expect(next).toBe(listings);
  });

  it("ignores updates for unknown listings", () => {
    const listings = [makeListing()];
    const next = applyBidUpdate(listings, { listingId: "999", newBid: 9999 });

    expect(next).toBe(listings);
  });

  it("prefers the server's authoritative bidCount when provided", () => {
    const listings = [makeListing()];
    const next = applyBidUpdate(listings, {
      listingId: "1",
      newBid: 1500,
      bidCount: 42,
    });

    expect(next[0].bidCount).toBe(42);
  });

  it("counts only genuinely new bids across an out-of-order burst", () => {
    let listings = [makeListing()];
    // Delivery order: new, duplicate, older, new
    listings = applyBidUpdate(listings, { listingId: "1", newBid: 1200 });
    listings = applyBidUpdate(listings, { listingId: "1", newBid: 1200 });
    listings = applyBidUpdate(listings, { listingId: "1", newBid: 1100 });
    listings = applyBidUpdate(listings, { listingId: "1", newBid: 1300 });

    expect(listings[0].currentBid).toBe(1300);
    expect(listings[0].bidCount).toBe(12); // 10 + the 2 real bids
  });
});

describe("applyLocalBid", () => {
  it("applies the user's own bid by username", () => {
    const listings = [makeListing()];
    const next = applyLocalBid(listings, "nova", 1250);

    expect(next[0].currentBid).toBe(1250);
    expect(next[0].bidCount).toBe(11);
  });

  it("does not double-count the websocket echo of the user's own bid", () => {
    let listings = [makeListing()];
    listings = applyLocalBid(listings, "nova", 1250);
    // The feed echoes the same bid back later
    listings = applyBidUpdate(listings, { listingId: "1", newBid: 1250 });

    expect(listings[0].currentBid).toBe(1250);
    expect(listings[0].bidCount).toBe(11);
  });

  it("cannot regress the price when the user's bid raced a higher update", () => {
    let listings = [makeListing()];
    // A realtime update lands first, then the user's slower bid succeeds
    listings = applyBidUpdate(listings, { listingId: "1", newBid: 1400 });
    listings = applyLocalBid(listings, "nova", 1250);

    expect(listings[0].currentBid).toBe(1400);
    expect(listings[0].bidCount).toBe(11);
  });

  it("ignores bids for unknown usernames", () => {
    const listings = [makeListing()];
    expect(applyLocalBid(listings, "ghost", 5000)).toBe(listings);
  });
});
