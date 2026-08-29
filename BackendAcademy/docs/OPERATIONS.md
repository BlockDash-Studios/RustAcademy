# BackendAcademy — Operational Documentation & Runbooks

> **BA-125** — This document fulfils the operational documentation requirement.  
> It covers setup, module wiring, required services, environment variables,
> deployment, rollback, data recovery, and incident-response procedures.

---

## Table of Contents

1. [Service Overview](#1-service-overview)
2. [Required Infrastructure](#2-required-infrastructure)
3. [Environment Variables](#3-environment-variables)
4. [Module Wiring](#4-module-wiring)
5. [Local Development Setup](#5-local-development-setup)
6. [Deployment Guide](#6-deployment-guide)
7. [Running Database Migrations](#7-running-database-migrations)
8. [CI/CD Gates](#8-cicd-gates)
9. [Rollback Runbook](#9-rollback-runbook)
10. [Data Recovery Runbook](#10-data-recovery-runbook)
11. [Incident Response Runbook](#11-incident-response-runbook)
12. [Troubleshooting Guide](#12-troubleshooting-guide)
13. [Health Checks & Monitoring](#13-health-checks--monitoring)
14. [Secrets Management](#14-secrets-management)

---

## 1. Service Overview

**BackendAcademy** is the NestJS API server powering RustAcademy.  
It provides:

- REST API for courses, lessons, tasks, submissions, users, and rewards
- AI Mentor integration (Claude / OpenAI / mock)
- Notification delivery (email, push, in-app) with circuit-breaker resilience
- Social feed with ownership and moderation enforcement
- Background job queue for grading and certificate minting
- Stellar / Soroban smart-contract integration for on-chain rewards

**Default port:** `3000` (configurable via `PORT`).  
**Health endpoint:** `GET /health`

---

## 2. Required Infrastructure

| Service       | Purpose                                    | Required in prod? |
|---------------|--------------------------------------------|:-----------------:|
| PostgreSQL 15+ | Primary datastore for all application data | **Yes**           |
| Redis 7+      | Pub/sub, job queue, rate-limiting cache     | **Yes**           |
| Anthropic Claude API (optional) | AI Mentor chat and grading | No (mock fallback) |
| OpenAI API (optional)           | AI Mentor alternative        | No (mock fallback) |
| Stellar Horizon                 | Blockchain account/payment lookups | No (stubbed) |
| SMTP / SendGrid / SES           | Email delivery                     | No (logged only in dev) |
| FCM / APNs                      | Push notifications                  | No (logged only in dev) |

---

## 3. Environment Variables

Copy `.env.example` as a starting point:

```bash
cp .env.example .env
```

### 3.1 Required in Production

| Variable              | Description                                       | Constraints                                  |
|-----------------------|---------------------------------------------------|----------------------------------------------|
| `DATABASE_URL`        | PostgreSQL connection string                      | Full URL including user/password/db name     |
| `REDIS_HOST`          | Redis hostname or IP                              | Must be reachable from the app container     |
| `JWT_SECRET`          | JWT signing secret                                | ≥ 32 chars; must not be a placeholder value  |
| `ASSET_SIGNING_SECRET`| HMAC secret for signed asset download URLs        | Must not be empty; empty = forgeable URLs    |

### 3.2 Optional / Provider-specific

| Variable               | Default      | Description                                       |
|------------------------|--------------|---------------------------------------------------|
| `PORT`                 | `3000`       | HTTP port the server listens on                   |
| `NODE_ENV`             | `development`| Runtime mode: `development`, `production`, `test` |
| `CORS_ORIGIN`          | `*`          | Allowed CORS origins (comma-separated or `*`)     |
| `REDIS_PORT`           | `6379`       | Redis port                                        |
| `REDIS_PASSWORD`       | —            | Redis auth password (if required)                 |
| `JWT_CLOCK_SKEW_SECONDS` | `30`       | Allowed JWT clock drift in seconds (0–120)        |
| `API_KEY_SECRET`       | —            | Shared secret for API-key authentication          |
| `AI_PROVIDER`          | `mock`       | `claude` | `openai` | `mock`                     |
| `ANTHROPIC_API_KEY`    | —            | Required when `AI_PROVIDER=claude`                |
| `OPENAI_API_KEY`       | —            | Required when `AI_PROVIDER=openai`                |
| `AI_MODEL`             | —            | Override the default AI model                     |
| `AI_MAX_TOKENS`        | `4096`       | Token budget per AI response                      |
| `AI_TEMPERATURE`       | `0.7`        | Sampling temperature for AI responses             |
| `AI_RETRY_MAX_ATTEMPTS`| `3`          | AI provider retry attempts (429/5xx)              |
| `AI_RETRY_BASE_DELAY_MS`| `250`       | Base back-off delay in milliseconds               |
| `AI_RETRY_MAX_DELAY_MS`| `5000`       | Maximum back-off delay in milliseconds            |
| `ASSETS_UPLOAD_DIR`    | `./data/uploads` | Where uploaded assets are stored on disk     |
| `ASSETS_STATIC_DIR`    | `./public`   | Read-only static asset directory                  |
| `ASSETS_BASE_URL`      | `/api/v1/assets` | Base URL in asset metadata responses         |
| `ASSETS_MAX_SIZE_MB`   | `10`         | Per-file upload size limit (MB)                   |
| `ASSETS_MAX_TOTAL_MB`  | `1024`       | Aggregate asset storage quota (MB)                |
| `ASSETS_MAX_COUNT`     | `10000`      | Maximum number of stored assets                   |
| `LOCALE`               | `en`         | Localization locale                               |
| `CRON_CLEANUP_SCHEDULE`| `0 0 * * *` | Daily cleanup cron (midnight UTC)                 |
| `CRON_ANALYTICS_SCHEDULE`| `0 */6 * * *` | Analytics aggregation every 6 hours          |
| `CRON_NOTIFICATIONS_SCHEDULE`| `*/30 * * * *` | Notification batch flush every 30 min  |

> **Production startup guardrails:** When `NODE_ENV=production`, the app
> refuses to boot if `DATABASE_URL`, `REDIS_HOST`, `JWT_SECRET`, or
> `ASSET_SIGNING_SECRET` are missing, empty, or set to placeholder values
> from `.env.example`. This prevents silent misconfiguration in production.

---

## 4. Module Wiring

The application entry-point is `src/main.ts`. All NestJS modules are registered in `src/app.module.ts`.

| Module                | Key providers                                      | Notes                                    |
|-----------------------|----------------------------------------------------|------------------------------------------|
| `ConfigModule`        | `ConfigService`, env validation via `Joi`          | Global; validates all env vars at startup |
| `DatabaseModule`      | `DatabaseService`, `MigrationService`              | Wraps `@supabase/supabase-js` client     |
| `AuthModule`          | `AuthSessionService`, JWT guards, decorators       | JWT + API-key auth                        |
| `UsersModule`         | `UsersService`, `UserProfileService`               |                                          |
| `CoursesModule`       | `CourseService`, `CertificateService`, `CourseRatingService` | Progress tracking          |
| `LessonsModule`       | `LessonService`                                    |                                          |
| `TasksModule`         | `TaskService`, `TaskOrchestratorService`           |                                          |
| `SubmissionsModule`   | `SubmissionService`, `TutorReviewService`          | Grading pipeline                         |
| `JobsModule`          | `JobsService`, `GradingJobService`                 | In-memory job queue                      |
| `DeadLetterQueueModule` | `DlqService`, `GradingRetryPolicy`               |                                          |
| `AiModule`            | `AiService`, `PromptTemplateService`, `ClaudeProvider` | Pluggable AI backend              |
| `NotificationsModule` | `NotificationsService`, `EmailNotificationProvider`, `PushNotificationProvider`, `InAppNotificationProvider` | Resilient delivery |
| `SocialModule`        | `SocialService`                                    | Post ownership + moderation enforcement  |
| `ChatModule`          | `ChatService`, rate limiting                       |                                          |
| `RewardsModule`       | `RewardsService`, `StreakService`, `ReferralService` | XLM reward logic                    |
| `WalletModule`        | `WalletService`                                    | Stellar wallet ops                       |
| `ContractsModule`     | `ContractsService`, `ContractRegistryService`      | Soroban contract calls                   |
| `BadgesModule`        | `BadgesService`                                    | NFT badge minting                        |
| `SecurityModule`      | `SecurityService`, `AntiCheatService`              |                                          |
| `AdminModule`         | `AdminService`                                     | Admin-only operations                    |
| `MonitoringModule`    | `MetricsService`, `MonitoringService`              | Prometheus metrics                       |
| `RedisModule`         | `RedisService`                                     | Redis client wrapper                     |
| `HealthModule`        | `HealthController`                                 | `GET /health`                            |
| `LoggingModule`       | `CorrelationLoggerService`, `ErrorTrackingService` |                                          |

---

## 5. Local Development Setup

### Prerequisites

- Node.js 20+
- npm 9+ (or pnpm 9+)
- Docker + Docker Compose (for PostgreSQL and Redis)

### Steps

```bash
# 1. Install dependencies
cd BackendAcademy
npm install

# 2. Copy and fill in environment variables
cp .env.example .env
# Edit .env — set DATABASE_URL, REDIS_HOST, JWT_SECRET, etc.

# 3. Start PostgreSQL and Redis via Docker
docker-compose up -d  # from the repo root

# 4. Run database migrations
npx ts-node src/database/migration-cli.ts migrate

# 5. Start the development server (hot reload)
npm run start:dev
# → http://localhost:3000

# 6. Verify the server is healthy
curl http://localhost:3000/health
```

### Running tests locally

```bash
# Unit tests only (fast, no external dependencies)
npm run test:unit

# All tests
npm test

# TypeScript check
npm run typecheck

# Lint
npm run lint
```

---

## 6. Deployment Guide

### 6.1 Docker (recommended)

```bash
# Build the image
docker build -t rustacademy-backend:latest ./BackendAcademy

# Run in production
docker run -d \
  --name rustacademy-backend \
  -p 3000:3000 \
  --env-file /path/to/prod.env \
  rustacademy-backend:latest
```

> The Dockerfile uses a multi-stage build with a non-root `appuser` for least-privilege execution.

### 6.2 Railway / Render

1. Point the service root to `BackendAcademy/`.
2. Set `BUILD_COMMAND` to `npm run build` and `START_COMMAND` to `node dist/main.js`.
3. Add all required environment variables from [Section 3](#3-environment-variables) in the platform dashboard.
4. Enable the health check endpoint at `/health`.

### 6.3 Pre-deployment checklist

- [ ] All required env vars are set (see [Section 3.1](#31-required-in-production))
- [ ] `JWT_SECRET` and `ASSET_SIGNING_SECRET` are ≥ 32 chars and not placeholder values
- [ ] Database migrations have been reviewed and staged (`migration-cli.ts dry-run`)
- [ ] Feature flags for risky changes are set to `false` initially
- [ ] Rollback plan confirmed (see [Section 9](#9-rollback-runbook))
- [ ] Team notified of deployment window
- [ ] Monitoring dashboards open and baselining

---

## 7. Running Database Migrations

BackendAcademy uses a custom migration service (`src/database/migration.service.ts`).

```bash
# Inside BackendAcademy directory (or Docker exec into the container)

# Run all pending migrations (auto-detects by file timestamp)
npx ts-node src/database/migration-cli.ts migrate

# List applied migrations
npx ts-node src/database/migration-cli.ts status

# Rollback the last batch of migrations
npx ts-node src/database/migration-cli.ts rollback

# Rollback a specific number of steps
npx ts-node src/database/migration-cli.ts rollback --steps 2
```

> **Always take a database snapshot before running migrations in production.**
> See [Section 10](#10-data-recovery-runbook) for recovery procedures.

---

## 8. CI/CD Gates

All CI jobs are defined in `.github/workflows/backend-academy.yml`.  
The following gates **must all pass** before a PR can be merged:

| Job                    | Command                    | What it checks                           |
|------------------------|----------------------------|------------------------------------------|
| `typecheck`            | `npm run typecheck`        | TypeScript compiler errors (no emit)     |
| `lint`                 | `npm run lint`             | ESLint rules on `src/**/*.ts`            |
| `unit-tests`           | `npm run test:unit`        | All `*.spec.ts` unit tests               |
| `integration-tests`    | Jest on learner-journey    | Integration + AI provider suites         |
| `build`                | `npm run build`            | NestJS production build (requires typecheck+lint) |

See the workflow file for actionable failure guidance per job.

---

## 9. Rollback Runbook

### Trigger

Deploy produced errors (5xx spike, health check failures, data corruption).

### Procedure

**Step 1 — Assess the blast radius**

```bash
# Check recent error rate from monitoring
curl http://<host>:3000/metrics | grep http_requests_total
# Or check health
curl http://<host>:3000/health
```

**Step 2 — Roll back the application**

*Docker:*
```bash
# Pull and run the previous image tag
docker stop rustacademy-backend
docker run -d \
  --name rustacademy-backend \
  -p 3000:3000 \
  --env-file /path/to/prod.env \
  rustacademy-backend:<previous-tag>
```

*Railway/Render:* Use the platform's **Rollback** or **Redeploy Previous** button in the dashboard.

*Git-based:*
```bash
# In CI: re-trigger the pipeline on the previous good commit
git revert HEAD --no-edit
git push origin main
```

**Step 3 — Roll back database migrations (if needed)**

Only run if the new migration caused the issue:

```bash
# Inside the old container or via db migration CLI
npx ts-node src/database/migration-cli.ts rollback
```

> ⚠️ Only rollback if the migration is reversible. Destructive migrations
> (column drops, data transformations) require manual data recovery.
> See [Section 10](#10-data-recovery-runbook).

**Step 4 — Verify recovery**

```bash
curl http://<host>:3000/health
# Expect: { "status": "ok", ... }
```

**Step 5 — Post-mortem**

After recovery, document in a GitHub issue:
- What failed and when
- Root cause
- Fix and prevention steps

---

## 10. Data Recovery Runbook

### 10.1 Before any migration in production

```bash
# Supabase — create a manual backup via the dashboard
# Or via psql:
pg_dump $DATABASE_URL --format=custom --file=rustacademy_$(date +%Y%m%d_%H%M%S).dump
```

### 10.2 Restore from backup

```bash
# Stop the application to prevent writes during restore
docker stop rustacademy-backend

# Restore
pg_restore --clean --dbname $DATABASE_URL rustacademy_<timestamp>.dump

# Restart
docker start rustacademy-backend
```

### 10.3 Recovering deleted records

The application does not currently implement soft-deletes globally.
If records are accidentally deleted:

1. Stop the application immediately to prevent further writes.
2. Restore from the most recent pre-deletion backup.
3. Use a binary diff (WAL-based) recovery if the PostgreSQL instance has
   point-in-time recovery (PITR) enabled via Supabase.

### 10.4 Redis data loss

Redis is used for ephemeral state (sessions, rate-limit counters, job queues).
Its data is not durably persisted by default.

- **Sessions:** Users will be logged out and need to re-authenticate.
- **Rate-limit counters:** Will reset; clients may temporarily exceed limits.
- **Job queue:** Any in-flight jobs will be lost. Trigger a manual requeue if needed.

**Prevention:** Enable Redis AOF persistence or use a managed Redis with
automatic replication (e.g., Upstash, Redis Cloud).

---

## 11. Incident Response Runbook

### 11.1 Severity levels

| Level | Description                              | Response SLA |
|-------|------------------------------------------|-------------|
| P1    | Full service outage / payment failures   | < 15 min    |
| P2    | Partial outage / degraded AI/rewards     | < 1 hour    |
| P3    | Single feature broken, workaround exists | < 4 hours   |
| P4    | Minor issue / cosmetic bug               | Next sprint  |

### 11.2 Common incidents

#### Service fails to start

**Symptoms:** Container exits immediately; health check never responds.

**Diagnosis:**
```bash
docker logs rustacademy-backend 2>&1 | head -50
```

**Common causes:**
- Missing required env var — look for `ConfigValidationError` in logs.
- Database unreachable — look for `ECONNREFUSED` or `ETIMEDOUT` on `DATABASE_URL`.
- Port already in use — `EADDRINUSE :3000`.

**Fix:**
- Add the missing env var to the deployment config.
- Ensure the database and Redis containers are running and reachable.
- Free the port or change `PORT`.

---

#### High error rate (5xx spike)

**Symptoms:** Monitoring shows elevated `http_requests_total{status="5xx"}`.

**Diagnosis:**
```bash
# Application logs
docker logs rustacademy-backend 2>&1 | grep ERROR | tail -30

# Health breakdown
curl http://<host>:3000/health | jq
```

**Common causes:**
- Database connection pool exhausted → check `DATABASE_URL` connectivity.
- Redis connection lost → check `REDIS_HOST` / `REDIS_PORT`.
- Uncaught exception in a NestJS handler.

**Fix:**
- Restart the service to reset connection pool.
- Check infrastructure for outages.
- If the 5xx is from a specific endpoint, use feature flags or deploy a patch.

---

#### Notification provider circuit open

**Symptoms:** Notifications are silently failing; circuit metrics show `OPEN`.

**Diagnosis:**
```bash
curl http://<host>:3000/health | jq '.providers'
# Look for: { "providerId": "email", "healthy": false }
```

**Fix:**
- Check the external provider (SendGrid, FCM, etc.) status page.
- The circuit will self-recover after 30 seconds of recovery timeout.
- To force reset without a redeploy, restart the container (circuit resets on startup).

---

#### AI provider errors (429 / 5xx)

**Symptoms:** AI Mentor responses fail; learners see error messages.

**Diagnosis:**
```bash
docker logs rustacademy-backend 2>&1 | grep "AI" | tail -20
```

**Fix:**
- Check `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` are valid.
- Check the AI provider's status page for outages.
- Set `AI_PROVIDER=mock` temporarily to fall back to offline responses.
- Adjust `AI_RETRY_MAX_ATTEMPTS` and `AI_RETRY_BASE_DELAY_MS` if rate-limited.

---

#### Database migration failure

**Symptoms:** Migration CLI exits with an error; service may fail to start
if a required table is missing.

**Diagnosis:**
```bash
npx ts-node src/database/migration-cli.ts status
```

**Fix:**
1. Revert the failing migration script.
2. Run `rollback` to undo any partial changes.
3. Fix the migration and redeploy.
4. If data was mutated, see [Section 10.3](#103-recovering-deleted-records).

---

## 12. Troubleshooting Guide

### JWT errors / users getting logged out unexpectedly

- Check `JWT_SECRET` matches between app instances (in multi-instance setups).
- Adjust `JWT_CLOCK_SKEW_SECONDS` if distributed clocks are drifting (`> 30 s`).
- Run `GET /health` to confirm the auth configuration is valid.

### CORS errors in the browser

- Check `CORS_ORIGIN` is set to the frontend origin (e.g., `https://app.rustacademy.xyz`).
- Do not use `*` in production if the frontend sends credentials.

### Signed asset URL 403 errors

- Verify `ASSET_SIGNING_SECRET` matches the value used when the URL was created.
- Check that the URL has not expired (`expiresAt` claim in the query string).

### Jobs not processing

- Check Redis is reachable: `redis-cli -h $REDIS_HOST ping` should return `PONG`.
- Check the dead-letter queue via `GET /api/v1/admin/dlq` (admin auth required).
- Inspect `JobsService` logs for error patterns.

### Metrics not appearing

- Prometheus metrics are exposed at `GET /metrics`.
- The `@willsoto/nestjs-prometheus` library is registered in `MonitoringModule`.
- If metrics return 404, confirm `MonitoringModule` is imported in `AppModule`.

---

## 13. Health Checks & Monitoring

### Health endpoint

```
GET /health
```

Response shape:

```json
{
  "status": "ok",
  "info": {
    "database": { "status": "up" },
    "redis":    { "status": "up" }
  },
  "details": { ... }
}
```

Returns `503 Service Unavailable` if any critical dependency is down.

### Prometheus metrics

```
GET /metrics
```

Key metrics:

| Metric                          | Description                            |
|---------------------------------|----------------------------------------|
| `http_requests_total`           | Request count by method / route / status |
| `http_request_duration_seconds` | Request latency histogram              |
| `notification_delivery_total`   | Notification deliveries by provider    |
| `circuit_breaker_state`         | Circuit state per provider (0=CLOSED, 1=OPEN) |

### Recommended alerts

| Condition                                    | Severity |
|----------------------------------------------|----------|
| `http_requests_total{status="5xx"}` rate > 1% | P2       |
| Health endpoint returns non-200              | P1       |
| Circuit breaker OPEN for > 5 min             | P2       |
| Database connection failures                 | P1       |

---

## 14. Secrets Management

> ⚠️ **Never commit secrets to the repository.**
> All `.env` files are listed in `.gitignore`.

### Rotation procedure

**JWT_SECRET rotation:**

1. Generate a new secret: `openssl rand -hex 32`
2. Deploy the new secret alongside the old one (dual-secret verification period).
3. After all existing tokens expire (default: 24 h), remove the old secret.

**ASSET_SIGNING_SECRET rotation:**

1. Generate a new secret: `openssl rand -hex 32`
2. Deploy with the new secret. Old signed URLs will immediately become invalid.
3. Notify users with active signed URLs to regenerate them.

**AI provider key rotation:**

1. Generate a new key in the Anthropic/OpenAI dashboard.
2. Update `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` in the deployment config.
3. Redeploy. Zero-downtime rolling restart is safe.

### Storage recommendations

- Store production secrets in a dedicated secrets manager
  (AWS Secrets Manager, HashiCorp Vault, Doppler, Railway Env).
- Do **not** store secrets in Git, CI logs, or Slack.
- Rotate secrets if they are accidentally exposed.
