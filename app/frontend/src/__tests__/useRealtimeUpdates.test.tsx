import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MockWebSocket, type BidUpdate } from "@/hooks/useRealtimeUpdates";
import { applyBidUpdate } from "@/lib/bidUpdates";
import type { MarketplaceListing } from "@/hooks/marketplaceApi";

const LISTING: MarketplaceListing = {
  id: "a",
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
};

function collectUpdates(socket: MockWebSocket): BidUpdate[] {
  const updates: BidUpdate[] = [];
  socket.onBidUpdate((u) => updates.push(u));
  return updates;
}

describe("MockWebSocket", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("emits monotonically increasing bids seeded from the subscribed baseline", () => {
    // Math.random() = 0.25: emit gate passes (< 0.3), stale-replay branch is
    // skipped (>= 0.2), increment is a constant floor(0.25*100)+50 = 75.
    vi.spyOn(Math, "random").mockReturnValue(0.25);

    const socket = new MockWebSocket();
    const updates = collectUpdates(socket);
    socket.connect();
    socket.subscribe("a", LISTING.currentBid);

    vi.advanceTimersByTime(5 * 5000);
    socket.disconnect();

    expect(updates).toHaveLength(5);
    expect(updates[0].newBid).toBeGreaterThan(LISTING.currentBid);
    for (let i = 1; i < updates.length; i++) {
      expect(updates[i].newBid).toBeGreaterThan(updates[i - 1].newBid);
    }
  });

  it("replays stale bids, which the applyBidUpdate guard discards", () => {
    // Math.random() = 0.1: emit gate passes (< 0.3) and every delivery takes
    // the stale-replay branch (< 0.2), re-sending the baseline bid.
    vi.spyOn(Math, "random").mockReturnValue(0.1);

    const socket = new MockWebSocket();
    const updates = collectUpdates(socket);
    socket.connect();
    socket.subscribe("a", LISTING.currentBid);

    vi.advanceTimersByTime(3 * 5000);
    socket.disconnect();

    expect(updates).toHaveLength(3);
    updates.forEach((u) => expect(u.newBid).toBe(LISTING.currentBid));

    // Feeding the stale replays through the page's guard changes nothing:
    // same array reference, bid count not inflated.
    let listings = [LISTING];
    for (const update of updates) {
      const next = applyBidUpdate(listings, update);
      expect(next).toBe(listings);
      listings = next;
    }
    expect(listings[0].bidCount).toBe(10);
  });

  it("stops emitting after unsubscribe", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.25);

    const socket = new MockWebSocket();
    const updates = collectUpdates(socket);
    socket.connect();
    socket.subscribe("a", LISTING.currentBid);
    vi.advanceTimersByTime(5000);
    expect(updates).toHaveLength(1);

    socket.unsubscribe("a");
    vi.advanceTimersByTime(3 * 5000);
    socket.disconnect();

    expect(updates).toHaveLength(1);
  });
});
