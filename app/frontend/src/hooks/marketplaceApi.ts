/**
 * Marketplace API — shared types and provider interface.
 *
 * Concrete implementations live in:
 *   hooks/providers/mockMarketplaceProvider.ts    (local dev / test)
 *   hooks/providers/productionMarketplaceProvider.ts  (production)
 *
 * The active provider is selected by the factory in
 *   hooks/MarketplaceApiContext.tsx
 * and exposed via React context so consumers never import a
 * concrete provider directly.
 */

// ── Domain types ────────────────────────────────────────────────────────────

export type UsernameStatus = "auction" | "buyNow" | "sold" | "listed";

export type MarketplaceListing = {
  id: string;
  username: string;
  currentBid: number;
  buyNowPrice: number | null;
  ownerAddress: string;
  endsAt: Date;
  /** Used for "Newest First" sort. */
  createdAt: Date;
  status: UsernameStatus;
  category: "trending" | "short" | "og" | "crypto" | "brand";
  bidCount: number;
  watchers: number;
  verified: boolean;
};

export type UserBid = {
  username: string;
  myBid: number;
  currentBid: number;
  endsAt: Date;
  isWinning: boolean;
};

export type UserListing = {
  username: string;
  minBid: number;
  currentBid: number;
  bidCount: number;
  endsAt: Date;
};

export type BidResult = { success: true } | { success: false; reason: string };

// ── Request validation ───────────────────────────────────────────────────────

/** Upper bound applied to usernames before they are sent to the backend. */
export const MAX_USERNAME_LENGTH = 64;

/**
 * Result of validating an outbound request payload.
 *
 * `ok: false` carries a user-facing `reason` that is safe to render — it is
 * produced locally and never contains raw server or network internals.
 */
export type ValidationResult = { ok: true } | { ok: false; reason: string };

const CONTROL_OR_WHITESPACE_RE = /[\s\u0000-\u001f\u007f]/;

/**
 * Validate a bid request *before* it reaches any network layer.
 *
 * Shared by the mock and production providers so local dev enforces exactly
 * the same request contract as production. Structural checks only (types,
 * bounds, control characters) — never assume a username charset policy that
 * belongs to the backend.
 */
export function validateBidRequest(
  username: unknown,
  amount: unknown,
  options?: { minAmount?: number },
): ValidationResult {
  if (typeof username !== "string" || username.trim().length === 0) {
    return { ok: false, reason: "A target username is required to place a bid." };
  }
  if (
    username.length > MAX_USERNAME_LENGTH ||
    CONTROL_OR_WHITESPACE_RE.test(username)
  ) {
    return {
      ok: false,
      reason: "This listing's username looks invalid. Refresh the page and try again.",
    };
  }
  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    return { ok: false, reason: "Enter a valid bid amount in USDC." };
  }
  if (amount <= 0) {
    return { ok: false, reason: "Your bid must be greater than zero." };
  }
  const minAmount = options?.minAmount;
  if (typeof minAmount === "number" && Number.isFinite(minAmount) && amount < minAmount) {
    return { ok: false, reason: `Your bid must be at least ${minAmount} USDC.` };
  }
  return { ok: true };
}

// ── Auth requirements ────────────────────────────────────────────────────────

/**
 * localStorage key holding the bearer token used for authenticated
 * marketplace endpoints (`/marketplace/bids/me`, `/marketplace/listings/me`).
 */
export const MARKETPLACE_AUTH_STORAGE_KEY = "RustAcademy.authToken";

/** Raised when an auth-only endpoint is requested while signed out. */
export class MarketplaceAuthRequiredError extends Error {
  constructor(
    message = "Sign in with your Stellar wallet to view your bids and listings.",
  ) {
    super(message);
    this.name = "MarketplaceAuthRequiredError";
  }
}

/** Read the stored session token, or null when signed out / on the server. */
export function getStoredAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const token = window.localStorage.getItem(MARKETPLACE_AUTH_STORAGE_KEY);
    if (typeof token !== "string") return null;
    const trimmed = token.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

// ── Response sanitisation ────────────────────────────────────────────────────
/**
 * Real backend payloads are untyped JSON: dates arrive as ISO strings,
 * numbers may arrive as strings, and fields can be missing entirely.
 * Rendering such values unvalidated crashes components that call
 * `.getTime()` / `.toLocaleString()`. These coercers turn raw payloads into
 * the domain types above, dropping entries that cannot be repaired.
 */

function coerceFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function coerceDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function coerceNonEmptyString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) return null;
  return trimmed;
}

const LISTING_CATEGORIES: MarketplaceListing["category"][] = [
  "trending",
  "short",
  "og",
  "crypto",
  "brand",
];

const LISTING_STATUSES: UsernameStatus[] = ["auction", "buyNow", "sold", "listed"];

