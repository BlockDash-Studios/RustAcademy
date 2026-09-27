/**
 * Production realtime provider.
 *
 * Connects to the real RustAcademy WebSocket server (Socket.io).
 * The TODO stubs below should be replaced with actual Socket.io calls
 * once the server contract is finalised.
 *
 * Environment variable:
 *   NEXT_PUBLIC_WS_URL — WebSocket server URL (e.g. wss://api.rustacademy.xyz)
 *   Defaults to ws://localhost:4000 when unset.
 */

import type { BidUpdate, RealtimeApiProvider } from "@/hooks/realtimeApi";

const getWsUrl = (): string =>
  process.env.NEXT_PUBLIC_WS_URL?.replace(/\/$/, "") ?? "ws://localhost:4000";

export class ProductionRealtimeProvider implements RealtimeApiProvider {
  private listeners: ((update: BidUpdate) => void)[] = [];
  private subscribedListings: Set<string> = new Set();
  private _isConnected = false;

  // TODO: replace `unknown` with the actual Socket.io client type once
  //       socket.io-client is imported: `import { Socket } from "socket.io-client"`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private socket: any = null;

  connect(): void {
    if (this._isConnected) return;

    // TODO: replace with real Socket.io initialisation, e.g.
    //   import { io } from "socket.io-client";
    //   this.socket = io(getWsUrl(), { transports: ["websocket"] });
    //   this.socket.on("connect", () => { this._isConnected = true; });
    //   this.socket.on("bid:update", (update: BidUpdate) => { this._notify(update); });
    console.warn(
      `[ProductionRealtimeProvider] connect() called — ws url: ${getWsUrl()}. Socket.io not yet wired.`,
    );
    this._isConnected = true; // optimistic until real socket is wired
  }

  disconnect(): void {
    // TODO: this.socket?.disconnect();
    this._isConnected = false;
    this.socket = null;
  }

  subscribeToListing(listingId: string): void {
    this.subscribedListings.add(listingId);
    // TODO: this.socket?.emit("marketplace:subscribe", { listingId });
  }

  unsubscribeFromListing(listingId: string): void {
    this.subscribedListings.delete(listingId);
    // TODO: this.socket?.emit("marketplace:unsubscribe", { listingId });
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

  private _notify(update: BidUpdate): void {
    this.listeners.forEach((cb) => cb(update));
  }
}

/** Singleton — one connection per page load. */
export const productionRealtimeProvider = new ProductionRealtimeProvider();
