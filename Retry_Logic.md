Grading jobs retry system
=========================

This module provides a DB-backed retry mechanism for failed grading jobs.

How it works
- A `grading_jobs` table stores failed job payloads and metadata (`attempts`, `nextRetryAt`, etc.).
- `GradingJobService` polls the table periodically and replays jobs by calling `GradingResultService.saveResult`.
- Exponential backoff is used between attempts. After `maxAttempts` the job is marked `FAILED`.

Configuration & running
- No external dependencies (Redis) required — the system uses the primary database (TypeORM).
- The module is auto-registered in `AppModule` and will start polling when the application boots.

Usage
- To enqueue a failed grading job from other code, inject `GradingJobService` and call `enqueueFailedJob(submissionId, payload, maxAttempts?)`.

Testing
- The service exposes `processOnce()` for tests to trigger a single retry pass.

Notes
- Ensure `autoLoadEntities` or explicit entity registration is enabled so TypeORM picks up `GradingJobEntity`.
- Consider adding retention/cleanup for old failed jobs and hooks for alerting on repeated failures.
