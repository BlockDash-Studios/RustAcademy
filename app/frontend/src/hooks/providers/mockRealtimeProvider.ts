/**
 * Mock realtime provider.
 *
 * Simulates a WebSocket that emits random bid updates on a 5-second
 * interval. Used in local dev (NEXT_PUBLIC_API_MOCK=true) and tests.
 *
 * In tests you typically do NOT want the interval firing; pass
 * `autoStart = false` and call `triggerBidUpdate()` manually instead.
 */

import type { BidUpdate, RealtimeApiProvider } from "@/hooks/realtimeApi";

export class MockRealtimeProvider implements RealtimeApiProvider {
  private listeners: ((update: BidUpdate) => void)[] = [];
  private subscribedListings: Set<string> = new Set();
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private _isConnected = false;
  private readonly autoStart: boolean;

  constructor({ autoStart = true }: { autoStart?: boolean } = {}) {
    this.autoStart = autoStart;
  }

  connect(): void {
    if (this._isConnected) return;
    this._isConnected = true;

    if (this.autoStart) {
      // 30 % chance of emitting a random update every 5 s
      this.intervalId = setInterval(() => {
        if (this.subscribedListings.size > 0 && Math.random() < 0.3) {
          this._emitRandomUpdate();
        }
      }, 5_000);
    }
  }

  disconnect(): void {
    this._isConnected = false;
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  subscribeToListing(listingId: string): void {
    this.subscribedListings.add(listingId);
  }

  unsubscribeFromListing(listingId: string): void {
    this.subscribedListings.delete(listingId);
  }

  onBidUpdate(callback: (update: BidUpdate) => void): () => void {
    this.listeners.push(callback);
    return () => {
      const idx = this.listeners.indexOf(callback);
      if (idx > -1) this.listeners.splice(idx, 1);
    };
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  /**
   * Imperatively emit a bid update — handy in unit tests where you
   * want full control over what arrives over the "wire".
   */
  triggerBidUpdate(update: BidUpdate): void {
    this.listeners.forEach((cb) => cb(update));
  }

  private _emitRandomUpdate(): void {
    const ids = Array.from(this.subscribedListings);
    if (ids.length === 0) return;

    const listingId = ids[Math.floor(Math.random() * ids.length)];
    const newBid =
      Math.floor(Math.random() * 5_000) + 1_000 + Math.floor(Math.random() * 150) + 50;

    const update: BidUpdate = {
      listingId,
      username: `user${Math.floor(Math.random() * 1_000)}`,
      newBid,
      bidderAddress: `G${Math.random().toString(36).substring(2, 15).toUpperCase()}...${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
      timestamp: new Date(),
    };

    this.listeners.forEach((cb) => cb(update));
  }
}

/** Singleton used in non-test environments when mock mode is on. */
export const mockRealtimeProvider = new MockRealtimeProvider();
