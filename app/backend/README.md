
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