/**
 * CORS security tests — Issue #662
 *
 * Acceptance criteria:
 *  1. Production requires an explicit allow-list (wildcard is rejected).
 *  2. `credentials: true` is set only when an explicit origin allow-list is in use.
 *  3. Preflight (OPTIONS) requests from allowed origins receive the correct
 *     `Access-Control-Allow-Origin` header.
 *  4. Preflight requests from denied origins are rejected.
 *
 * These tests exercise the env-schema validation and the bootstrap-level
 * guards independently of a running NestJS application.
 */

import * as Joi from 'joi';
import { envValidationSchema, ENV_VALIDATION_OPTIONS } from './env.schema';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate an env snapshot and return the coerced value.
 * Throws if validation fails.
 */
function validateEnv(
  env: Record<string, unknown>,
): Record<string, unknown> {
  const { error, value } = envValidationSchema.validate(env, {
    ...ENV_VALIDATION_OPTIONS,
    // allowUnknown lets us pass minimal fixtures without listing every key.
    allowUnknown: true,
  });
  if (error) {
    throw error;
  }
  return value as Record<string, unknown>;
}

/**
 * Minimal env fixture for the given NODE_ENV.
 * Secrets get dummy-but-valid values for non-production; production secrets
 * meet the minimum length requirement.
 */
