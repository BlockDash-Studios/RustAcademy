# BackendAcademy

NestJS backend API for RustAcademy — the decentralized, AI-powered Rust programming academy on Stellar.

## Modules (planned)

- `auth` — JWT auth for learners and tutors
- `users` — Learner/tutor profiles
- `courses` — Learning academy courses and lessons
- `tasks` — Coding tasks and submissions
- `grading` — AI pre-score → tutor review submission pipeline (BE-037)
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

## Grading pipeline (BE-037)

Implements the README's reward flow — AI grader scores a submission off-chain,
a tutor confirms or overrides that score, and the final score triggers rewards.
Routes are under `api/v1/grading`:

| Method | Path | Purpose |
| ------ | ---- | ------- |
| `POST` | `/submissions` | Accept a learner submission and open its audit trail |
| `POST` | `/submissions/:id/ai-pre-score` | Stage 1 — run the Claude grader (score + feedback) |
| `POST` | `/submissions/:id/review` | Stage 2 — tutor `confirm`s or `override`s the pre-score |
| `GET`  | `/submissions/:id` | Submission with its AI pre-score and tutor review |
| `GET`  | `/submissions/:id/history` | Append-only status-transition audit trail |
| `GET`  | `/queue` | AI pre-scored submissions awaiting tutor review |

Statuses move `submitted → ai_graded → tutor_confirmed | tutor_overridden`, and
every move is appended to the submission's transition log. A `tutor_review`
transition records the reviewing tutor as its actor, and an override must carry
both a replacement score and a reason. A final score at or above the pass
threshold publishes a `task.passed` event so the existing XP/reward pipeline
fires; the on-chain `reward_pool` payout is downstream of that event.

## Scripts

- `pnpm dev` — start in watch mode
- `pnpm build` — production build
- `pnpm test` — run unit tests
- `pnpm test:e2e` — run e2e tests
- `pnpm db:migrate` — apply database migrations
- `pnpm db:seed` — apply idempotent seed data
- `pnpm db:reset` — reset and migrate the local database
