/**
 * Realtime API — shared types and provider interface.
 *
 * Concrete implementations live in:
 *   hooks/providers/mockRealtimeProvider.ts       (local dev / test)
 *   hooks/providers/productionRealtimeProvider.ts (production)
 *
 * The active provider is selected by the factory in
 *   hooks/RealtimeApiContext.tsx
 */

export type BidUpdate = {
  listingId: string;
  username: string;
  newBid: number;
  bidderAddress: string;
  timestamp: Date;
};

/**
 * All real-time operations a provider must implement.
 */
export interface RealtimeApiProvider {
  /** Establish the connection. Idempotent — safe to call multiple times. */
  connect(): void;

  /** Tear down the connection and clean up timers. */
  disconnect(): void;

  /** Start receiving updates for a listing. */
  subscribeToListing(listingId: string): void;

  /** Stop receiving updates for a listing. */
  unsubscribeFromListing(listingId: string): void;

  /**
   * Register a callback for incoming bid updates.
   * Returns an unsubscribe function (mirrors the EventEmitter pattern).
   */
  onBidUpdate(callback: (update: BidUpdate) => void): () => void;

  /** Whether the connection is currently active. */
  readonly isConnected: boolean;
}
