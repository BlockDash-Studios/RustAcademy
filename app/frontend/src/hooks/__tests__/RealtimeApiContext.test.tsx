/**
 * Tests for RealtimeApiContext — provider wiring and useRealtimeApi hook
 *
 * We use MockRealtimeProvider with autoStart:false throughout so no interval
 * timers leak between tests.
 */

import { describe, expect, it, vi, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  RealtimeApiContext,
  RealtimeApiProvider,
  useRealtimeApi,
} from "@/hooks/RealtimeApiContext";
import { MockRealtimeProvider } from "@/hooks/providers/mockRealtimeProvider";
import type { BidUpdate } from "@/hooks/realtimeApi";

const SAMPLE_UPDATE: BidUpdate = {
  listingId: "1",
  username: "alice",
  newBid: 3000,
  bidderAddress: "GABC...XYZ",
  timestamp: new Date("2026-01-01T00:00:00Z"),
};

// Clean up any loose providers after each test
afterEach(() => {
  vi.restoreAllMocks();
});

// ── useRealtimeApi hook ───────────────────────────────────────────────────────

describe("useRealtimeApi", () => {
  it("returns the provider injected via RealtimeApiProvider", () => {
    const provider = new MockRealtimeProvider({ autoStart: false });

    const { result } = renderHook(() => useRealtimeApi(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <RealtimeApiProvider provider={provider}>{children}</RealtimeApiProvider>
      ),
    });

    expect(result.current).toBe(provider);
  });

  it("returns the provider injected directly via context value", () => {
    const provider = new MockRealtimeProvider({ autoStart: false });

    const { result } = renderHook(() => useRealtimeApi(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <RealtimeApiContext.Provider value={provider}>
          {children}
        </RealtimeApiContext.Provider>
      ),
    });

    expect(result.current).toBe(provider);
  });
});

// ── RealtimeApiProvider lifecycle ────────────────────────────────────────────

describe("RealtimeApiProvider lifecycle", () => {
  it("calls connect() on mount", () => {
    const provider = new MockRealtimeProvider({ autoStart: false });
    const connectSpy = vi.spyOn(provider, "connect");

    const { unmount } = renderHook(() => useRealtimeApi(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <RealtimeApiProvider provider={provider}>{children}</RealtimeApiProvider>
      ),
    });

    expect(connectSpy).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("calls disconnect() on unmount", () => {
    const provider = new MockRealtimeProvider({ autoStart: false });
    const disconnectSpy = vi.spyOn(provider, "disconnect");

    const { unmount } = renderHook(() => useRealtimeApi(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <RealtimeApiProvider provider={provider}>{children}</RealtimeApiProvider>
      ),
    });

    unmount();
    expect(disconnectSpy).toHaveBeenCalledTimes(1);
  });
});

// ── integration: onBidUpdate via context ─────────────────────────────────────

describe("onBidUpdate integration", () => {
  it("forwards a triggered update to a listener registered via the hook", () => {
    const provider = new MockRealtimeProvider({ autoStart: false });
    const received: BidUpdate[] = [];

    const { result, unmount } = renderHook(() => useRealtimeApi(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <RealtimeApiProvider provider={provider}>{children}</RealtimeApiProvider>
      ),
    });

    // Register listener through the hook
    const unsub = result.current.onBidUpdate((u) => received.push(u));

    // Trigger an update imperatively
    act(() => {
      provider.triggerBidUpdate(SAMPLE_UPDATE);
    });

    expect(received).toHaveLength(1);
    expect(received[0]).toBe(SAMPLE_UPDATE);

    unsub();
    unmount();
  });

  it("stops delivering updates after unsub is called", () => {
    const provider = new MockRealtimeProvider({ autoStart: false });
    const cb = vi.fn();

    const { result, unmount } = renderHook(() => useRealtimeApi(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <RealtimeApiProvider provider={provider}>{children}</RealtimeApiProvider>
      ),
    });

    const unsub = result.current.onBidUpdate(cb);
    unsub();

    act(() => {
      provider.triggerBidUpdate(SAMPLE_UPDATE);
    });

    expect(cb).not.toHaveBeenCalled();
    unmount();
  });
});
