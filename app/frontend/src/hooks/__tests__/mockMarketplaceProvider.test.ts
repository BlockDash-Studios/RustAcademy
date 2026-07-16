/**
 * Unit tests for mockMarketplaceProvider
 *
 * These tests are fully self-contained: no network, no React, no timers
 * that run past the test boundary.  We use vi.useFakeTimers() so
 * setTimeout-based delays resolve synchronously.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  mockMarketplaceProvider,
  resetMockMarketplaceCache,
} from "@/hooks/providers/mockMarketplaceProvider";

// ── helpers ──────────────────────────────────────────────────────────────────

/** Advance all pending timers and flush the microtask queue. */
async function flushTimers() {
  vi.runAllTimers();
  await Promise.resolve();
}

// ── setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
  resetMockMarketplaceCache();
});

afterEach(() => {
  vi.useRealTimers();
  resetMockMarketplaceCache();
});

// ── fetchListings ─────────────────────────────────────────────────────────────

describe("fetchListings", () => {
  it("returns an array of listings after the simulated delay", async () => {
    const promise = mockMarketplaceProvider.fetchListings();
    await flushTimers();
    const listings = await promise;

    expect(listings.length).toBeGreaterThan(0);
    expect(listings[0]).toMatchObject({
      id: expect.any(String),
      username: expect.any(String),
      currentBid: expect.any(Number),
      status: expect.any(String),
    });
  });

  it("returns the same reference on a second call (cache hit)", async () => {
    const p1 = mockMarketplaceProvider.fetchListings();
    await flushTimers();
    const first = await p1;

    // Second call — cache is populated, no timer needed
    const second = await mockMarketplaceProvider.fetchListings();

    expect(second).toBe(first);
  });

  it("re-fetches after cache is reset (goes through the timer path again)", async () => {
    // Prime the cache
    const p1 = mockMarketplaceProvider.fetchListings();
    await flushTimers();
    await p1;

    // Bust the cache
    resetMockMarketplaceCache();

    // Second fetch must go through the setTimeout path again (not resolve instantly)
    let resolved = false;
    const p2 = mockMarketplaceProvider.fetchListings().then((v) => {
      resolved = true;
      return v;
    });

    // Before timers advance the promise should not yet be resolved
    await Promise.resolve();
    expect(resolved).toBe(false);

    // Advance timers and verify we get a valid listing array
    await flushTimers();
    const second = await p2;
    expect(second.length).toBeGreaterThan(0);
    expect(resolved).toBe(true);
  });
});

// ── fetchUserBids ─────────────────────────────────────────────────────────────

describe("fetchUserBids", () => {
  it("returns an array of user bids", async () => {
    const promise = mockMarketplaceProvider.fetchUserBids();
    await flushTimers();
    const bids = await promise;

    expect(Array.isArray(bids)).toBe(true);
    if (bids.length > 0) {
      expect(bids[0]).toMatchObject({
        username: expect.any(String),
        myBid: expect.any(Number),
        currentBid: expect.any(Number),
        isWinning: expect.any(Boolean),
      });
    }
  });
});

// ── fetchUserListings ─────────────────────────────────────────────────────────

describe("fetchUserListings", () => {
  it("returns an array of user listings", async () => {
    const promise = mockMarketplaceProvider.fetchUserListings();
    await flushTimers();
    const listings = await promise;

    expect(Array.isArray(listings)).toBe(true);
  });
});

// ── placeBid ──────────────────────────────────────────────────────────────────

describe("placeBid", () => {
  it("returns { success: true } when the random roll succeeds", async () => {
    // Force Math.random to always return 0.5 — above the 0.1 rejection threshold
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    const promise = mockMarketplaceProvider.placeBid("nova", 1500);
    await flushTimers();
    const result = await promise;

    expect(result).toEqual({ success: true });
  });

  it("returns { success: false } when the random roll triggers rejection", async () => {
    // Force Math.random to return 0.05 — below the 0.1 rejection threshold
    vi.spyOn(Math, "random").mockReturnValue(0.05);

    const promise = mockMarketplaceProvider.placeBid("nova", 1500);
    await flushTimers();
    const result = await promise;

    expect(result).toMatchObject({
      success: false,
      reason: expect.stringContaining("rejected"),
    });
  });
});

// ── formatCountdown ───────────────────────────────────────────────────────────

describe("formatCountdown", () => {
  it('returns "Ended" for a past date', () => {
    const past = new Date(Date.now() - 1000);
    expect(mockMarketplaceProvider.formatCountdown(past)).toBe("Ended");
  });

  it("returns minutes only for < 1 hour remaining", () => {
    const soon = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
    expect(mockMarketplaceProvider.formatCountdown(soon)).toBe("30m");
  });

  it("returns hours and minutes for 1–23 hours remaining", () => {
    const twoHours = new Date(Date.now() + 2 * 60 * 60 * 1000 + 15 * 60 * 1000);
    expect(mockMarketplaceProvider.formatCountdown(twoHours)).toBe("2h 15m");
  });

  it("returns days and hours for >= 24 hours remaining", () => {
    const twoDays = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000);
    expect(mockMarketplaceProvider.formatCountdown(twoDays)).toBe("2d 3h");
  });
});
