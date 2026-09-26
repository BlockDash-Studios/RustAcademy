# BackendAcademy

NestJS backend API for RustAcademy — the decentralized, AI-powered Rust programming academy on Stellar.

## Modules (planned)

- `auth` — JWT auth for learners and tutors
- `users` — Learner/tutor profiles
- `courses` — Learning academy courses and lessons
- `tasks` — Coding tasks and submissions
- `rewards` — XLM learn-to-earn rewards
- `ai-mentor` — Claude-powered AI mentor
- `social` — Community feed
- `chat` — Real-time messaging
- `stellar` — Stellar/Soroban integration
- `supabase` — Database client integration

## Setup

```bash
pnpm install
pnpm --filter @rustacademy/backend-academy dev
```

With Postgres available at `DATABASE_URL`, initialize the local schema with:

```bash
pnpm --filter @rustacademy/backend-academy db:migrate
pnpm --filter @rustacademy/backend-academy db:seed
```

Use `pnpm --filter @rustacademy/backend-academy db:reset` to drop and recreate the local tables.

## Scripts

- `pnpm dev` — start in watch mode
- `pnpm build` — production build
- `pnpm test` — run unit tests
- `pnpm test:e2e` — run e2e tests
- `pnpm db:migrate` — apply database migrations
- `pnpm db:seed` — apply idempotent seed data
- `pnpm db:reset` — reset and migrate the local database

## Sandbox and Stellar configuration

The Rust runner requires a reachable Docker Engine and the configured Rust image
(`RUSTACADEMY_SANDBOX_IMAGE`, default `rust:1.86-slim`). Each run has network
access disabled and is bounded by container CPU, memory, PID, wall-time, and
output limits. Keep Docker Engine access restricted to this service.

Set `STELLAR_NETWORK` to `testnet` (default) or `mainnet`. Configure
`REWARD_POOL_SECRET` only in a secret store; it is never returned by the API.
Wallet endpoints are `GET /api/stellar/accounts/:publicKey` and
`GET /api/stellar/accounts/:publicKey/history?limit=20&cursor=...`.

For cross-instance submission controls, configure `REDIS_REST_URL` and
`REDIS_REST_TOKEN` for a Redis-compatible REST endpoint. Without them, limits
are process-local and reset when the service restarts. Tune
`SUBMISSION_RATE_LIMIT` (default 5), `SUBMISSION_RATE_WINDOW_SECONDS` (default
60), and `SUBMISSION_DUPLICATE_WINDOW_SECONDS` (default 30) as needed.
