
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