
# 🚀 RustAcademy API

> Backend powering RustAcademy.

---

## Overview

The API manages:

* Authentication
* Course management
* Task grading
* Reward distribution
* Community interactions
* AI mentor integration
* Wallet operations

---

## Features

### Authentication

* JWT Authentication
* Wallet Authentication
* Role-based Access Control

### Learning Engine

* Course CRUD
* Lesson Management
* Task Management
* Submission Processing

### AI Services

* Claude Integration
* Code Review
* Grading Engine
* Hint Generation

### Blockchain Services

* Stellar SDK
* Soroban Contracts
* Reward Distribution
* NFT Certificates

### Community

* Feed
* Comments
* Messaging
* Notifications

---

## Tech Stack

* NestJS
* TypeScript
* PostgreSQL
* Supabase client (@supabase/supabase-js)
* Redis
* Custom Job Queue (JobRepository, JobRegistry, etc.)
* Stellar SDK
* Anthropic Claude API

---

## Supabase Error Handling

All Supabase interactions are routed through `SupabaseService.handleError()`, which classifies raw PostgREST / PostgreSQL errors into typed exceptions before they propagate. This keeps error-handling logic in one place and lets callers use `instanceof` checks rather than inspecting raw error codes.

### Error classes (`supabase.errors.ts`)

| Class | Code constant | When thrown |
|---|---|---|
| `SupabaseUniqueConstraintError` | `23505` | Duplicate key / unique index violation |
| `SupabaseTimeoutError` | `TIMEOUT` | PG `57014` (statement_timeout), PostgREST `PGRST504`, or message containing "timeout" / "timed out" |
| `SupabaseAuthError` | `AUTH_ERROR` | PostgREST `PGRST301` / `PGRST302` (JWT expired / invalid), Supabase Auth codes `invalid_grant`, `invalid_token`, `token_expired`, or message containing "jwt" / "unauthorized" / "forbidden" |
| `SupabaseSerializationError` | `SERIALIZATION_ERROR` | PG `40001` (serialization_failure) or `40P01` (deadlock_detected) — safe to retry |
| `SupabaseNetworkError` | `NETWORK_ERROR` | Message containing "fetch" / "network" / "econnrefused" / "enotfound" / "connection refused" |
| `SupabaseError` | _(original code)_ | Any unclassified error — catch-all fallback |

All classes extend `SupabaseError`, so `catch (err) { if (err instanceof SupabaseError) ... }` covers every case.

### Retry guidance

`SupabaseSerializationError` and `SupabaseTimeoutError` are **transient** — the operation can be retried safely with exponential back-off. The reconciliation service already skips affected records and defers them to the next scheduled run instead of marking them irreconcilable.

`SupabaseAuthError` is a **configuration error** — retrying without fixing the credentials will not help. The reconciliation service aborts the affected batch and logs at `ERROR` level.

```typescript
import {
  SupabaseAuthError,
  SupabaseSerializationError,
  SupabaseTimeoutError,
  SupabaseUniqueConstraintError,
} from './supabase/supabase.errors';

try {
  await supabaseService.insertUsername(name, key);
} catch (err) {
  if (err instanceof SupabaseUniqueConstraintError) { /* conflict */ }
  if (err instanceof SupabaseTimeoutError)          { /* retry */    }
  if (err instanceof SupabaseSerializationError)    { /* retry */    }
  if (err instanceof SupabaseAuthError)             { /* alert */    }
  throw err; // re-raise anything else
}
```

---

## Request Correlation & Distributed Tracing

Every inbound HTTP request receives a unique **correlation ID** (`x-request-id`). This ID is automatically propagated across all layers:

| Layer | How it works |
|---|---|
| **HTTP middleware** | `CorrelationIdMiddleware` extracts or generates a UUID and sets it on the request, response headers, and `AsyncLocalStorage` context. |
| **Logging** | `LoggingInterceptor` and `MetricsInterceptor` emit structured JSON logs containing `correlationId`. |
| **Metrics** | Prometheus histograms/counters include the correlation ID in log output for Grafana correlation. |
| **Job queue** | `JobQueueService.enqueue()` captures the caller's correlation ID and persists it in the `jobs` table. `JobExecutor` restores it into `AsyncLocalStorage` when the job runs. |
| **Error responses** | `GlobalHttpExceptionFilter` includes `request_id` / `correlationId` in every error envelope. |
| **External calls** | `@TraceExternalCall` decorator reads the correlation ID from `AsyncLocalStorage` for downstream call tracing. |

### Tracing a request end-to-end

1. **Client sends HTTP request** with `x-request-id: <uuid>` (optional — generated if absent).
2. **Middleware** stores the ID in `AsyncLocalStorage` and sets response headers.
3. **Interceptors** log structured JSON with the correlation ID on every request.
4. **If a background job is enqueued**, the correlation ID is stored in the `jobs.correlation_id` column.
5. **When the job executor picks up the job**, it restores the original correlation ID into `AsyncLocalStorage`, so all downstream service calls (DB, external APIs) carry the same ID.
6. **To trace a full request lifecycle**, grep logs for the correlation ID:
   ```bash
   # Find all log entries for a specific request
   grep 'correlationId.*abc-123-...' logs/combined.log
   ```

