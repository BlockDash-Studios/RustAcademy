# BackendAcademy

RustAcademy backend module — NestJS backend implementation.

## Getting Started

```bash
pnpm install
pnpm start:dev
```

The server starts on `http://localhost:3000` by default (configurable via `PORT`).

## Environment Variables

The following environment variables are validated at startup. Copy `.env.example` (or set them in your deployment config) and customize as needed.

| Variable               | Required (prod)           | Default (dev/test)                       | Description                                                                                                                    |
| ---------------------- | ------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `NODE_ENV`             | No                        | `development`                            | Runtime environment (`development`, `production`, `test`)                                                                      |
| `PORT`                 | No                        | `3000`                                   | Server port                                                                                                                    |
| `CORS_ORIGIN`          | No                        | `*`                                      | Allowed CORS origin(s): `*` or a comma-separated list                                                                          |
| `DATABASE_URL`         | **Yes**                   | `postgresql://…/rustacademy_development` | Database connection string. Mandatory in production — the service refuses to boot without persistence configured               |
| `REDIS_HOST`           | **Yes**                   | `localhost`                              | Redis host for caching and background jobs. Mandatory in production                                                            |
| `REDIS_PORT`           | No                        | `6379`                                   | Redis port                                                                                                                     |
| `REDIS_PASSWORD`       | No                        | —                                        | Optional Redis password                                                                                                        |
| `JWT_SECRET`           | **Yes**                   | `development`-only insecure value        | Secret key for JWT signing. Required in production and must be ≥ 32 chars; the shipped example/development values are rejected |
| `ASSET_SIGNING_SECRET` | **Yes**                   | `development`-only insecure value        | HMAC secret for signed asset URLs. Required in production; an empty secret makes signed URLs forgeable                         |
| `AI_PROVIDER`          | No                        | `mock`                                   | AI provider (`claude`, `openai`, `mock`)                                                                                       |
| `ANTHROPIC_API_KEY`    | When `AI_PROVIDER=claude` | —                                        | Anthropic API key                                                                                                              |
| `OPENAI_API_KEY`       | When `AI_PROVIDER=openai` | —                                        | OpenAI API key                                                                                                                 |
| `AI_MODEL`             | No                        | —                                        | AI model override                                                                                                              |
| `AI_MAX_TOKENS`        | No                        | `4096`                                   | Max tokens for AI requests                                                                                                     |
| `AI_TEMPERATURE`       | No                        | `0.7`                                    | Temperature for AI responses                                                                                                   |
| `LOCALE`               | No                        | `en`                                     | Localization locale (currently `en` supported)                                                                                 |
| `ASSETS_UPLOAD_DIR`    | No                        | `./data/uploads`                         | Directory where uploaded assets are persisted                                                                                  |
| `ASSETS_STATIC_DIR`    | No                        | `./public`                               | Read-only static asset directory served at `/static`                                                                           |
| `ASSETS_BASE_URL`      | No                        | `/api/v1/assets`                         | Base URL advertised inside asset metadata                                                                                      |
| `ASSETS_MAX_SIZE_MB`   | No                        | `10`                                     | Maximum size of a single uploaded asset (MB)                                                                                   |
| `ASSETS_MAX_TOTAL_MB`  | No                        | `1024`                                   | Aggregate byte quota across all stored assets (MB)                                                                             |
| `ASSETS_MAX_COUNT`     | No                        | `10000`                                  | Maximum number of assets retained by the registry                                                                              |

> **Production note:** when `NODE_ENV=production`, startup validation rejects missing
> `DATABASE_URL`, `REDIS_HOST`, `JWT_SECRET` and `ASSET_SIGNING_SECRET`, low-entropy
> secrets, and placeholder values copied from `.env.example`. Development and test
> environments keep explicit (non-production) defaults so local boots stay simple.
> Validation errors never include secret values.

## Cron Scheduling

Background jobs are configured via cron expressions in the standard 5-field format:

```
minute hour day-of-month month day-of-week
```

### Schedule Configuration

| Variable                      | Default        | Description                    |
| ----------------------------- | -------------- | ------------------------------ |
| `CRON_CLEANUP_SCHEDULE`       | `0 0 * * *`    | Daily cleanup at midnight      |
| `CRON_ANALYTICS_SCHEDULE`     | `0 */6 * * *`  | Analytics every 6 hours        |
| `CRON_NOTIFICATIONS_SCHEDULE` | `*/30 * * * *` | Notifications every 30 minutes |

### Cron Expression Reference

| Expression    | Meaning                               |
| ------------- | ------------------------------------- |
| `* * * * *`   | Every minute                          |
| `*/5 * * * *` | Every 5 minutes                       |
| `0 * * * *`   | Every hour at minute 0                |
| `0 0 * * *`   | At midnight daily                     |
| `0 0 * * 0`   | At midnight every Sunday              |
| `0 9 * * 1-5` | At 9 AM, Monday–Friday                |
| `0 0 1 * *`   | At midnight on the 1st of every month |

### Field Ranges

