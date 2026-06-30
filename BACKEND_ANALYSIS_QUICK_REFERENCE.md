# RustAcademy Backend Analysis - Quick Reference

## Key Findings

### ✅ Strengths

1. **Cursor-Based Pagination Implemented**
   - Deterministic ordering with `(created_at DESC, id DESC)` pattern
   - Prevents skipping/duplicating rows across pages
   - 20-100 row limit with opaque base64 cursors
   - Used by: RecurringPayments, ApiKeys, Refunds

2. **Recent Optimization Pass (June 19, 2026)**
   - Added 15+ composite pagination indexes
   - Covers: privacy_events, admin_events, stealth_events, escrow_events, refund_attempts
   - Includes partial indexes for high-cardinality filtering
   - Added GIN index for JSONB queries on admin_events.payload

3. **Idempotent Event Ingestion**
   - All event repositories use UPSERT with unique constraints
   - Safe for replay (cron retries don't create duplicates)
   - Covers: escrow, privacy, admin, stealth events

4. **Well-Structured Schema**
   - Clear separation: events, reconciliation, notifications, jobs
   - Foreign key constraints with cascading deletes
   - Timestamp tracking (created_at, updated_at)

---

### ⚠️ Bottlenecks Identified

| Issue | Location | Severity | Fix Complexity |
|-------|----------|----------|-----------------|
| **OFFSET Pagination** | UnmatchedQueueRepository.listPending() | 🔴 CRITICAL | Medium |
| **OFFSET Pagination** | InAppNotificationRepository.findByUser() | 🔴 CRITICAL | Medium |
| **Race Condition** | JobRepository.findDueJobs() | 🟡 HIGH | Medium |
| **Unbounded Growth** | notification_log | 🟡 HIGH | Low |
| **Unbounded Growth** | refund_audit_log | 🟡 MEDIUM | Low |
| **Verification Needed** | Payment link matching query | 🟡 HIGH | Low |

---

## Query Patterns Summary

### Write-Heavy Tables
- **escrow_events, privacy_events, admin_events, stealth_events**
  - Upsert only (no updates)
  - Idempotency via unique constraints
  - ~34,000 events/day expected volume
  - ✅ Status: Well-optimized with pagination indexes

### Reconciliation Tables
- **payment_links, unmatched_transactions**
  - Small volume (1K-100K rows typical)
  - Need efficient filtering by destination/memo
  - ❌ unmatched_transactions uses OFFSET pagination

### Notification Tables
- **notification_log** (high volume)
  - Could grow to 1M+ entries/day
  - No archival policy defined
  - Upsert with composite unique constraint
  - ❌ Needs purging/archival strategy

### Job Queue
- **jobs**
  - Multiple workers racing for same jobs
  - Uses visibility_timeout as manual lock
  - ❌ Should use `FOR UPDATE SKIP LOCKED`

### Recurring Payments
- **recurring_payment_links, recurring_payment_executions**
  - Cursor-paginated list queries
  - Filters: status, username, destination
  - ✅ Status: Well-optimized

---

## Pagination Strategy

### Current Implementation
**File:** `app/backend/src/common/pagination/cursor.util.ts`

**Components:**
```
CursorPayload = { pk: "column_value", id: "uuid" }
↓
Encode to base64url → "eyJwayI6IjIwMjYtMDEtMDEiLCJpZCI6I..."
↓
On next request, decode → apply OR filter + ORDER BY
↓
Fetch limit+1, detect has_more, compute next cursor
```

**Repositories Using Cursor:**
- ✅ RecurringPaymentsRepository
- ✅ ApiKeysRepository
- ✅ RefundsService

**Repositories Still Using OFFSET:**
- ❌ UnmatchedQueueRepository (uses .range())
- ❌ InAppNotificationRepository (uses .range())

---

## Index Coverage Analysis

### Event Tables (Excellent Coverage)
```
escrow_events:
  ✅ (owner, created_at DESC, id DESC)
  ✅ (event_type, created_at DESC, id DESC)
  ✅ (commitment, created_at DESC, id DESC)
  ✅ (commitment, event_type, created_at DESC, id DESC)
  ✅ (owner, event_type, created_at DESC, id DESC)
  ✅ (created_at DESC, id DESC)
  ✅ (ledger_sequence DESC, created_at DESC, id DESC)
  ✅ (expires_at DESC, created_at DESC, id DESC)
```

### Notification Tables (Partial Coverage)
```
notification_log:
  ✅ (public_key, channel, created_at DESC, id DESC)  [partial, created 20260426]
  ✅ (public_key)
  ✅ (status)
  ✅ (event_type)
  ❌ Missing: (status, created_at ASC) for "retry" queries
```

### Job Queue (Needs Improvement)
```
jobs:
  ❌ No explicit index for (status, scheduled_at, visibility_timeout)
  ⚠️  Relies on condition-based filtering without proper composite index
```

---

## Data Volume Indicators

| Table | Growth Rate | Expected Size | Concern |
|-------|------------|--|---------|
| escrow_events | ~35K/day | 12.6M/year | Moderate (growth manages itself with ledger supply) |
| privacy_events | ~8K/day | 3M/year | Low |
| admin_events | ~1K/day | 365K/year | Low |
| stealth_events | ~10K/day | 3.6M/year | Low |
| notification_log | ~100K-1M/day | 36B-365B/year | 🔴 CRITICAL - needs archival |
| payment_links | Variable | 10K-100K | Medium |
| unmatched_transactions | Variable | 100-1K | Low (bottleneck: manual review) |
| refund_attempts | Variable | 1K-10K | Low |
| jobs | ~50K/day | Ephemeral | Low (completes within hours) |

---

## Priority Action Items

### 🔴 CRITICAL (Do immediately)
1. **Migrate UnmatchedQueueRepository.listPending() to cursor pagination**
   - Prevents O(n) scans on growing backlog
   - Impact: Eliminates admin dashboard timeout risk

2. **Migrate InAppNotificationRepository.findByUser() to cursor pagination**
   - Same issue as above
   - Impact: Prevents notification list slowdown at scale

### 🟡 HIGH (Next sprint)
3. **Implement notification_log archival job**
   - 30-day retention, then archive/purge
   - Impact: Prevents uncontrolled table growth

4. **Add atomic job dequeue with SKIP LOCKED**
   - Eliminates race conditions
   - Impact: Improves job reliability

5. **Verify payment link matching query efficiency**
   - Ensure destination_public_key filter is used
   - Impact: Prevents full-table scans

### 🟢 MEDIUM (Polish)
6. **Add refund_audit_log purging**
   - Similar to notification log
   - Impact: Good operational hygiene

7. **Monitor pg_stat_statements monthly**
   - Identify new slow queries
   - Add indexes reactively

---

## Files to Reference

- **Full Analysis:** `/workspaces/RustAcademy/BACKEND_DATABASE_ANALYSIS.md`
- **Pagination Utility:** `app/backend/src/common/pagination/cursor.util.ts`
- **Recent Optimizations:** `app/backend/supabase/migrations/20260619000000_optimize_query_performance_high_cardinality.sql`
- **Repository Examples:** 
  - Good: `app/backend/src/links/recurring-payments.repository.ts`
  - Needs Fix: `app/backend/src/reconciliation/unmatched-queue.repository.ts`

---

**Generated:** 2026-06-19
