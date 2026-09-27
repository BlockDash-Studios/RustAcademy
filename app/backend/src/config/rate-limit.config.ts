/**
 * Rate limits are applied per request based on a resolved group.
 * Group resolution order (see CustomThrottlerGuard):
 *   1. An explicit @RateLimitGroupTag(...) decorator on the route, if present.
 *      Sensitive mutations (admin, auth, and payment-sensitive routes) MUST be
 *      tagged "sensitive" explicitly — it is never inferred automatically.
 *   2. Requests to a /webhooks path → "webhooks" group.
 *   3. Requests with a resolvable user ID or API key → "authenticated" group.
 *   4. Everything else → "public" group.
 *
 * Note: the API_KEYS env var (bcrypt-hashed keys for API key auth) does NOT
 * affect these limits — it's a separate, unrelated auth mechanism.
 *
 * ## The "sensitive" group
 *
 * Sensitive mutations get a stricter identity-keyed limit (same shape as the
 * other groups, `groups.sensitive`) PLUS an independent, always-IP-keyed
 * limit (`sensitiveIpLimits`) that applies even when the caller is
 * authenticated. Both must pass — see CustomThrottlerGuard#handleRequest.
 * This catches two distinct abuse patterns:
 *   - one identity hammering the endpoint (bounded by `groups.sensitive`)
 *   - one IP cycling through many identities/accounts, e.g. credential
 *     stuffing or account enumeration (bounded by `sensitiveIpLimits`)
 */
export type RateLimitGroup = "public" | "authenticated" | "webhooks" | "sensitive";
export type RateLimitWindow = "burst" | "sustained";
export type RateLimitKeyType = "user_id" | "api_key" | "ip";

export const RATE_LIMIT_GROUP_METADATA_KEY = "rate_limit_group";
export const THROTTLER_BURST_NAME = "burst";
export const THROTTLER_SUSTAINED_NAME = "sustained";

type GroupWindowConfig = {
  limit: number;
  ttlMs: number;
};

type GroupConfig = {
  burst: GroupWindowConfig;
  sustained: GroupWindowConfig;
};

export type RateLimitConfig = {
  groups: Record<RateLimitGroup, GroupConfig>;
  /**
   * Always-IP-keyed limits enforced in addition to `groups.sensitive` (which
   * is keyed by the resolved identity — user_id/api_key/ip, per keyOrder).
   * Only consulted for the "sensitive" group.
   */
  sensitiveIpLimits: GroupConfig;
  keyOrder: RateLimitKeyType[];
};

/**
 * Once a request's rate-limit group is resolved, this determines which
 * identity is used to track its usage against the group's limits — the
 * first available identity type in this order wins. Configurable via
 * RATE_LIMIT_KEY_ORDER (comma-separated, e.g. "api_key,user_id,ip").
 */
const DEFAULT_KEY_ORDER: RateLimitKeyType[] = ["user_id", "api_key", "ip"];

function parseKeyOrder(raw?: string): RateLimitKeyType[] {
  if (!raw) return DEFAULT_KEY_ORDER;

  const tokens = raw
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

  const ordered = tokens.filter(
    (value): value is RateLimitKeyType =>
      value === "user_id" || value === "api_key" || value === "ip",
  );

  return ordered.length > 0 ? ordered : DEFAULT_KEY_ORDER;
}

