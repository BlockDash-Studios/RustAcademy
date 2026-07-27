# Resolve issues #360, #361, #362 — Grading retries, stale leaderboard, idempotent badges

## Issues Closed

- **Closes #360** – Enhancement: add grading retries with backoff for external evaluation providers
- **Closes #361** – Bug: leaderboard rank updates are stale during high-volume submissions
- **Closes #362** – Enhancement: add badge awarding rules that are conflict-safe and idempotent

---

## Summary of Changes

### Issue #360 — Grading retries with backoff

**Problem:** External graders occasionally fail transiently. Submissions were failing immediately without retry.

**Solution:**
- **`config.module.ts`**: Added env var schema for `GRADING_MAX_RETRIES`, `GRADING_RETRY_BASE_DELAY_MS`, `GRADING_RETRY_MAX_DELAY_MS` with sensible defaults.
- **`grading-job.service.ts`**: Replaced hardcoded backoff with config-driven exponential backoff capped at `maxDelayMs`. Added `notifyGradingFailure()` to send in-app notifications when a grading job permanently exhausts all retries.
- **`challenges.service.ts`**: Added `evaluateWithRetry()` method that enqueues failed external evaluations into `GradingJobService` for retry instead of immediately failing.
- **`notifications.service.ts`**: Added `sendGradingFailureAlert()` method respecting user's `grading_failure_alerts` preference.
- **`jobs.module.ts`**: Added `NotificationsModule` import.

### Issue #361 — Stale leaderboard rank updates

**Problem:** Leaderboard displayed stale/outdated scores during high-volume submission periods because it used static sample data with no update mechanism.

**Solution:**
- **`leaderboard.service.ts`**: 
  - Added configurable cache with `LEADERBOARD_CACHE_TTL_MS` env var (default 30s).
  - Added `markStale()` method for external services to signal data has changed.
  - `buildLeaderboard()` now uses real `SubmissionService` data (approved submissions with scores) instead of static sample data, falling back to sample data when the service is unavailable.
  - Added time-range filtering (`daily`/`weekly`/`monthly`/`allTime`).
  - Cache is automatically invalidated when `stale` flag is set or TTL expires.
- **`leaderboard.module.ts`**: Added `SubmissionModule` import.

### Issue #362 — Conflict-safe, idempotent badge awarding

**Problem:** Badge issuance could create duplicates or inconsistent state when the same achievement was processed multiple times concurrently.

**Solution:**
- **`badges.service.ts`**:
  - Added `awardedBadgeSet` (Set of `userId::badgeId` keys) for O(1) atomic conflict detection within a single event-loop tick.
  - `awardBadge()` is now **idempotent**: duplicate calls silently return existing badges without throwing.
  - On first award, fires side effects: in-app notification (via `NotificationsService`) + `BADGE_EARNED` analytics event (via `AnalyticsService`).
  - `resetState()` and `resetUserBadges()` properly clean up the dedup set.
  - Added `hasBadge()` helper for efficient pre-checks.
- **`rewards.service.ts`**: 
  - Integrates with `BadgesService` on streak milestones (7-day "Week Warrior" badge) and level milestones (future badge IDs).
  - Badge awarding is wrapped safely for non-existent badge IDs.
- **`notifications.service.ts`**: Added `sendBadgeEarnedAlert()` with user preference support.
- **`notifications/interfaces/preferences.interface.ts`**: Added `grading_failure_alerts` and `badge_earned_alerts` fields.
- **`notifications/dto/update-preferences.dto.ts`**: Added corresponding DTO fields.
- **`badges.module.ts`**: Added `NotificationsModule` and `AnalyticsModule` imports.
- **`rewards.module.ts`**: Added `BadgesModule` import.

### Changes across all three issues

- **`app.module.ts`**: Added `BadgesModule` and `NotificationsModule` imports.
- **`challenges.module.ts`**: Added `JobsModule` import.
- **`submission.module.ts`**: Cleaned up unused import.

---

## Testing

- All modified files compile cleanly with zero type errors.
- New notification preferences default to enabled (`true`) for grading failure alerts and badge earned alerts, ensuring users receive important notifications out of the box.
- Badge awarding is tested via the existing `BadgesService` test infrastructure with the `resetState()` method.
