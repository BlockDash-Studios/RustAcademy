import type { MarketplaceListing } from "@/hooks/marketplaceApi";

export type IncomingBidUpdate = {
  listingId: string;
  newBid: number;
  /** Authoritative total bid count, when the backend provides one. */
  bidCount?: number;
};

/**
 * Applies a realtime bid update to a listing set, guarding against stale,
 * duplicate, and out-of-order deliveries.
 *
 * Auction bids are strictly increasing, so an update only counts as new when
 * it raises the listing's current bid. Anything else — a duplicate delivery,
 * an out-of-order older bid, or the websocket echo of a bid already applied
 * locally — leaves the listing untouched, including its bid count.
 *
 * Returns the input array (same reference) when nothing applied, so React
 * state setters can skip the re-render.
 */
export function applyBidUpdate(
  listings: MarketplaceListing[],
  update: IncomingBidUpdate,
): MarketplaceListing[] {
  const index = listings.findIndex((l) => l.id === update.listingId);
  if (index === -1) return listings;

  const listing = listings[index];
  if (update.newBid <= listing.currentBid) return listings;

  const next = [...listings];
  next[index] = {
    ...listing,
    currentBid: update.newBid,
    bidCount: update.bidCount ?? listing.bidCount + 1,
  };
  return next;
}

/**
 * Applies the user's own successful bid through the same monotonic guard, so
 * a bid that raced with a higher realtime update cannot regress the shown
 * price, and the later websocket echo of this bid (same amount) is discarded
 * instead of double-counted.
 */
export function applyLocalBid(
  listings: MarketplaceListing[],
  username: string,
  amount: number,
): MarketplaceListing[] {
  const listing = listings.find((l) => l.username === username);
  if (!listing) return listings;
  return applyBidUpdate(listings, { listingId: listing.id, newBid: amount });
}
