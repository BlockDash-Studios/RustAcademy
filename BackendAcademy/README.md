# BackendAcademy

NestJS backend API for RustAcademy — the decentralized, AI-powered Rust programming academy on Stellar.

## Modules (planned)

- `auth` — JWT auth for learners and tutors
- `users` — Learner/tutor profiles
- `courses` — Learning academy courses and lessons
- `tasks` — Coding tasks and submissions
- `grading` — AI pre-score → tutor review submission pipeline (BE-037)
- `rewards` — XLM learn-to-earn rewards
- `progress` — Per-learner lesson/task progress, XP per course, certificate eligibility
- `certificates` — Certification eligibility checks gating the `certificate_nft` mint (BE-042)
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

## Certification eligibility (BE-042)

Decides whether a learner qualifies for a `certificate_nft` mint. A course
certificate requires every listed task to be graded and every recorded score to
meet the course's minimum (default: the grading pass threshold). The certificate
minting job consults these routes before minting; routes are under
`api/v1/certificates`:

| Method | Path | Purpose |
| ------ | ---- | ------- |
| `POST` | `/courses` | Register the task ids + minimum score a certificate requires |
| `POST` | `/results` | Record a learner's final task score from the grading pipeline |
| `GET`  | `/users/:userId/courses/:courseId/eligibility` | Eligibility verdict for one learner |
| `GET`  | `/courses/:courseId/eligible-learners` | Every learner the job may mint for |

`GET .../eligibility` returns `eligible`, the effective per-task results, and a
`finalScore` (the rounded mean of the task scores) for the mint to record. Only
the learner's best score per task is kept, so a retake can lift a task above the
bar but never lower the certificate.

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
