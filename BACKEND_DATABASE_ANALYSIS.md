# RustAcademy Backend Database Analysis

**Date:** 2026-06-19  
**Focus:** Database queries, schemas, pagination, and performance optimization

---

## Table of Contents

1. [Current Query Patterns](#current-query-patterns)
2. [Pagination Implementation](#pagination-implementation)
3. [Table Schemas and Indexes](#table-schemas-and-indexes)
4. [Data Volume Hints](#data-volume-hints)
5. [Performance Issues & Bottlenecks](#performance-issues--bottlenecks)
6. [Optimization Recommendations](#optimization-recommendations)

---

## Current Query Patterns

### 1. Event Repositories (Ingestion Layer)

These repositories handle blockchain event ingestion with an **idempotent upsert pattern**.

#### EscrowEventRepository
- **Primary Operation:** `upsertEvent()`
- **Query Type:** Idempotent UPSERT on uniqueness constraint `(tx_hash, commitment, event_type)`
- **Fields Involved:**
  - `event_type`: 'EscrowDeposited' | 'EscrowWithdrawn' | 'EscrowRefunded'
  - `commitment`: hex-encoded BytesN<32> (tiebreaker for uniqueness)
  - `owner`: Stellar public key
  - `token`: token contract address
  - `amount`: i128 as text
  - `expires_at`: timestamp for deposit events
  - `ledger_sequence`, `paging_token`: blockchain metadata
- **Performance Characteristics:**
  - Single row insert/upsert (batch size: 1)
  - No filtering; pure write operation
  - Relies on unique constraint for idempotency

#### PrivacyEventRepository
- **Primary Operation:** `upsertEvent()`
- **Query Type:** Idempotent UPSERT on `(tx_hash, event_type, owner)`
- **Fields:**
  - `event_type`: 'PrivacyToggled'
  - `owner`: Stellar public key
  - `enabled`: boolean toggle state
  - `schema_version`: API versioning
- **Performance:** Single-row write, minimal fields

#### AdminEventRepository
- **Primary Operation:** `upsertEvent()`
- **Query Type:** Idempotent UPSERT on `(tx_hash, event_type)`
- **Unique Feature:** Polymorphic `payload` (JSONB)
  - Supports `ContractPaused`, `AdminChanged`, `ContractUpgraded`
  - Payload contains event-specific fields as JSONB

#### StealthEventRepository
- **Primary Operation:** `upsertEvent()`
- **Query Type:** Idempotent UPSERT on `(tx_hash, event_type, stealth_address)`
- **Key Fields:**
  - `stealth_address`: primary filter field
  - `counterparty`: ephemeral key or recipient
  - `token`, `amount`, `expires_at`

### 2. Reconciliation Layer

#### UnmatchedQueueRepository
**Purpose:** Manages transactions that fail automated matching; requires operator review

**Query Patterns:**

1. **Enqueue (Idempotent):**
   ```
   UPSERT INTO unmatched_transactions
   WHERE tx_hash = ? (unique constraint)
   ```
   - Single-row idempotent insert
   - Safely retryable by cron job

2. **List Pending (Paginated):**
   ```
   SELECT * FROM unmatched_transactions
   WHERE status = 'pending'
   ORDER BY ingested_at DESC
   LIMIT ? OFFSET ?
   ```
   - **Issue:** Uses traditional OFFSET pagination (inefficient at scale)
   - **Sort Column:** `ingested_at` (newest first)
   - **Filter:** `status IN ('pending')`
   - **Limit:** Capped at 100 rows

3. **Find by ID/Hash (Point Query):**
   ```
   SELECT * FROM unmatched_transactions
   WHERE id = ? OR tx_hash = ?
   ```
   - Single-row lookup via primary key or unique constraint

4. **Resolve/Dismiss (Status Update):**
   ```
   UPDATE unmatched_transactions
   SET status = ?, resolved_by = ?, resolved_at = ?, resolution_note = ?
   WHERE id = ? AND status = 'pending'
   ```
   - Optimistic locking via status check
   - Guards against double-resolution

**Existing Indexes:**
- `idx_unmatched_tx_pending_ingested`: `(ingested_at DESC) WHERE status = 'pending'`

### 3. Pagination-Heavy Repositories

#### RecurringPaymentsRepository
**Pagination Strategy:** Cursor-based with deterministic ordering

**listLinks() Query Pattern:**
```sql
SELECT * FROM recurring_payment_links
WHERE (status = ? OR TRUE)
  AND (username = ? OR TRUE)
  AND (destination = ? OR TRUE)
  AND (created_at < ? OR (created_at = ? AND id < ?))  -- cursor filter
ORDER BY created_at DESC, id DESC
LIMIT limit + 1  -- fetch extra to detect next page
```

**Key Observations:**
- Filters: `status`, `username`, `destination`
- Sort: `created_at DESC, id DESC`
- Cursor applied via `OR` filter for deterministic pagination
- Fetches `limit + 1` to detect "has_more"

#### ApiKeysRepository
**listAll() / findAllPaginated() Patterns:**
```sql
SELECT * FROM api_keys
WHERE is_active = TRUE
  AND (owner_id = ? OR TRUE)
  AND (organization_id = ? OR TRUE)
  AND (created_at < ? OR (created_at = ? AND id < ?))  -- cursor
ORDER BY created_at DESC, id DESC
LIMIT limit + 1
```

**Filters:** `is_active` (always), optional `owner_id`, `organization_id`

#### NotificationLogRepository
**Query Patterns:**

1. **Create Pending (Idempotent):**
   ```
   UPSERT INTO notification_log
   WHERE (public_key, channel, event_id, event_type) unique
   ```

2. **Mark Sent/Failed:**
   ```
   UPDATE notification_log
   SET status = ?, attempts = ?, ...
   WHERE public_key = ? AND channel = ? AND event_type = ? AND event_id = ?
   ```

3. **Get Pending Retries:**
   ```
   SELECT public_key, channel, event_type, event_id, attempts, updated_at
   FROM notification_log
   WHERE status = 'failed' AND attempts < ?
   ORDER BY created_at ASC
   LIMIT 100
   ```

#### RefundsService
**listRefunds() Pattern:**
```sql
SELECT * FROM refund_attempts
WHERE (created_at < ? OR (created_at = ? AND id < ?))  -- cursor DESC
ORDER BY created_at DESC, id DESC
LIMIT limit + 1
```

**No filters applied in list operation** - returns all refunds with pagination

### 4. Job Queue Repository

#### JobRepository
**Key Queries:**

1. **Create Job:**
   ```
   INSERT INTO jobs (type, payload, status, attempts, max_attempts, scheduled_at)
   ```

2. **Find Due Jobs (Visibility-Based Locking):**
   ```
   SELECT * FROM jobs
   WHERE status = 'pending'
     AND scheduled_at <= NOW()
     AND (visibility_timeout IS NULL OR visibility_timeout < NOW())
   ORDER BY scheduled_at ASC
   LIMIT ?
   ```
   - **Performance Critical:** Runs frequently in job worker loop
   - **Visibility Pattern:** Prevents concurrent processing (distributed lock)

3. **Update Job Status:**
   ```
   UPDATE jobs
   SET status = ?, attempts = ?, started_at = ?, completed_at = ?, ...
   WHERE id = ?
   ```

---

## Pagination Implementation

### Cursor-Based Pagination (Preferred)

**File:** [app/backend/src/common/pagination/cursor.util.ts](app/backend/src/common/pagination/cursor.util.ts)

**Design Principles:**
- Opaque base64-encoded JSON cursor: `{ pk: "creation_timestamp", id: "uuid_tiebreaker" }`
- **Deterministic Ordering:** Primary sort on `created_at`, secondary tiebreaker on `id`
- **Stable Pagination:** Immune to row insertions/deletions between requests

**Core Functions:**

```typescript
interface CursorPayload {
  pk: string;        // Value of primary sort column (e.g., created_at)
  id: string;        // UUID id of last returned row (tiebreaker)
}

function encodeCursor(payload: CursorPayload): string
function decodeCursor(cursor: string): CursorPayload | null

function clampLimit(limit?: number): number
  // Range: [1, 100], default 20

function applyCursorFilter<T>(
  query: T,
  cursor: CursorPayload | null,
  orderColumn: string,
  ascending: boolean,
  limit: number
): T
  // Builds OR filter for deterministic pagination

function paginateResult<T>(
  rows: T[],
  limit: number,
  orderColumn: string
): { data: T[]; next_cursor: string | null; has_more: boolean }
  // Splits fetched rows into result page and computes next cursor
```

**Pagination Limits:**
- `LIMIT_MIN = 1`
- `LIMIT_MAX = 100`
- `LIMIT_DEFAULT = 20`

**Fetch Strategy:**
- Request `limit + 1` rows
- If result has `limit + 1` rows → `has_more = true`, use extra row to compute `next_cursor`
- Otherwise → `has_more = false`, `next_cursor = null`

**Cursor Filter Logic (DESC order example):**
```sql
-- For next page: rows must satisfy:
-- orderColumn < cursor.pk  OR  (orderColumn = cursor.pk AND id < cursor.id)
SELECT * FROM table
WHERE (created_at < 'timestamp' OR (created_at = 'timestamp' AND id < 'uuid'))
ORDER BY created_at DESC, id DESC
LIMIT limit + 1
```

### Legacy Offset Pagination

**File:** [app/backend/src/notifications/in-app-notification.repository.ts](app/backend/src/notifications/in-app-notification.repository.ts)

```typescript
async findByUser(publicKey: string, page = 1, limit = 20) {
  return this.db
    .getClient()
    .from("in_app_notifications")
    .select("*")
    .eq("publicKey", publicKey)
    .range((page - 1) * limit, page * limit - 1)    // ← OFFSET
    .order("createdAt", { ascending: false });
}
```

**Issues with Offset:**
- ❌ O(n) performance: must scan and skip N rows
- ❌ Inefficient at high page numbers
- ❌ Can miss/duplicate rows if inserts occur between requests

---

## Table Schemas and Indexes

### Event Tables (Soroban Contract Ingestion)

#### escrow_events
```sql
CREATE TABLE escrow_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,              -- "EscrowDeposited" | "EscrowWithdrawn" | ...
  commitment TEXT NOT NULL,              -- hex-encoded BytesN<32>
  owner TEXT NOT NULL,                   -- Stellar public key
  token TEXT NOT NULL,                   -- token contract address
  amount TEXT NOT NULL,                  -- i128 as text
  expires_at TIMESTAMPTZ,                -- deposit expiry
  contract_timestamp BIGINT NOT NULL,
  tx_hash TEXT NOT NULL,
  ledger_sequence BIGINT NOT NULL,
  paging_token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (tx_hash, commitment, event_type)  -- idempotency
);
```

**Existing Indexes:**
- `escrow_events_commitment_idx: (commitment)`
- `escrow_events_owner_idx: (owner)`
- `escrow_events_event_type_idx: (event_type)`
- `escrow_events_ledger_sequence_idx: (ledger_sequence)`

**New Pagination Indexes (20260619):**
- `idx_escrow_events_owner_created_at_id: (owner DESC, created_at DESC, id DESC)`
- `idx_escrow_events_type_created_at_id: (event_type, created_at DESC, id DESC)`
- `idx_escrow_events_commitment_created_at_id: (commitment, created_at DESC, id DESC)`
- `idx_escrow_events_commitment_type_created_at_id: (commitment, event_type, created_at DESC, id DESC)`
- `idx_escrow_events_owner_type_created_at_id: (owner, event_type, created_at DESC, id DESC)`
- `idx_escrow_events_created_at_id_desc: (created_at DESC, id DESC)`
- `idx_escrow_events_ledger_created_at_id: (ledger_sequence DESC, created_at DESC, id DESC)`
- `idx_escrow_events_expires_at_created_at_id: (expires_at DESC, created_at DESC, id DESC) WHERE expires_at IS NOT NULL`

#### privacy_events
```sql
CREATE TABLE privacy_events (
  id UUID PRIMARY KEY,
  event_type TEXT NOT NULL,              -- "PrivacyToggled"
  owner TEXT NOT NULL,
  enabled BOOLEAN NOT NULL,
  schema_version INT NOT NULL DEFAULT 1,
  contract_timestamp BIGINT NOT NULL,
  tx_hash TEXT NOT NULL,
  ledger_sequence BIGINT NOT NULL,
  paging_token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,

  UNIQUE (tx_hash, event_type, owner)
);
```

**Pagination Indexes (20260619):**
- `idx_privacy_events_owner_created_at_id: (owner, created_at DESC, id DESC) WHERE owner IS NOT NULL`
- `idx_privacy_events_created_at_id_desc: (created_at DESC, id DESC)`
- `idx_privacy_events_ledger_created_at_id: (ledger_sequence DESC, created_at DESC, id DESC)`

#### admin_events
```sql
CREATE TABLE admin_events (
  id UUID PRIMARY KEY,
  event_type TEXT NOT NULL,              -- "ContractPaused" | "AdminChanged" | ...
  payload JSONB NOT NULL,                -- event-specific fields
  schema_version INT NOT NULL DEFAULT 1,
  contract_timestamp BIGINT NOT NULL,
  tx_hash TEXT NOT NULL,
  ledger_sequence BIGINT NOT NULL,
  paging_token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,

  UNIQUE (tx_hash, event_type)
);
```

**Pagination Indexes (20260619):**
- `idx_admin_events_type_created_at_id: (event_type, created_at DESC, id DESC)`
- `idx_admin_events_created_at_id_desc: (created_at DESC, id DESC)`
- `idx_admin_events_ledger_created_at_id: (ledger_sequence DESC, created_at DESC, id DESC)`
- `idx_admin_events_payload_gin: USING GIN (payload) WHERE payload IS NOT NULL` ← Advanced JSONB querying

#### stealth_events
```sql
CREATE TABLE stealth_events (
  id UUID PRIMARY KEY,
  event_type TEXT NOT NULL,
  stealth_address TEXT NOT NULL,
  counterparty TEXT NOT NULL,            -- eph_pub or recipient
  token TEXT,
  amount TEXT,
  expires_at TIMESTAMPTZ,
  schema_version INT NOT NULL DEFAULT 1,
  contract_timestamp BIGINT NOT NULL,
  tx_hash TEXT NOT NULL,
  ledger_sequence BIGINT NOT NULL,
  paging_token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,

  UNIQUE (tx_hash, event_type, stealth_address)
);
```

**Pagination Indexes (20260619):**
- `idx_stealth_events_stealth_address_created_at_id: (stealth_address, created_at DESC, id DESC) WHERE stealth_address IS NOT NULL`
- `idx_stealth_events_counterparty_created_at_id: (counterparty, created_at DESC, id DESC) WHERE counterparty IS NOT NULL`
- `idx_stealth_events_token_created_at_id: (token, created_at DESC, id DESC) WHERE token IS NOT NULL`
- `idx_stealth_events_created_at_id_desc: (created_at DESC, id DESC)`
- `idx_stealth_events_ledger_created_at_id: (ledger_sequence DESC, created_at DESC, id DESC)`

### Reconciliation & Refund Tables

#### payment_links
```sql
CREATE TABLE payment_links (
  id UUID PRIMARY KEY,
  owner_public_key TEXT NOT NULL,
  destination_public_key TEXT NOT NULL,
  amount TEXT NOT NULL,                  -- decimal string
  asset_code TEXT NOT NULL DEFAULT 'XLM',
  asset_issuer TEXT,
  memo TEXT,
  memo_type TEXT NOT NULL DEFAULT 'text',
  reference_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'open'    -- "open" | "paid" | "expired" | "cancelled"
    CHECK (status IN ('open', 'paid', 'expired', 'cancelled')),
  expires_at TIMESTAMPTZ,
  matched_tx_hash TEXT,
  matched_at TIMESTAMPTZ,
  match_confidence INTEGER CHECK (0 <= match_confidence AND match_confidence <= 100),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
```

**Indexes:**
- `idx_payment_links_destination_open: (destination_public_key) WHERE status = 'open'`
- `idx_payment_links_memo_open: (memo) WHERE memo IS NOT NULL AND status = 'open'`
- `idx_payment_links_expires_open: (expires_at) WHERE status = 'open' AND expires_at IS NOT NULL`

#### unmatched_transactions
```sql
CREATE TABLE unmatched_transactions (
  id UUID PRIMARY KEY,
  tx_hash TEXT NOT NULL UNIQUE,
  ledger BIGINT,
  source_account TEXT NOT NULL,
  destination_account TEXT NOT NULL,
  amount TEXT NOT NULL,
  asset_code TEXT NOT NULL,
  asset_issuer TEXT,
  memo TEXT,
  memo_type TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL,
  
  status TEXT NOT NULL DEFAULT 'pending' -- "pending" | "resolved" | "dismissed"
    CHECK (status IN ('pending', 'resolved', 'dismissed')),
  best_candidate_link_id UUID REFERENCES payment_links (id),
  best_confidence INTEGER CHECK (0 <= best_confidence AND best_confidence <= 100),
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ,
  resolution_note TEXT
);
```

**Indexes:**
- `idx_unmatched_tx_pending_ingested: (ingested_at DESC) WHERE status = 'pending'`

#### refund_attempts
```sql
CREATE TABLE refund_attempts (
  id UUID PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  entity_type TEXT NOT NULL             -- "payment" | "escrow" | "link"
    CHECK (entity_type IN ('payment', 'escrow', 'link')),
  entity_id TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' -- "pending" | "approved" | "rejected" | "failed"
    CHECK (status IN ('pending', 'approved', 'rejected', 'failed')),
  actor_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
```

**Existing Indexes:**
- `idx_refund_attempts_entity: (entity_type, entity_id)`
- `idx_refund_attempts_status: (status)`

**New Pagination Indexes (20260619):**
- `idx_refund_attempts_created_at_id: (created_at DESC, id DESC)`
- `idx_refund_attempts_status_created_at_id: (status, created_at DESC, id DESC) WHERE status IS NOT NULL`
- `idx_refund_attempts_entity_type_created_at_id: (entity_type, created_at DESC, id DESC) WHERE entity_type IS NOT NULL`
- `idx_refund_attempts_entity_type_id_created_at: (entity_type, entity_id, created_at DESC) WHERE entity_type IS NOT NULL AND entity_id IS NOT NULL`
- `idx_refund_attempts_idempotency_key: (idempotency_key) WHERE idempotency_key IS NOT NULL`

#### refund_audit_log
```sql
CREATE TABLE refund_audit_log (
  id UUID PRIMARY KEY,
  refund_id UUID NOT NULL REFERENCES refund_attempts (id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  reason_code TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL
);
```

**Indexes:**
- `idx_refund_audit_log_refund_id: (refund_id)`

### Notification Tables

#### notification_preferences
```sql
CREATE TABLE notification_preferences (
  id UUID PRIMARY KEY,
  public_key TEXT NOT NULL,
  channel TEXT NOT NULL                  -- "email" | "push" | "webhook"
    CHECK (channel IN ('email', 'push', 'webhook')),
  email TEXT,
  push_token TEXT,
  webhook_url TEXT,
  events TEXT[] DEFAULT NULL,
  min_amount_stroops BIGINT DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,

  UNIQUE (public_key, channel)
);
```

**Indexes:**
- `notification_preferences_public_key_idx: (public_key)`

#### notification_log
```sql
CREATE TABLE notification_log (
  id UUID PRIMARY KEY,
  public_key TEXT NOT NULL,
  channel TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' -- "pending" | "sent" | "failed"
    CHECK (status IN ('pending', 'sent', 'failed')),
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  provider_message_id TEXT,
  webhook_response_status INT,           -- for webhook channel
  webhook_response_body TEXT,
  webhook_delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,

  UNIQUE (public_key, channel, event_id, event_type)
);
```

**Existing Indexes:**
- `notification_log_public_key_idx: (public_key)`
- `notification_log_status_idx: (status)`
- `notification_log_event_type_idx: (event_type)`

**New Pagination Indexes (20260426):**
- `idx_notification_log_pk_channel_created_at_id: (public_key, channel, created_at DESC, id DESC)`

### Job Queue Table

#### jobs
```sql
CREATE TABLE jobs (
  id UUID PRIMARY KEY,
  type TEXT NOT NULL,                    -- job type identifier
  payload JSONB NOT NULL,                -- job-specific data
  status TEXT NOT NULL DEFAULT 'pending' -- "pending" | "running" | "completed" | "failed"
    CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failure_reason TEXT,
  visibility_timeout TIMESTAMPTZ         -- distributed lock mechanism
);
```

**Indexes:**
- `(status, scheduled_at)` – for finding due jobs
- `(visibility_timeout)` – for distributed locking

### Recurring Payments Table

#### recurring_payment_links
```sql
CREATE TABLE recurring_payment_links (
  id UUID PRIMARY KEY,
  username TEXT,                         -- Optional route identifier
  destination TEXT,                      -- Optional Stellar public key
  amount DECIMAL(17,7) NOT NULL,
  asset TEXT NOT NULL,
  asset_issuer TEXT,
  frequency TEXT NOT NULL                -- "daily" | "weekly" | "monthly" | "yearly"
    CHECK (frequency IN ('daily', 'weekly', 'monthly', 'yearly')),
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,
  total_periods INTEGER,
  executed_count INTEGER NOT NULL DEFAULT 0,
  next_execution_date TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'  -- "active" | "paused" | "completed" | "cancelled"
    CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
  memo TEXT,
  memo_type TEXT DEFAULT 'text',
  reference_id TEXT,
  privacy_enabled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,

  CONSTRAINT username_or_destination CHECK (username IS NOT NULL OR destination IS NOT NULL),
  CONSTRAINT start_before_end CHECK (end_date IS NULL OR end_date > start_date)
);
```

**Indexes:**
- `recurring_links_username_idx: (username)`
- `recurring_links_destination_idx: (destination)`
- `recurring_links_status_idx: (status)`
- `recurring_links_next_execution_idx: (next_execution_date)`
- `recurring_links_frequency_idx: (frequency)`

**New Pagination Indexes (20260426):**
- `idx_recurring_payment_links_created_at_id: (created_at DESC, id DESC)`
- `idx_recurring_payment_links_status_created_at_id: (status, created_at DESC, id DESC)`

#### recurring_payment_executions
```sql
CREATE TABLE recurring_payment_executions (
  id UUID PRIMARY KEY,
  recurring_link_id UUID NOT NULL REFERENCES recurring_payment_links (id) ON DELETE CASCADE,
  period_number INTEGER NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  executed_at TIMESTAMPTZ,
  amount DECIMAL(17,7) NOT NULL,
  asset TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'executed', 'failed', 'skipped', 'cancelled')),
  transaction_hash TEXT,
  stellar_operation_id TEXT,
  failure_reason TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_retry_at TIMESTAMPTZ,
  notification_sent BOOLEAN,
  notification_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL
);
```

### API Keys Table

#### api_keys
```sql
CREATE TABLE api_keys (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,                -- bcrypt hash
  key_prefix TEXT NOT NULL UNIQUE,
  scopes TEXT[] NOT NULL,
  owner_id TEXT,
  organization_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  monthly_quota INTEGER NOT NULL,
  key_hash_old TEXT,                     -- for rotation tracking
  rotated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
```

**Pagination Indexes (20260426):**
- `idx_api_keys_active_created_at_id: (is_active, created_at DESC, id DESC)`
- `idx_api_keys_owner_active_created_at_id: (owner_id, is_active, created_at DESC, id DESC)`

---

## Data Volume Hints

### Estimated Growth Patterns

**Event Tables (High Cardinality, Write-Heavy):**
- Each Soroban contract event generates 1 row per ledger sequence
- Ledger production: ~10 seconds per ledger (Stellar)
- Daily events: `(86,400 sec / 10 sec) = ~8,640 ledgers/day`
- With 4 event types (escrow, privacy, admin, stealth): 34,560 events/day
- Yearly: ~12.6M events

**Reconciliation Tables (Medium Cardinality, Sporadic Writes):**
- `payment_links`: Created per user request (variable)
- `unmatched_transactions`: Typically small backlog (1-1000 rows)
  - These are problematic cases; most match automatically
  - Growth is bounded by operator review capacity

**Notification Tables (High Volume):**
- `notification_log`: 1 entry per event-channel pair
- With thousands of subscribed users and daily events: 100K-1M entries/day
- Needs aggressive archival/purging

**Job Queue (Medium Volume):**
- Scheduled jobs for recurring payments, retries, etc.
- Expected: 10K-100K jobs/day
- Most should complete within hours

---

## Performance Issues & Bottlenecks

### 1. **Unmatched Transaction List Uses OFFSET Pagination** ⚠️

**Location:** [app/backend/src/reconciliation/unmatched-queue.repository.ts](app/backend/src/reconciliation/unmatched-queue.repository.ts#L80-L90)

**Issue:**
```typescript
async listPending(limit: number, offset: number): Promise<UnmatchedPage> {
  // ❌ OFFSET-based pagination
  const { data, error, count } = await query
    .range(offset, offset + effectiveLimit - 1);
}
```

**Impact:**
- O(n) scan of all rows up to offset
- At 10,000 pending rows, page 100 scans 100K rows
- Becomes unresponsive as backlog grows

**Fix:** Migrate to cursor-based pagination (follow RecurringPaymentsRepository pattern)

### 2. **In-App Notifications Also Use OFFSET** ⚠️

**Location:** [app/backend/src/notifications/in-app-notification.repository.ts](app/backend/src/notifications/in-app-notification.repository.ts#L17-L25)

**Issue:** Same as above — inefficient at high notification volumes

### 3. **Event Tables Missing Composite Indexes** ⚠️ (FIXED in 20260619)

**Previous Gaps:**
- Queries filtering by `owner` + paginating by `created_at` had no composite index
- Queries filtering by `event_type` + paginating had no composite index
- Would cause full-table scans on large tables

**Recent Fix:** Migration 20260619 added comprehensive pagination indexes:
- `(owner, created_at DESC, id DESC)` for owner-filtered pagination
- `(event_type, created_at DESC, id DESC)` for type-filtered pagination
- Conditional indexes with `WHERE` clauses to exclude NULL values

### 4. **Payment Links Scanning 100% for Matches** ⚠️

**Location:** Auto-match engine (reconciliation-worker.service.ts)

**Pattern:**
```sql
SELECT * FROM payment_links WHERE status = 'open'  -- potential full scan
```

**Expected:** Depending on destination_public_key or memo
```sql
SELECT * FROM payment_links 
WHERE destination_public_key = ? AND status = 'open'
```

**Issue:** Without filtering to specific destination, could scan tens of thousands of open links

**Mitigation:** Indexes on `(destination_public_key) WHERE status = 'open'` exist but must be used

### 5. **Notification Log Heavy Inserts** ⚠️

**Pattern:**
- Every event generates up to 3 rows (email + push + webhook)
- With thousands of subscribed users: high-cardinality insert workload
- Unique constraint on `(public_key, channel, event_id, event_type)` enforces idempotency
  - BUT enforces in application, not at DB level (could cause race conditions in distributed system)

**Risk:** Hot rows/contention on notification_log inserts at scale

### 6. **Job Queue Visibility Lock Contention** ⚠️

**Pattern:**
```sql
SELECT * FROM jobs
WHERE status = 'pending'
  AND scheduled_at <= NOW()
  AND (visibility_timeout IS NULL OR visibility_timeout < NOW())
ORDER BY scheduled_at ASC
LIMIT 100
```

**Issue:**
- Multiple job workers simultaneously poll this query
- All see the same due jobs
- Race condition: multiple workers may attempt to process same job
- Visibility_timeout acts as manual distributed lock (requires application discipline)

**Recommendation:** Use PostgreSQL `FOR UPDATE SKIP LOCKED` for atomic job dequeue

### 7. **Refund Audit Log Growth** ⚠️

**Pattern:**
- One audit entry per status transition (initiated → approved/rejected)
- Could grow unbounded
- No purging policy defined

**Risk:** Unbounded audit table growth

---

## Optimization Recommendations

### Immediate Priorities

#### 1. **Migrate In-App & Unmatched Tx Lists to Cursor Pagination** 🔴 CRITICAL

**Effort:** Medium  
**Impact:** High (eliminates O(n) scans)

**Steps:**
1. Refactor `InAppNotificationRepository.findByUser()` to accept cursor parameter
2. Refactor `UnmatchedQueueRepository.listPending()` similarly
3. Update controllers to use cursor-based pagination from client
4. Add `(created_at DESC, id DESC)` indexes to both tables

**Code Pattern (from ApiKeysRepository):**
```typescript
async listPending(cursor: CursorPayload | null, limit?: number) {
  const effectiveLimit = clampLimit(limit);
  let query = this.supabase.from('unmatched_transactions')
    .select('*', { count: 'exact' })
    .eq('status', 'pending');

  if (cursor) {
    query = query
      .lt('ingested_at', cursor.pk)
      .or(`ingested_at.eq.${cursor.pk},id.lt.${cursor.id}`);
  }

  query = query
    .order('ingested_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(effectiveLimit + 1);

  const { data, error, count } = await query;
  return paginateResult(data, effectiveLimit, 'ingested_at');
}
```

---

#### 2. **Verify Payment Links Matching Query Efficiency** 🟡 HIGH

**Effort:** Low  
**Impact:** Medium (prevents full scans)

**Action:**
- Audit reconciliation-worker.service.ts to ensure:
  - Queries filter by `destination_public_key` when possible
  - Queries use `(destination_public_key) WHERE status = 'open'` index
  - Consider secondary filter by memo for high-confidence matches first

**Query Pattern to Verify:**
```sql
-- ✅ GOOD: Uses partial index
SELECT * FROM payment_links 
WHERE destination_public_key = ? AND status = 'open'

-- ❌ BAD: Would do full scan
SELECT * FROM payment_links WHERE status = 'open'  -- 100K rows scan
```

---

#### 3. **Add Job Queue Atomic Dequeue with SKIP LOCKED** 🟡 HIGH

**Effort:** Medium  
**Impact:** High (eliminates race condition, improves reliability)

**Current Pattern (Application-Level Lock):**
```typescript
async findDueJobs(limit: number) {
  // Race condition possible: multiple workers fetch same jobs
  const { data } = await this.client
    .from('jobs')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_at', now)
    .order('scheduled_at', { ascending: true })
    .limit(limit);
  return data;
}
```

**Improved Pattern (Database-Level Lock):**
```sql
-- PostgreSQL 11+: Skip rows locked by other transactions
SELECT * FROM jobs
WHERE status = 'pending'
  AND scheduled_at <= NOW()
  AND (visibility_timeout IS NULL OR visibility_timeout < NOW())
ORDER BY scheduled_at ASC
LIMIT 100
FOR UPDATE SKIP LOCKED;

-- Immediately update visibility_timeout in same transaction
UPDATE jobs SET visibility_timeout = NOW() + INTERVAL '30 seconds'
WHERE id IN (list of selected job IDs);
```

**Implementation Note:** Requires raw SQL, Supabase may not support directly; consider stored procedure

---

#### 4. **Implement Notification Log Archival** 🟡 HIGH

**Effort:** Medium  
**Impact:** Medium (controls unbounded growth)

**Policy:**
- Archive (or delete) notification_log entries older than 30 days
- Archive to separate `notification_log_archive` table or data warehouse
- Keep recent entries for debugging recent delivery failures

**Migration:**
```sql
CREATE TABLE notification_log_archive AS 
SELECT * FROM notification_log 
WHERE created_at < NOW() - INTERVAL '30 days';

DELETE FROM notification_log 
WHERE created_at < NOW() - INTERVAL '30 days';

-- Create retention job:
INSERT INTO jobs (type, payload, scheduled_at)
VALUES ('archive_old_notifications', '{}', NOW() + INTERVAL '1 day');
```

---

#### 5. **Add Refund Audit Log Retention Policy** 🟡 MEDIUM

**Effort:** Low  
**Impact:** Low (prevents unbounded growth, good hygiene)

**Policy:**
- Keep full audit history for 90 days
- Archive to separate table after 90 days
- Purge fully after 1 year

**Similar to notification log archival**

---

### Medium-Term Improvements

#### 6. **Consider JSONB Query Optimization for Admin Events** 🟢 MEDIUM

**Status:** Already has GIN index (20260619)  
**Leverage:** If queries filter on specific payload fields (e.g., `payload->>'admin'`), verify GIN index is being used

**Query Pattern:**
```sql
SELECT * FROM admin_events
WHERE payload->>'admin' = ?  -- ← GIN index can help
ORDER BY created_at DESC
LIMIT 20
```

**Verify with EXPLAIN:**
```sql
EXPLAIN (ANALYZE) SELECT * FROM admin_events 
WHERE payload->>'admin' = 'address_here'
ORDER BY created_at DESC LIMIT 20;
```

---

#### 7. **Monitor and Add Indexes for Hot Queries** 🟢 MEDIUM

**Ongoing:**
- Run `pg_stat_statements` query monthly to identify slow queries
- Look for sequential scans on large tables
- Add composite indexes for missing filter+sort combinations

**Example Hot Query Analysis Query:**
```sql
SELECT query, calls, total_time, mean_time
FROM pg_stat_statements
WHERE query LIKE '%unmatched_transactions%'
  AND calls > 1000
ORDER BY total_time DESC
LIMIT 10;
```

---

#### 8. **Consolidate Pagination Patterns** 🟢 LOW-MEDIUM

**Current State:** Mix of cursor-based and offset-based pagination

**Goal:** Standardize on cursor-based for all list endpoints

**Remaining Work:**
- [ ] Migrate InAppNotificationRepository
- [ ] Migrate UnmatchedQueueRepository
- [ ] Audit all other repositories for offset usage

---

### Long-Term Architectural Improvements

#### 9. **Consider Event Sourcing for Audit Trail** 🟢 FUTURE

**Applicable to:** Refunds, reconciliation, notifications

**Benefit:** Immutable audit trail with time-travel queries  
**Tradeoff:** Increased complexity

---

#### 10. **Separate Hot and Cold Data** 🟢 FUTURE

**Pattern:** Move old events to separate tables or data warehouse

**Example:**
- `escrow_events` (last 30 days) – hot, indexed
- `escrow_events_archive` (older) – separate schema, less frequently queried

**Benefit:** Keeps primary tables lean, faster queries on recent data

---

## Summary Table: Query Patterns & Recommendations

| Table | Primary Pattern | Sort | Filters | Index Status | Recommendation |
|-------|-----------------|------|---------|--------------|-----------------|
| escrow_events | Upsert | created_at DESC | owner, event_type, commitment | ✅ Optimized (20260619) | None; status good |
| privacy_events | Upsert | created_at DESC | owner | ✅ Optimized (20260619) | None; status good |
| admin_events | Upsert + JSONB query | created_at DESC | event_type, payload | ✅ Optimized (20260619) + GIN | None; status excellent |
| stealth_events | Upsert | created_at DESC | stealth_address, token | ✅ Optimized (20260619) | None; status good |
| payment_links | Point + filtered scan | - | destination, memo, status | ✅ Partial indexes | ✅ Verify matching logic uses index |
| unmatched_transactions | List pending + updates | ingested_at DESC | status | ⚠️ Only has partial index | 🔴 MIGRATE TO CURSOR PAGINATION |
| refund_attempts | List all + updates | created_at DESC | entity_type, status | ✅ Optimized (20260619) | None; status good |
| notification_preferences | Point query | - | public_key, channel | ✅ Has index | None; status good |
| notification_log | Upsert + list retries | created_at ASC | status, public_key | ⚠️ Limited pagination index | 🟡 ADD ARCHIVAL POLICY, verify index usage |
| api_keys | List paginated | created_at DESC | is_active, owner_id | ✅ Optimized | None; status good |
| in_app_notifications | List by user | createdAt DESC | publicKey | ❌ OFFSET pagination | 🔴 MIGRATE TO CURSOR PAGINATION |
| jobs | Find due + update | scheduled_at ASC | status, scheduled_at, visibility | ⚠️ Multiple conditions | 🟡 ADD ATOMIC DEQUEUE WITH SKIP LOCKED |
| recurring_payment_links | List paginated + filter | created_at DESC | status, username, destination | ✅ Optimized (20260426) | None; status good |

---

## References

- **Pagination Utility:** [cursor.util.ts](app/backend/src/common/pagination/cursor.util.ts)
- **Recent Optimizations:** [20260619000000_optimize_query_performance_high_cardinality.sql](app/backend/supabase/migrations/20260619000000_optimize_query_performance_high_cardinality.sql)
- **Pagination Indexes:** [20260426000000_add_pagination_indexes.sql](app/backend/supabase/migrations/20260426000000_add_pagination_indexes.sql)
- **Event Schema:** [20260528000000_soroban_event_indexer_v1.sql](app/backend/supabase/migrations/20260528000000_soroban_event_indexer_v1.sql)

---

**Document Generated:** 2026-06-19  
**Last Updated:** 2026-06-19
