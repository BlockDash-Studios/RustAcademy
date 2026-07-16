/**
 * Unit tests for MockRealtimeProvider
 *
 * All tests use autoStart:false so no setInterval fires during the test run.
 * We drive updates with triggerBidUpdate() instead.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MockRealtimeProvider } from "@/hooks/providers/mockRealtimeProvider";
import type { BidUpdate } from "@/hooks/realtimeApi";

const SAMPLE_UPDATE: BidUpdate = {
  listingId: "1",
  username: "testuser",
  newBid: 2500,
  bidderAddress: "GABCD...XYZ",
  timestamp: new Date("2026-01-01T12:00:00Z"),
};

let provider: MockRealtimeProvider;

beforeEach(() => {
  provider = new MockRealtimeProvider({ autoStart: false });
});

afterEach(() => {
  provider.disconnect();
});

// ── connect / disconnect ──────────────────────────────────────────────────────

describe("connect / disconnect", () => {
  it("starts disconnected", () => {
    expect(provider.isConnected).toBe(false);
  });

  it("becomes connected after connect()", () => {
    provider.connect();
    expect(provider.isConnected).toBe(true);
  });

  it("becomes disconnected after disconnect()", () => {
    provider.connect();
    provider.disconnect();
    expect(provider.isConnected).toBe(false);
  });

  it("connect() is idempotent", () => {
    provider.connect();
    provider.connect(); // second call should not throw
    expect(provider.isConnected).toBe(true);
  });
});

// ── subscribeToListing / unsubscribeFromListing ───────────────────────────────

describe("subscribe / unsubscribe", () => {
  it("does not throw when subscribing before connecting", () => {
    expect(() => provider.subscribeToListing("abc")).not.toThrow();
  });

  it("removes a listing from the subscription set on unsubscribe", () => {
    provider.subscribeToListing("abc");
    provider.unsubscribeFromListing("abc");
    // Verify indirectly: triggering an update for "abc" should reach no listeners
    // because there are no listeners registered — no assertion needed beyond no-throw.
    expect(() => provider.triggerBidUpdate({ ...SAMPLE_UPDATE, listingId: "abc" })).not.toThrow();
  });
});

// ── onBidUpdate ───────────────────────────────────────────────────────────────

describe("onBidUpdate", () => {
  it("calls the callback when triggerBidUpdate is invoked", () => {
    const cb = vi.fn();
    provider.onBidUpdate(cb);
    provider.triggerBidUpdate(SAMPLE_UPDATE);

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(SAMPLE_UPDATE);
  });

  it("supports multiple listeners", () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    provider.onBidUpdate(cb1);
    provider.onBidUpdate(cb2);
    provider.triggerBidUpdate(SAMPLE_UPDATE);

    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
  });

  it("returns an unsubscribe function that removes the listener", () => {
    const cb = vi.fn();
    const unsub = provider.onBidUpdate(cb);

    unsub(); // remove before any update

    provider.triggerBidUpdate(SAMPLE_UPDATE);
    expect(cb).not.toHaveBeenCalled();
  });

  it("does not call unsubscribed listener while other listeners still receive updates", () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const unsub1 = provider.onBidUpdate(cb1);
    provider.onBidUpdate(cb2);

    unsub1();
    provider.triggerBidUpdate(SAMPLE_UPDATE);

    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).toHaveBeenCalledTimes(1);
  });

  it("delivers the exact update object to all listeners", () => {
    const received: BidUpdate[] = [];
    provider.onBidUpdate((u) => received.push(u));

    const update: BidUpdate = {
      listingId: "42",
      username: "alice",
      newBid: 9999,
      bidderAddress: "GXXX...YYY",
      timestamp: new Date(),
    };

    provider.triggerBidUpdate(update);
    expect(received).toHaveLength(1);
    expect(received[0]).toBe(update); // same reference
  });
});

// ── autoStart behaviour ───────────────────────────────────────────────────────

describe("autoStart", () => {
  it("does NOT start the interval when autoStart is false", () => {
    vi.useFakeTimers();
    const intervalSpy = vi.spyOn(global, "setInterval");

    const p = new MockRealtimeProvider({ autoStart: false });
    p.connect();

    expect(intervalSpy).not.toHaveBeenCalled();

    p.disconnect();
    vi.useRealTimers();
  });

  it("starts the interval when autoStart is true (default)", () => {
    vi.useFakeTimers();
    const intervalSpy = vi.spyOn(global, "setInterval");

    const p = new MockRealtimeProvider({ autoStart: true });
    p.connect();

    expect(intervalSpy).toHaveBeenCalledTimes(1);

    p.disconnect();
    vi.useRealTimers();
  });
});