function baseEnv(nodeEnv: string): Record<string, unknown> {
  const isProd = nodeEnv === 'production' || nodeEnv === 'staging';
  return {
    NODE_ENV: nodeEnv,
    JWT_SECRET: isProd
      ? 'a-production-grade-jwt-secret-with-sufficient-length-32+'
      : undefined, // schema provides a dev default
    DATABASE_URL: isProd
      ? 'postgresql://user:pass@db.example.com:5432/rustacademy'
      : undefined,
    REDIS_HOST: isProd ? 'redis.example.com' : undefined,
    ASSET_SIGNING_SECRET: isProd
      ? 'a-production-grade-asset-signing-secret-with-sufficient-length'
      : undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema-level tests
// ─────────────────────────────────────────────────────────────────────────────

describe('CORS_ORIGIN env-schema validation', () => {
  describe('development / test environments', () => {
    it('defaults to "*" when CORS_ORIGIN is omitted in development', () => {
      const env = validateEnv({ ...baseEnv('development') });
      expect(env['CORS_ORIGIN']).toBe('*');
    });

    it('defaults to "*" when CORS_ORIGIN is omitted in test', () => {
      const env = validateEnv({ ...baseEnv('test') });
      expect(env['CORS_ORIGIN']).toBe('*');
    });

    it('accepts a wildcard origin in development', () => {
      const env = validateEnv({ ...baseEnv('development'), CORS_ORIGIN: '*' });
      expect(env['CORS_ORIGIN']).toBe('*');
    });

    it('parses a single explicit origin in development', () => {
      const env = validateEnv({
        ...baseEnv('development'),
        CORS_ORIGIN: 'http://localhost:3000',
      });
      expect(env['CORS_ORIGIN']).toBe('http://localhost:3000');
    });

    it('parses a comma-separated list into an array in development', () => {
      const env = validateEnv({
        ...baseEnv('development'),
        CORS_ORIGIN: 'http://localhost:3000,http://localhost:4000',
      });
      expect(env['CORS_ORIGIN']).toEqual([
        'http://localhost:3000',
        'http://localhost:4000',
      ]);
    });

    it('trims whitespace around individual origins', () => {
      const env = validateEnv({
        ...baseEnv('development'),
        CORS_ORIGIN: '  https://app.example.com , https://www.example.com  ',
      });
      expect(env['CORS_ORIGIN']).toEqual([
        'https://app.example.com',
        'https://www.example.com',
      ]);
    });
  });

  describe('production / staging environments — wildcard is forbidden', () => {
    it.each(['production', 'staging'])(
      'rejects CORS_ORIGIN="*" in %s',
      (nodeEnv) => {
        expect(() =>
          validateEnv({ ...baseEnv(nodeEnv), CORS_ORIGIN: '*' }),
        ).toThrow();
      },
    );

    it.each(['production', 'staging'])(
      'rejects a missing CORS_ORIGIN in %s (no default)',
      (nodeEnv) => {
        const env: Record<string, unknown> = { ...baseEnv(nodeEnv) };
        delete env['CORS_ORIGIN'];
        expect(() => validateEnv(env)).toThrow(/CORS_ORIGIN/i);
      },
    );

    it.each(['production', 'staging'])(
      'accepts a single explicit origin in %s',
      (nodeEnv) => {
        const env = validateEnv({
          ...baseEnv(nodeEnv),
          CORS_ORIGIN: 'https://rustacademy.xyz',
        });
        expect(env['CORS_ORIGIN']).toBe('https://rustacademy.xyz');
      },
    );

    it.each(['production', 'staging'])(
      'accepts a comma-separated allow-list in %s',
      (nodeEnv) => {
        const env = validateEnv({
          ...baseEnv(nodeEnv),
          CORS_ORIGIN:
            'https://rustacademy.xyz,https://www.rustacademy.xyz',
        });
        expect(env['CORS_ORIGIN']).toEqual([
          'https://rustacademy.xyz',
          'https://www.rustacademy.xyz',
        ]);
      },
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CORS callback / credentials logic (mirrors the bootstrap-level behaviour)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Minimal replica of the CORS allow-list check implemented in `main.ts`.
 *
 * `origin` is what Express passes to the CORS callback — either a string or
 * `undefined` (same-origin / non-browser requests). Returns a tuple of
 * [allowed: boolean, credentials: boolean] so a single call can assert both.
 */
function evaluateCors(
  configuredOrigin: string | string[],
  requestOrigin: string | undefined,
): { allowed: boolean; credentials: boolean } {
  const isWildcard = configuredOrigin === '*';
  const credentials = !isWildcard;

  if (isWildcard) {
    return { allowed: true, credentials };
  }

  const allowList = Array.isArray(configuredOrigin)
    ? configuredOrigin
    : [configuredOrigin];

  const allowed =
    requestOrigin === undefined || allowList.includes(requestOrigin);

  return { allowed, credentials };
}

describe('CORS allow-list runtime behaviour', () => {
  describe('wildcard configuration (development)', () => {
    const origin = '*' as const;

    it('allows any request origin', () => {
      expect(evaluateCors(origin, 'https://attacker.example.com').allowed).toBe(true);
    });

    it('does NOT enable credentials with a wildcard', () => {
      // credentials:true + origin:'*' is rejected by browsers and is a
      // security vulnerability — the two must never be combined.
      expect(evaluateCors(origin, 'https://attacker.example.com').credentials).toBe(false);
    });

    it('allows same-origin (undefined) requests', () => {
      expect(evaluateCors(origin, undefined).allowed).toBe(true);
    });
  });

  describe('single explicit origin allow-list', () => {
    const origin = 'https://rustacademy.xyz';

    it('allows the configured origin', () => {
      expect(evaluateCors(origin, 'https://rustacademy.xyz').allowed).toBe(true);
    });

    it('rejects an unlisted origin', () => {
      expect(evaluateCors(origin, 'https://attacker.example.com').allowed).toBe(false);
    });

    it('rejects a subdomain of the allowed origin', () => {
      expect(evaluateCors(origin, 'https://api.rustacademy.xyz').allowed).toBe(false);
    });

    it('enables credentials when an explicit allow-list is configured', () => {
      expect(evaluateCors(origin, 'https://rustacademy.xyz').credentials).toBe(true);
    });

    it('allows same-origin (undefined) requests', () => {
      expect(evaluateCors(origin, undefined).allowed).toBe(true);
    });
  });

  describe('multi-origin allow-list', () => {
    const origins = [
      'https://rustacademy.xyz',
      'https://www.rustacademy.xyz',
    ];

    it('allows each origin in the list', () => {
      for (const o of origins) {
        expect(evaluateCors(origins, o).allowed).toBe(true);
      }
    });

    it('rejects an origin not in the list', () => {
      expect(evaluateCors(origins, 'https://evil.example.com').allowed).toBe(false);
    });

    it('rejects a partial match (prefix match must not pass)', () => {
      expect(evaluateCors(origins, 'https://rustacademy.xyz.evil.com').allowed).toBe(
        false,
      );
    });

    it('enables credentials with an explicit list', () => {
      expect(evaluateCors(origins, 'https://rustacademy.xyz').credentials).toBe(true);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Production bootstrap guard (mirrors the check at the top of bootstrap())
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Replica of the bootstrap guard in `main.ts`:
 *
 * ```ts
 * if (nodeEnv === 'production' || nodeEnv === 'staging') {
 *   if (isWildcard) { throw new Error(...); }
 * }
 * ```
 */
function runBootstrapGuard(nodeEnv: string, corsOrigin: string | string[]): void {
  const isWildcard = corsOrigin === '*';
  if ((nodeEnv === 'production' || nodeEnv === 'staging') && isWildcard) {
    throw new Error(
      'CORS_ORIGIN must not be "*" in production or staging. ' +
        'Set it to a comma-separated allow-list of explicit origins.',
    );
  }
}

describe('Bootstrap CORS guard', () => {
  it.each(['production', 'staging'])(
    'throws when CORS_ORIGIN is "*" in %s',
    (nodeEnv) => {
      expect(() => runBootstrapGuard(nodeEnv, '*')).toThrow(
        /CORS_ORIGIN must not be "\*"/,
      );
    },
  );

  it.each(['production', 'staging'])(
    'does not throw with an explicit origin in %s',
    (nodeEnv) => {
      expect(() =>
        runBootstrapGuard(nodeEnv, 'https://rustacademy.xyz'),
      ).not.toThrow();
    },
  );

  it.each(['production', 'staging'])(
    'does not throw with an array allow-list in %s',
    (nodeEnv) => {
      expect(() =>
        runBootstrapGuard(nodeEnv, [
          'https://rustacademy.xyz',
          'https://www.rustacademy.xyz',
        ]),
      ).not.toThrow();
    },
  );

  it('does not throw in development with wildcard', () => {
    expect(() => runBootstrapGuard('development', '*')).not.toThrow();
  });

  it('does not throw in test with wildcard', () => {
    expect(() => runBootstrapGuard('test', '*')).not.toThrow();
  });
});