/** Coerce one raw backend listing into a {@link MarketplaceListing}, or null. */
export function sanitizeListing(raw: unknown): MarketplaceListing | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;

  const id = coerceNonEmptyString(record.id, 128);
  const username = coerceNonEmptyString(record.username, MAX_USERNAME_LENGTH);
  const currentBid = coerceFiniteNumber(record.currentBid);
  const ownerAddress =
    typeof record.ownerAddress === "string" ? record.ownerAddress : null;
  const endsAt = coerceDate(record.endsAt);
  const createdAt = coerceDate(record.createdAt);
  const status = LISTING_STATUSES.find((s) => s === record.status);
  const category = LISTING_CATEGORIES.find((c) => c === record.category);

  if (
    id === null ||
    username === null ||
    currentBid === null ||
    ownerAddress === null ||
    endsAt === null ||
    createdAt === null ||
    status === undefined ||
    category === undefined
  ) {
    return null;
  }

  const buyNowPrice =
    record.buyNowPrice === null || record.buyNowPrice === undefined
      ? null
      : coerceFiniteNumber(record.buyNowPrice);

  return {
    id,
    username,
    currentBid,
    buyNowPrice,
    ownerAddress,
    endsAt,
    createdAt,
    status,
    category,
    bidCount: coerceFiniteNumber(record.bidCount) ?? 0,
    watchers: coerceFiniteNumber(record.watchers) ?? 0,
    verified: Boolean(record.verified),
  };
}

/** Sanitize a raw listings response; invalid entries are dropped. */
export function sanitizeListings(raw: unknown): MarketplaceListing[] {
  if (!Array.isArray(raw)) return [];
  const sanitized: MarketplaceListing[] = [];
  for (const entry of raw) {
    const listing = sanitizeListing(entry);
    if (listing) sanitized.push(listing);
  }
  return sanitized;
}

/** Coerce a raw `/marketplace/bids/me` payload into {@link UserBid}s. */
export function sanitizeUserBids(raw: unknown): UserBid[] {
  if (!Array.isArray(raw)) return [];
  const sanitized: UserBid[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const username = coerceNonEmptyString(record.username, MAX_USERNAME_LENGTH);
    const myBid = coerceFiniteNumber(record.myBid);
    const currentBid = coerceFiniteNumber(record.currentBid);
    const endsAt = coerceDate(record.endsAt);
    if (username === null || myBid === null || currentBid === null || endsAt === null) {
      continue;
    }
    sanitized.push({
      username,
      myBid,
      currentBid,
      endsAt,
      isWinning: Boolean(record.isWinning),
    });
  }
  return sanitized;
}

/** Coerce a raw `/marketplace/listings/me` payload into {@link UserListing}s. */
export function sanitizeUserListings(raw: unknown): UserListing[] {
  if (!Array.isArray(raw)) return [];
  const sanitized: UserListing[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const username = coerceNonEmptyString(record.username, MAX_USERNAME_LENGTH);
    const minBid = coerceFiniteNumber(record.minBid);
    const currentBid = coerceFiniteNumber(record.currentBid);
    const bidCount = coerceFiniteNumber(record.bidCount);
    const endsAt = coerceDate(record.endsAt);
    if (
      username === null ||
      minBid === null ||
      currentBid === null ||
      bidCount === null ||
      endsAt === null
    ) {
      continue;
    }
    sanitized.push({ username, minBid, currentBid, bidCount, endsAt });
  }
  return sanitized;
}

/**
 * Human-readable countdown to the given date.
 * e.g. "2d 3h", "47m", "Ended"
 *
 * Pure helper shared by the mock and production providers so components
 * (e.g. UsernameCard) can render the countdown without coupling to a
 * specific provider.
 */
export function formatCountdown(date: Date, now: number = Date.now()): string {
  const diff = date.getTime() - now;
  if (diff <= 0) return "Ended";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// ── Provider interface ───────────────────────────────────────────────────────

/**
 * All marketplace data operations that a provider must implement.
 * Both mock and production providers satisfy this contract.
 */
export interface MarketplaceApiProvider {
  /** Fetch all active listings. */
  fetchListings(): Promise<MarketplaceListing[]>;

  /** Fetch the current user's active bids. */
  fetchUserBids(): Promise<UserBid[]>;

  /** Fetch listings created by the current user. */
  fetchUserListings(): Promise<UserListing[]>;

  /** Submit a bid on a listing. */
  placeBid(username: string, amount: number): Promise<BidResult>;

  /**
   * Human-readable countdown to the given date.
   * e.g. "2d 3h", "47m", "Ended"
   *
   * Provided by the provider so that tests can inject a deterministic
   * clock without monkey-patching Date.now globally.
   */
  formatCountdown(date: Date): string;
}
