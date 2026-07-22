
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

### Contract Event Ingestion

The backend ingests real-time events from the Folder contract via Horizon API. All events follow standardized schemas with:

- **Stable event type IDs** (`event_type_id`) for routing
- **Domain-based topic namespaces** (`TOPIC_ADMIN`, `TOPIC_ESCROW`, etc.) for filtering
- **Mandatory replay fields** (`ledger_sequence`, `timestamp`, `schema_version`) for deduplication

For complete event schemas, stable IDs, and indexer integration guides, see:
- [Contract Event Reference](docs/CONTRACT_EVENTS.md) — Comprehensive event catalog
- [Contract README](../contract/README.md#events) — Event overview

---

## Environment Variables

```env
DATABASE_URL=

REDIS_URL=

JWT_SECRET=

ANTHROPIC_API_KEY=

STELLAR_NETWORK=testnet

STELLAR_HORIZON_URL=
STELLAR_RPC_URL=

REWARD_POOL_SECRET_KEY=
```

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