export const throttlerConfig: RateLimitConfig = {
  groups: {
    public: {
      burst: {
        limit: Number(process.env["RATE_LIMIT_PUBLIC_BURST_LIMIT"] ?? 10),
        ttlMs: Number(process.env["RATE_LIMIT_PUBLIC_BURST_TTL_MS"] ?? 10_000),
      },
      sustained: {
        limit: Number(process.env["RATE_LIMIT_PUBLIC_SUSTAINED_LIMIT"] ?? 20),
        ttlMs: Number(
          process.env["RATE_LIMIT_PUBLIC_SUSTAINED_TTL_MS"] ?? 60_000,
        ),
      },
    },
    authenticated: {
      burst: {
        limit: Number(
          process.env["RATE_LIMIT_AUTHENTICATED_BURST_LIMIT"] ?? 40,
        ),
        ttlMs: Number(
          process.env["RATE_LIMIT_AUTHENTICATED_BURST_TTL_MS"] ?? 10_000,
        ),
      },
      sustained: {
        limit: Number(
          process.env["RATE_LIMIT_AUTHENTICATED_SUSTAINED_LIMIT"] ?? 120,
        ),
        ttlMs: Number(
          process.env["RATE_LIMIT_AUTHENTICATED_SUSTAINED_TTL_MS"] ?? 60_000,
        ),
      },
    },
    webhooks: {
      burst: {
        limit: Number(process.env["RATE_LIMIT_WEBHOOKS_BURST_LIMIT"] ?? 20),
        ttlMs: Number(
          process.env["RATE_LIMIT_WEBHOOKS_BURST_TTL_MS"] ?? 10_000,
        ),
      },
      sustained: {
        limit: Number(process.env["RATE_LIMIT_WEBHOOKS_SUSTAINED_LIMIT"] ?? 60),
        ttlMs: Number(
          process.env["RATE_LIMIT_WEBHOOKS_SUSTAINED_TTL_MS"] ?? 60_000,
        ),
      },
    },
    // Admin, auth, and payment-sensitive mutations (Issue #551). Deliberately
    // far stricter than "authenticated" — these are the routes worth abusing
    // (privilege changes, payouts, marketplace transfers), so a legitimate
    // caller should rarely brush against these limits.
    sensitive: {
      burst: {
        limit: Number(process.env["RATE_LIMIT_SENSITIVE_BURST_LIMIT"] ?? 5),
        ttlMs: Number(
          process.env["RATE_LIMIT_SENSITIVE_BURST_TTL_MS"] ?? 10_000,
        ),
      },
      sustained: {
        limit: Number(process.env["RATE_LIMIT_SENSITIVE_SUSTAINED_LIMIT"] ?? 20),
        ttlMs: Number(
          process.env["RATE_LIMIT_SENSITIVE_SUSTAINED_TTL_MS"] ?? 60_000,
        ),
      },
    },
  },
  sensitiveIpLimits: {
    burst: {
      limit: Number(process.env["RATE_LIMIT_SENSITIVE_IP_BURST_LIMIT"] ?? 15),
      ttlMs: Number(
        process.env["RATE_LIMIT_SENSITIVE_IP_BURST_TTL_MS"] ?? 10_000,
      ),
    },
    sustained: {
      limit: Number(
        process.env["RATE_LIMIT_SENSITIVE_IP_SUSTAINED_LIMIT"] ?? 50,
      ),
      ttlMs: Number(
        process.env["RATE_LIMIT_SENSITIVE_IP_SUSTAINED_TTL_MS"] ?? 60_000,
      ),
    },
  },
  keyOrder: parseKeyOrder(process.env["RATE_LIMIT_KEY_ORDER"]),
};

/** Marks a throttler profile name as the always-IP-keyed sensitive check. */
export const SENSITIVE_IP_SEGMENT = "ip";

function buildThrottlerProfiles(): { name: string; ttl: number; limit: number }[] {
  const profiles: { name: string; ttl: number; limit: number }[] = [];
  const groups: RateLimitGroup[] = ["public", "authenticated", "webhooks", "sensitive"];

  for (const group of groups) {
    const config = throttlerConfig.groups[group];
    profiles.push({
      name: `${group}_${THROTTLER_BURST_NAME}`,
      ttl: config.burst.ttlMs,
      limit: config.burst.limit,
    });
    profiles.push({
      name: `${group}_${THROTTLER_SUSTAINED_NAME}`,
      ttl: config.sustained.ttlMs,
      limit: config.sustained.limit,
    });
  }

  // Second, independent limiter for "sensitive": always keyed by IP,
  // enforced in addition to the identity-keyed sensitive_* limiter above.
  profiles.push({
    name: `sensitive_${SENSITIVE_IP_SEGMENT}_${THROTTLER_BURST_NAME}`,
    ttl: throttlerConfig.sensitiveIpLimits.burst.ttlMs,
    limit: throttlerConfig.sensitiveIpLimits.burst.limit,
  });
  profiles.push({
    name: `sensitive_${SENSITIVE_IP_SEGMENT}_${THROTTLER_SUSTAINED_NAME}`,
    ttl: throttlerConfig.sensitiveIpLimits.sustained.ttlMs,
    limit: throttlerConfig.sensitiveIpLimits.sustained.limit,
  });

  return profiles;
}

export const throttlerModuleProfiles = buildThrottlerProfiles();