### Correlation ID headers

| Header | Direction | Purpose |
|---|---|---|
| `x-request-id` | Request → Response | Canonical correlation identifier |
| `x-correlation-id` | Request → Response | Legacy alias (backward compatible) |

Both headers are set on every response so clients can correlate responses to requests.

---

## Architecture

```text
Frontend
   ↓
NestJS API
   ↓
Services Layer
   ↓
PostgreSQL / Supabase
Redis
Custom Job Queue
Stellar
Claude
```

---

## Environment Variables

All environment variables are validated at startup by `src/config/env.schema.ts` (Joi). If a required variable is missing or invalid, the process throws and refuses to start — the thrown message names the offending key.

### Fail-fast startup validation

Startup runs the following checks in order and aborts **before the HTTP server binds** if any of them fail:

1. **Environment schema validation** — `validateEnv()` (`src/config/env.schema.ts`) validates `process.env` against the Joi schema and throws a single error listing *every* missing or invalid variable, with instructions to fix them. It runs both when `AppModule` is evaluated (`src/app.module.ts`) and again at the top of `bootstrap()` (`src/main.ts`), before the Nest application is created.
2. **Network resolution** — `resolveNetworkSnapshot()` (`src/config/network.config.ts`) resolves the active Stellar network and its endpoints. It rejects conflicting `NETWORK`/`STELLAR_NETWORK` values and malformed `HORIZON_URL`, `SOROBAN_RPC_URL`, `SOROBAN_RPC_URLS`, or `STELLAR_EXPLORER_URL` overrides, naming the offending variable and the fix.
3. **Dependency validation** — `AppConfigService.validate()` (`src/config/app-config.service.ts`) checks the *loaded, typed* configuration for cross-field problems (e.g. `INGESTION_ENABLED` without `RustAcademy_CONTRACT_ID`) before the HTTP server binds.

All failures are logged with secrets redacted (`sanitizeErrorMessage`) and include the offending variable name plus what to do about it. Warnings — e.g. `STELLAR_SECRET_KEY` set without `STELLAR_PUBLIC_KEY`, or production with no CORS origins — are logged but do not block startup.

> **Heads up:** this section previously listed `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `ANTHROPIC_API_KEY`, `STELLAR_HORIZON_URL`, `STELLAR_RPC_URL`, and `REWARD_POOL_SECRET_KEY`. None of these are read anywhere in `src/` — they aren't in `env.schema.ts` and setting them has no effect. The table below only lists variables the schema actually validates.

### Required

Only three variables are required to boot — everything else has a working default.

```env
NETWORK=testnet
SUPABASE_URL=
SUPABASE_ANON_KEY=
```

### Feature flags, contract ingestion, and rate limiting

The environment variables below control runtime behavior that isn't obvious from their names alone. See the dedicated sections later in this document for how each feature behaves during startup and request handling.

- **Feature flags** → `FEATURE_FLAGS_CACHE_TTL_MS`, `FEATURE_FLAGS_BOOTSTRAP_JSON`
- **Contract ingestion** → `INGESTION_ENABLED`, `RustAcademy_CONTRACT_ID`
- **Rate limiting** → `RATE_LIMIT_*`, `RATE_LIMIT_KEY_ORDER`, `API_KEYS`

### Everything else

The remaining ~50 optional variables (Stellar/Soroban RPC tuning, Sentry, SendGrid, export delivery, staging-only shadow traffic, etc.) are documented inline in `src/config/env.schema.ts`, next to each `Joi` key's `.description()`. That file is the single source of truth the app validates against at boot — read it directly rather than trusting a second copy here, which is exactly how this section went stale last time.

### CORS Configuration

In production (`NODE_ENV=production`), CORS is enforced by the origin allow list:

| Variable | Description |
|---|---|
| `CORS_ALLOWED_ORIGINS` | Comma-separated list of exact origin URLs to allow (e.g. `https:// RustAcademy.to,https://app. RustAcademy.to`). **Required in production** unless only Vercel preview URLs are needed. |
| `CORS_VERCEL_PROJECT` | Vercel project slug (e.g. ` RustAcademy-frontend`). When set, preview URLs matching `https://<slug>-<hash>.vercel.app` are allowed. |

#### Vercel Preview URL Validation

When `CORS_VERCEL_PROJECT` is set, the following URL formats are allowed in production:

- `https://<project>-<hash>.vercel.app` (hash only)
- `https://<project>-<hash>-<team>.vercel.app` (hash + team slug)
- `https://<project>-<hash>-<team>-<segment>.vercel.app` (multiple segments)

