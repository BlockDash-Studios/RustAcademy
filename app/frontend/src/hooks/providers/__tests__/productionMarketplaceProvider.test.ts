/**
 * Unit tests for productionMarketplaceProvider
 *
 * Covers the production-safe request lifecycle contract:
 *   1. Request-shape validation happens before any network submission.
 *   2. Auth-only endpoints fail fast (no doomed network calls) when signed
 *      out, and attach the Authorization header when a token exists.
 *   3. Backend payloads are sanitised into domain types (ISO date strings →
 *      Date, string numbers → number, invalid entries dropped).
 *   4. Network/API failures resolve to safe, user-facing messages that do
 *      not leak internal paths or status internals.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { productionMarketplaceProvider } from "@/hooks/providers/productionMarketplaceProvider";
import {
  MARKETPLACE_AUTH_STORAGE_KEY,
  MarketplaceAuthRequiredError,
} from "@/hooks/marketplaceApi";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

const VALID_LISTING_JSON = {
  id: "listing-1",
  username: "nova",
  currentBid: 1400,
  buyNowPrice: 4000,
  ownerAddress: "GBXT...2R7K",
  endsAt: new Date("2030-01-01T00:00:00.000Z").toISOString(),
  createdAt: new Date("2029-12-01T00:00:00.000Z").toISOString(),
  status: "auction",
  category: "brand",
  bidCount: "8",
  watchers: 54,
  verified: true,
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(jsonResponse([VALID_LISTING_JSON])),
  );
  window.localStorage.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

// ── fetchListings ─────────────────────────────────────────────────────────────

describe("fetchListings", () => {
  it("sanitises raw JSON into domain listings (ISO strings become Dates)", async () => {
    const listings = await productionMarketplaceProvider.fetchListings();

    expect(listings).toHaveLength(1);
    const listing = listings[0];
    expect(listing.endsAt).toBeInstanceOf(Date);
    expect(listing.endsAt.getTime()).toBe(Date.parse("2030-01-01T00:00:00.000Z"));
    expect(listing.createdAt).toBeInstanceOf(Date);
    // String-encoded numeric fields are coerced.
    expect(listing.bidCount).toBe(8);
    expect(typeof listing.currentBid).toBe("number");
  });

  it("drops entries that cannot be repaired instead of crashing the UI", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse([
          VALID_LISTING_JSON,
          { id: "broken", username: "" },
          null,
          "garbage",
        ]),
      ),
    );

    const listings = await productionMarketplaceProvider.fetchListings();
    expect(listings).toHaveLength(1);
    expect(listings[0].id).toBe("listing-1");
  });

  it("throws a sanitized message on server failure without internal details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ error: "boom" }, 500)),
    );

    await expect(productionMarketplaceProvider.fetchListings()).rejects.toThrow(
      /temporarily unavailable/,
    );
  });

  it("maps network failures to a connection message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );

    await expect(productionMarketplaceProvider.fetchListings()).rejects.toThrow(
      /Cannot reach the marketplace/,
    );
  });
});

// ── auth requirements ────────────────────────────────────────────────────────

describe("authenticated endpoints", () => {
  it.each(["fetchUserBids", "fetchUserListings"] as const)(
    "%s fails fast with MarketplaceAuthRequiredError when signed out (no network call)",
    async (method) => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      await expect(
        productionMarketplaceProvider[method](),
      ).rejects.toBeInstanceOf(MarketplaceAuthRequiredError);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("fetchUserBids attaches the stored bearer token", async () => {
    window.localStorage.setItem(MARKETPLACE_AUTH_STORAGE_KEY, "test-token-123");

    await productionMarketplaceProvider.fetchUserBids();

    const calls = vi.mocked(fetch).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const [, init] = calls[calls.length - 1] ?? [];
    const headers = new Headers(
      (init?.headers ?? undefined) as HeadersInit | undefined,
    );
    expect(headers.get("Authorization")).toBe("Bearer test-token-123");
  });

  it("fetchUserBids sanitises the raw payload", async () => {
    window.localStorage.setItem(MARKETPLACE_AUTH_STORAGE_KEY, "tok");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse([
          {
            username: "nova",
            myBid: 1200,
            currentBid: "1400",
            endsAt: "2030-01-01T00:00:00.000Z",
            isWinning: false,
          },
        ]),
      ),
    );

    const bids = await productionMarketplaceProvider.fetchUserBids();
    expect(bids).toHaveLength(1);
    expect(bids[0].endsAt).toBeInstanceOf(Date);
    expect(bids[0].currentBid).toBe(1400);
  });
});

// ── placeBid ─────────────────────────────────────────────────────────────────

describe("placeBid request validation", () => {
  it.each([
    ["empty username", "", 100],
    ["non-string username", undefined, 100],
    ["username with whitespace", "no va", 100],
    ["NaN amount", "nova", NaN],
    ["zero amount", "nova", 0],
    ["negative amount", "nova", -5],
    ["infinite amount", "nova", Infinity],
  ])("rejects %s before any network submission", async (_label, username, amount) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await productionMarketplaceProvider.placeBid(
      username as string,
      amount as number,
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason.length).toBeGreaterThan(0);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("placeBid error boundaries", () => {
  it("returns success for an accepted bid", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ success: true })),
    );

    await expect(
      productionMarketplaceProvider.placeBid("nova", 1500),
    ).resolves.toEqual({ success: true });
  });

  it("passes through bounded server-provided rejection reasons", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ success: false, reason: "You have been outbid." }),
      ),
    );

    const result = await productionMarketplaceProvider.placeBid("nova", 1500);
    expect(result).toEqual({ success: false, reason: "You have been outbid." });
  });

  it("never leaks internal request details in failure reasons", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({}, 500)),
    );

    const result = await productionMarketplaceProvider.placeBid("nova", 1500);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).not.toMatch(/marketplace\/bids/);
      expect(result.reason).not.toMatch(/\b500\b/);
      expect(result.reason).toMatch(/temporarily unavailable|could not be placed/);
    }
  });

  it("falls back to a default reason for malformed response bodies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ unexpected: true })),
    );

    const result = await productionMarketplaceProvider.placeBid("nova", 1500);
    expect(result.success).toBe(false);
  });
});
