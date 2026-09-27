/**
 * Production marketplace provider.
 *
 * Calls the real RustAcademy backend REST API with production-safe request
 * lifecycle management:
 *   - request-shape validation before any network submission,
 *   - auth requirements enforced client-side (fail fast, no doomed requests),
 *   - response sanitisation so malformed payloads never reach the UI,
 *   - error boundaries that map raw network/API failures to safe, user-facing
 *     messages without leaking internal request details.
 *
 * Environment variable:
 *   NEXT_PUBLIC_RustAcademy_API_URL  — backend base URL (no trailing slash)
 *   Defaults to http://localhost:4000 when unset.
 */

import { getRustAcademyApiBase, isNetworkError } from "@/lib/api";
import type {
  BidResult,
  MarketplaceApiProvider,
  MarketplaceListing,
  UserBid,
  UserListing,
} from "@/hooks/marketplaceApi";
import {
  getStoredAuthToken,
  MarketplaceAuthRequiredError,
  sanitizeListings,
  sanitizeUserBids,
  sanitizeUserListings,
  validateBidRequest,
} from "@/hooks/marketplaceApi";

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_REASON_LENGTH = 200;
const DEFAULT_BID_FAILURE =
  "Your bid could not be placed. Please try again in a moment.";

/** API-level failure carrying the HTTP status for upstream classification. */
class MarketplaceApiError extends Error {
  readonly status: number;
  constructor(status: number, path: string) {
    super(`Marketplace API error ${status} on ${path}`);
    this.name = "MarketplaceApiError";
    this.status = status;
  }
}

async function apiFetch<T>(
  path: string,
  init?: RequestInit & { authToken?: string | null },
): Promise<T> {
  const { authToken, ...requestInit } = init ?? {};

  const headers = new Headers(requestInit.headers);
  headers.set("Accept", "application/json");
  if (requestInit.body) {
    headers.set("Content-Type", "application/json");
  }
  if (authToken) {
    // Attached per-request; never logged or embedded in error messages.
    headers.set("Authorization", `Bearer ${authToken}`);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${getRustAcademyApiBase()}${path}`, {
      ...requestInit,
      headers,
      signal: requestInit.signal ?? controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("The marketplace request timed out. Please try again.");
    }
    throw err;
  }
  clearTimeout(timeoutId);

  if (!res.ok) {
    throw new MarketplaceApiError(res.status, path);
  }
  return res.json() as Promise<T>;
}

/** Map an internal failure to a user-facing message with no internals leaked. */
function describeFetchFailure(error: unknown, fallback: string): string {
  if (error instanceof MarketplaceAuthRequiredError) return error.message;
  if (
    isNetworkError(error) ||
    (error instanceof Error &&
      (error.name === "AbortError" || /timed out/.test(error.message)))
  ) {
    return "Cannot reach the marketplace right now. Check your connection and retry.";
  }
  if (error instanceof MarketplaceApiError) {
    if (error.status === 401 || error.status === 403) {
      return "Your session has expired. Sign in again to continue.";
    }
    if (error.status >= 500) {
      return "The marketplace is temporarily unavailable. Please retry shortly.";
    }
    return fallback;
  }
  return fallback;
}

/** Extract a bounded, user-safe reason from a bid endpoint response body. */
function parseBidResponse(raw: unknown): BidResult | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.success !== "boolean") return null;
  if (record.success) return { success: true };
  const reason =
    typeof record.reason === "string" && record.reason.trim().length > 0
      ? record.reason.trim().slice(0, MAX_REASON_LENGTH)
      : DEFAULT_BID_FAILURE;
  return { success: false, reason };
}

export const productionMarketplaceProvider: MarketplaceApiProvider = {
  async fetchListings(): Promise<MarketplaceListing[]> {
    try {
      const raw = await apiFetch<unknown>("/marketplace/listings");
      return sanitizeListings(raw);
    } catch (err) {
      // Rethrow a sanitized message; the calling page owns user-visible
      // state and error reporting, and never sees internal details.
      throw new Error(describeFetchFailure(err, "Failed to load marketplace listings."));
    }
  },

  async fetchUserBids(): Promise<UserBid[]> {
    // Auth-only endpoint — validate the requirement before submitting
    // instead of making a doomed network call.
    const authToken = getStoredAuthToken();
    if (!authToken) throw new MarketplaceAuthRequiredError();

    try {
      const raw = await apiFetch<unknown>("/marketplace/bids/me", { authToken });
      return sanitizeUserBids(raw);
    } catch (err) {
      throw new Error(describeFetchFailure(err, "Failed to load your bids."));
    }
  },

  async fetchUserListings(): Promise<UserListing[]> {
    const authToken = getStoredAuthToken();
    if (!authToken) throw new MarketplaceAuthRequiredError();

    try {
      const raw = await apiFetch<unknown>("/marketplace/listings/me", { authToken });
      return sanitizeUserListings(raw);
    } catch (err) {
      throw new Error(describeFetchFailure(err, "Failed to load your listings."));
    }
  },

  async placeBid(username: string, amount: number): Promise<BidResult> {
    // Validate request shape locally — invalid requests never hit the wire.
    const validation = validateBidRequest(username, amount);
    if (!validation.ok) return { success: false, reason: validation.reason };

    try {
      const raw = await apiFetch<unknown>("/marketplace/bids", {
        method: "POST",
        authToken: getStoredAuthToken(),
        body: JSON.stringify({ username, amount }),
      });

      const parsed = parseBidResponse(raw);
      if (!parsed) {
        console.error(
          "[productionMarketplaceProvider] unexpected bid response shape",
        );
        return { success: false, reason: DEFAULT_BID_FAILURE };
      }
      return parsed;
    } catch (err) {
      console.error("[productionMarketplaceProvider] placeBid failed:", err);
      return { success: false, reason: describeFetchFailure(err, DEFAULT_BID_FAILURE) };
    }
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