The `<hash>` segment may contain uppercase and lowercase alphanumeric characters (`A-Za-z0-9`). Special characters in the project slug (e.g., dots, underscores) are properly escaped so they are matched literally.

URLs with a different project name, missing hash segment, or non-Vercel domains are blocked. Spoofed project names in subdomains (e.g., `https://evil-project-<hash>.vercel.app`) are also rejected.

In non-production environments all origins are permitted for development convenience.

**Note:** Setting `CORS_ALLOWED_ORIGINS` to an empty value in production will cause a validation warning, as this blocks all cross-origin requests.

---

## Feature flags

Feature flags are loaded from the configured feature flag store and cached for the duration specified by `FEATURE_FLAGS_CACHE_TTL_MS`.

If the feature flag store is unavailable, the service falls back to `FEATURE_FLAGS_BOOTSTRAP_JSON`. If no bootstrap JSON is provided, or the value cannot be parsed, the built-in default flags are used instead.

`FEATURE_FLAGS_BOOTSTRAP_JSON` is intended as a startup fallback, not the primary source of feature flag configuration.

## Contract ingestion

Stellar contract event ingestion is disabled by default. It is controlled by two variables:

- `INGESTION_ENABLED` — master safety switch, defaults to `false`. Ingestion never starts automatically unless this is explicitly set to `true`.
- `RustAcademy_CONTRACT_ID` — the Soroban contract ID to stream events from.

If `INGESTION_ENABLED` is `true` and `RustAcademy_CONTRACT_ID` is not set, environment validation fails and the application will not start.

If both are set, the configured contract ID is validated on startup against the active entry in the contract registry. Ingestion will not start if the configured ID does not match the registry's active contract for the network.

Whether ingestion starts as a single stream or a dual-read (reading both a current and a previous contract during a migration) is determined by the contract registry entry itself, not by an environment variable. A dual-read starts automatically when the active registry entry has a `previousContractId` set.


## Rate limiting

Rate limits are applied per request based on a resolved group: `public`, `authenticated`, or `webhooks`.

Group resolution, in order:

1. An explicit `@RateLimitGroupTag(...)` decorator on the route, if present.
2. Requests to a `/webhooks` path are placed in the `webhooks` group.
3. Requests carrying a resolvable user ID or API key are placed in the `authenticated` group.
4. Everything else falls into the `public` group.

Each group has independent burst and sustained limits, configurable via environment variables (for example `RATE_LIMIT_AUTHENTICATED_BURST_LIMIT`, `RATE_LIMIT_AUTHENTICATED_SUSTAINED_LIMIT`). If unset, each limit falls back to a built-in default.

The identity used to track a client's usage against these limits is resolved in the order set by `RATE_LIMIT_KEY_ORDER` (default `user_id,api_key,ip`) — the first available identity type in that order is used.

Note: the `API_KEYS` environment variable does not affect rate limits. It is unrelated to this system — see the note in `env.schema.ts` for details.

## Health & Dependency-Aware Readiness Endpoints

The API exposes three health reporting endpoints:

| Endpoint | Method | Purpose | Response |
|---|---|---|---|
| `/health` | `GET` | Shallow liveness check for Kubernetes/container probes. | `200 OK` `{ status: "ok", version, uptime }` |
| `/ready` | `GET` | Dependency-aware readiness check evaluating database (Supabase), environment variables, schema migrations, job queue, Horizon, Soroban RPC, and ingestion stream lag in a single contract. | `200 OK` (when all critical dependencies are UP) or `503 Service Unavailable` (when any critical dependency is DOWN) |
| `/status` | `GET` | Public status endpoint with ETag and Cache-Control headers (no sensitive credentials exposed). | `200 OK` `{ status: "operational", network, components: [...] }` |

### Readiness Contract (`/ready`) Check Breakdown

Operators can inspect readiness without cross-checking multiple endpoints:
- `supabase`: Database ping & connection pool health (`status`, `latency`, `lastSuccess`, `error`).
- `environment`: Critical environment configuration validation.
- `migrations`: Access to database schema migrations tracking table.
- `queue`: Custom job queue repository query & execution health.
- `horizon`: Stellar Horizon node connectivity.
- `soroban_rpc`: Soroban RPC node network passphrase & ledger query.
- `ingestion`: Stream cursor ingestion lag in seconds.

---

## Run Locally

```bash
pnpm install

pnpm dev
```

Runs on:

```bash
http://localhost:4000
```

---

## Database Modules

### Users

* Learners
* Tutors
* Admins

### Courses

* Courses
* Lessons
* Tasks

### Learning

* Enrollments
* Progress
* Submissions

### Community

* Posts
* Comments
* Messages

### Blockchain

* Rewards
* Badges
* Certificates

---

## Queue Workers

Custom Job Queue Workers:

```text
submission-grading
reward-distribution
certificate-minting
badge-minting
notification-delivery
```

---

## Testing

```bash
pnpm test

pnpm test:unit
pnpm test:e2e
```

---