| Field        | Allowed Values           |
| ------------ | ------------------------ |
| Minute       | `0–59`                   |
| Hour         | `0–23`                   |
| Day of Month | `1–31`                   |
| Month        | `1–12`                   |
| Day of Week  | `0–7` (0 or 7 is Sunday) |

Invalid cron expressions are caught at startup and logged as errors. Use the `/api/jobs/schedules` endpoint to view all configured schedules and their next run times.

## Localization

The backend ships with a localization service (`I18nModule`) that provides translated strings for admin and learner flows.

- **Default locale:** `en`
- **Configurable via:** `LOCALE` environment variable
- **Available locales:** `en`

The `LocalizationService` is global and injectable. Use `l10n.t('key')` to retrieve localized strings in any service/controller.

### Adding a new locale

Add a new entry to the `STRINGS` map in `src/i18n/localization.service.ts` with all required keys.

## Structure

- `src/` — Application source code (NestJS modules, controllers, services)
- `src/config/` — Configuration and environment validation
- `src/database/` — Database module, migration service with preflight validation and rollback
- `src/i18n/` — Localization module
- `src/jobs/` — Background job scheduling with cron validation and notification batching
- `src/monitoring/` — Metrics and observability
- `src/notifications/` — Notification delivery with provider abstraction (email, push, in-app) and batching
- `test/` — Test files

## Validation

- Environment variables are validated at startup using `src/config/env.schema.ts`.
- Localization fallback and translation key validation are covered by unit tests and CI via `pnpm test`.

See `app/backend/` for the primary backend implementation and conventions.

## Database Migrations (#398)

The `MigrationService` provides preflight validation and rollback awareness for database migrations:

### Migration Scripts

| Script                     | Description                                     |
| -------------------------- | ----------------------------------------------- |
| `pnpm migration:preflight` | Run preflight checks before applying migrations |
| `pnpm migration:rollback`  | Roll back the most recent migration             |
| `pnpm migration:history`   | View migration history                          |
| `pnpm migration:dry-run`   | Simulate a rollback without executing           |

### Preflight Validation

The migration service performs these checks before applying changes:

1. **Database Connectivity** — Verifies the database is reachable
2. **Schema State** — Inspects current schema for compatibility
3. **Pending Migrations** — Lists migrations waiting to be applied
4. **Environment Configuration** — Validates environment variables
5. **Destructive Migration Risk** — Detects potentially destructive operations

### Rollback Plan

Each preflight check generates a rollback plan describing the steps needed to revert the most recent migrations. Destructive migrations (DROP, TRUNCATE) are flagged as non-reversible.

## Notification Providers (#388)

Notifications are delivered through a centralized provider interface (`INotificationProvider`), supporting multiple channels:

| Provider | ID       | Description                                                 |
| -------- | -------- | ----------------------------------------------------------- |
| Email    | `email`  | Sends notifications via email with template personalization |
| Push     | `push`   | Delivers push notifications to user devices                 |
| In-App   | `in-app` | Stores notifications in the user's in-app feed              |

Configure enabled providers via `NOTIFICATION_PROVIDERS` (comma-separated: `email,push,in-app`).

## Email Template Fallbacks (#387)

Email templates use `{{placeholder}}` syntax for personalization. When user data is incomplete,
missing fields are replaced with sensible defaults so content never renders blank:

| Placeholder           | Fallback                        |
| --------------------- | ------------------------------- |
| `{{name}}`            | "RustAcademy Learner"           |
| `{{courseName}}`      | "your course"                   |
| `{{milestoneName}}`   | "a new milestone"               |
| `{{submissionTitle}}` | "your submission"               |
| Any unrecognized key  | `[key]` (safe bracket notation) |

## Notification Batching (#386)

Low-priority reminders (streak nudges, course suggestions) can be grouped into batches
to reduce noise and improve delivery efficiency:

| Variable                       | Default | Description                       |
| ------------------------------ | ------- | --------------------------------- |
| `NOTIFICATION_BATCH_ENABLED`   | `false` | Enable batching                   |
| `NOTIFICATION_BATCH_MAX_SIZE`  | `10`    | Max notifications per batch       |
| `NOTIFICATION_BATCH_WINDOW_MS` | `30000` | Auto-flush window in milliseconds |

---

# Backend Guide for shadcn/ui

When integrating a frontend built with **shadcn/ui**, backend endpoints should provide consistent and predictable JSON responses to simplify component integration.

## Success Response

```json
{
  "success": true,
  "data": {},
  "message": "Request completed successfully"
}
```

## Error Response

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request",
    "fields": {
      "email": "Email is required"
    }
  }
}
```

## Recommendations

- Return consistent response structures.
- Use proper HTTP status codes.
- Include field-level validation errors.
- Support pagination for table components.
- Keep payloads predictable for frontend consumers.
- Avoid exposing internal implementation details.

## Example Table Response

```json
{
  "success": true,
  "data": {
    "items": [],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 0
    }
  }
}
```

## Example Select Response

```json
{
  "success": true,
  "data": [
    {
      "label": "Admin",
      "value": "admin"
    },
    {
      "label": "User",
      "value": "user"
    }
  ]
}
```
