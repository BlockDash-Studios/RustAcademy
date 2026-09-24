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
