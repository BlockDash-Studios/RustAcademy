# Smoke Tests

Smoke tests are end-to-end checks meant to answer one question after a deploy:
**"is this environment actually wired up correctly?"** They hit real endpoints and
real services (Supabase, Horizon, Soroban RPC) — they do not mock external
dependencies the way unit tests do. `ApiKeyGuard` and `CustomThrottlerGuard` are
overridden to always allow requests, so these tests focus on business logic and
connectivity rather than auth/rate-limit behavior.

Run them against an environment that has real, reachable credentials for
Supabase, Horizon, and Soroban RPC (see [README.md](../README.md#environment-variables)
for required variables). They are not meant to run against a fully mocked/offline
setup.

## Scripts

```bash
pnpm test:smoke          # test/smoke.e2e-spec.ts — general deployment validation
pnpm test:smoke:soroban  # test/smoke-soroban-horizon.e2e-spec.ts — Soroban RPC & Horizon only
pnpm test:smoke:all      # runs both (test/smoke*.e2e-spec.ts)
```

Each script runs via `jest --config jest.e2e.config.ts` with a 30s per-test timeout.

## `test:smoke` — general deployment validation

File: `test/smoke.e2e-spec.ts`

| Area | What it checks |
|---|---|
| Health endpoints | `GET /health` returns `status: "ok"` with version/uptime. `GET /ready` returns `ready: true` with per-dependency checks for `supabase`, `environment`, `horizon`, and `soroban_rpc`, including latency metrics. |
| Network configuration | The `environment` check in `/ready` reports which network (`testnet`/`public`) is active. Horizon and Soroban RPC checks report `up` with no error. |
| Link metadata | `POST /links/metadata` generates payment link data for XLM, respects the `privacy` flag, calculates `expiresAt` when `expirationDays` is given, and rejects invalid assets or negative amounts with 400s. |
| Username endpoints | `GET /username/search`, `/username/trending`, and `/username/recently-active` return well-formed result sets; short search queries (<2 chars) are rejected with 400. |
| Asset metadata | `GET /asset-metadata` resolves known assets (e.g. `XLM`) and returns 404 for unknown ones. |
| Critical dependencies | Confirms Supabase, DB migrations, and the job queue all report `up` in `/ready`. |
| Error handling | Unknown routes return 404; validation failures return a consistent `{ success: false, error }` envelope. |
| Performance budgets | `/health` < 100ms, `/links/metadata` < 500ms, `/username/search` < 1000ms. |

## `test:smoke:soroban` — Soroban RPC & Horizon connectivity

File: `test/smoke-soroban-horizon.e2e-spec.ts`

| Area | What it checks |
|---|---|
| Soroban RPC connectivity | `getNetworkPassphrase()` returns one of the known Stellar network passphrases (public/testnet/futurenet), and responds within 5s. `/ready`'s `soroban_rpc` check reports `up`. |
| Transaction simulation | Simulating a payment transaction against a random (non-existent) account either returns a result or throws an expected error — it should not silently hang, and must resolve within 10s. |
| Account operations | `getAccount()` for a random public key throws a descriptive "does not exist on the network" error, and does so within 5s. |
| Horizon connectivity | `/ready`'s `horizon` check reports `up`; latency, if reported, stays under 5000ms. |
| Horizon account operations | `getPayments()` works with/without an asset filter, respects the `limit` param, and resolves within 10s even for accounts with no history. |
| Network consistency | The network reported by Soroban RPC's passphrase matches the network reported by `/ready`'s `environment` check — catches config drift between the two integrations. |
| Error resilience | Confirms slow/failing calls resolve (don't hang) within generous bounds (5–15s), and that any `down` health check always includes an `error` field. |
| Performance budgets | `getNetworkPassphrase()` < 2s, Horizon `getPayments()` < 5s, `/ready` overall < 10s. |

## When to run which

- **Local development / quick sanity check after touching config, health checks, or
  the `/ready` endpoint:** `pnpm test:smoke`
- **After touching Stellar/Soroban integration code, RPC config, or Horizon
  service logic:** `pnpm test:smoke:soroban`
- **Post-deploy validation (staging/production):** `pnpm test:smoke:all`

## Notes

- These tests make real network calls to Horizon and Soroban RPC. Expect them to
  be slower and less deterministic than unit tests; the generous timeouts (5–15s)
  and "resolves without hanging" assertions reflect that rather than strict
  behavioral guarantees.
- Tests involving random keypairs (`StellarSdk.Keypair.random()`) intentionally
  target accounts that don't exist on the network — they're verifying graceful
  failure handling, not successful lookups.