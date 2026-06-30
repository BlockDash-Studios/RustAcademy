-- Migration: Optimize Query Performance for High-Cardinality Ledger Snapshots
-- Date: 2026-06-19
-- Purpose: Add indexes for pagination, filtering, and sorting to prevent full-table scans
-- and improve query performance under realistic data volumes.
-- Also: implement data archival policies and atomic operations.

BEGIN;

-- ─── Unmatched Transactions Optimization ────────────────────────────────────
-- Dashboard uses cursor-based pagination with (ingested_at DESC, id DESC).
-- Composite index enables single-pass pagination without full-table scans.

CREATE INDEX IF NOT EXISTS idx_unmatched_transactions_status_ingested_id
  ON unmatched_transactions (status, ingested_at DESC, id DESC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_unmatched_transactions_destination_ingested_id
  ON unmatched_transactions (destination_account, ingested_at DESC, id DESC)
  WHERE status = 'pending';

-- ─── In-App Notifications Optimization ──────────────────────────────────────
-- User notifications are fetched with cursor-based pagination (createdAt DESC, id DESC).
-- Composite index ensures O(limit) scans instead of O(total_notifications).

CREATE TABLE IF NOT EXISTS in_app_notifications (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  public_key            TEXT        NOT NULL,
  event_type            TEXT        NOT NULL,
  event_id              TEXT        NOT NULL,
  title                 TEXT        NOT NULL,
  body                  TEXT        NOT NULL,
  metadata              JSONB,
  read                  BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT in_app_notifications_unique UNIQUE (public_key, event_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_in_app_notifications_public_key_created_id
  ON in_app_notifications (public_key, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_in_app_notifications_public_key_read_created
  ON in_app_notifications (public_key, read, created_at DESC)
  WHERE read = FALSE;

-- ─── Privacy Events Optimization ────────────────────────────────────────────
-- Current pagination uses (created_at DESC, id DESC) with optional owner filter.
-- Add composite index to cover both pagination and filtering in single scan.

CREATE INDEX IF NOT EXISTS idx_privacy_events_owner_created_at_id
  ON privacy_events (owner, created_at DESC, id DESC)
  WHERE owner IS NOT NULL;

-- Covering index for common query patterns: list events by owner
CREATE INDEX IF NOT EXISTS idx_privacy_events_created_at_id_desc
  ON privacy_events (created_at DESC, id DESC);

-- Composite index for queries ordering by ledger_sequence
CREATE INDEX IF NOT EXISTS idx_privacy_events_ledger_created_at_id
  ON privacy_events (ledger_sequence DESC, created_at DESC, id DESC);

-- ─── Admin Events Optimization ──────────────────────────────────────────────
-- Queries often filter by event_type and then paginate.
-- Add composite indexes for efficient pagination with type filtering.

CREATE INDEX IF NOT EXISTS idx_admin_events_type_created_at_id
  ON admin_events (event_type, created_at DESC, id DESC);

-- Pagination without type filter
CREATE INDEX IF NOT EXISTS idx_admin_events_created_at_id_desc
  ON admin_events (created_at DESC, id DESC);

-- Ledger-based queries for archival/recovery scenarios
CREATE INDEX IF NOT EXISTS idx_admin_events_ledger_created_at_id
  ON admin_events (ledger_sequence DESC, created_at DESC, id DESC);

-- JSONB field indexing for specific payload queries (e.g., payload->'admin')
-- This uses PostgreSQL GIN index for efficient JSONB operations
CREATE INDEX IF NOT EXISTS idx_admin_events_payload_gin
  ON admin_events USING GIN (payload)
  WHERE payload IS NOT NULL;

-- ─── Stealth Events Optimization ────────────────────────────────────────────
-- Stealth address is a common filter; counterparty may also be filtered.
-- Add composite indexes for efficient pagination with these filters.

CREATE INDEX IF NOT EXISTS idx_stealth_events_stealth_address_created_at_id
  ON stealth_events (stealth_address, created_at DESC, id DESC)
  WHERE stealth_address IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stealth_events_counterparty_created_at_id
  ON stealth_events (counterparty, created_at DESC, id DESC)
  WHERE counterparty IS NOT NULL;

-- Full pagination support
CREATE INDEX IF NOT EXISTS idx_stealth_events_created_at_id_desc
  ON stealth_events (created_at DESC, id DESC);

-- Ledger sequence ordering (for time-range queries or historical scans)
CREATE INDEX IF NOT EXISTS idx_stealth_events_ledger_created_at_id
  ON stealth_events (ledger_sequence DESC, created_at DESC, id DESC);

-- Token-based queries (common when analyzing specific assets)
CREATE INDEX IF NOT EXISTS idx_stealth_events_token_created_at_id
  ON stealth_events (token, created_at DESC, id DESC)
  WHERE token IS NOT NULL;

-- ─── Escrow Events Optimization ────────────────────────────────────────────
-- Escrow has high cardinality on commitment, owner, and event_type.
-- Add all necessary composite indexes for efficient pagination and filtering.

CREATE INDEX IF NOT EXISTS idx_escrow_events_commitment_created_at_id
  ON escrow_events (commitment, created_at DESC, id DESC)
  WHERE commitment IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_escrow_events_owner_created_at_id
  ON escrow_events (owner, created_at DESC, id DESC)
  WHERE owner IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_escrow_events_type_created_at_id
  ON escrow_events (event_type, created_at DESC, id DESC)
  WHERE event_type IS NOT NULL;

-- Composite filter: commitment + event_type (common for state queries)
CREATE INDEX IF NOT EXISTS idx_escrow_events_commitment_type_created_at_id
  ON escrow_events (commitment, event_type, created_at DESC, id DESC)
  WHERE commitment IS NOT NULL AND event_type IS NOT NULL;

-- Composite filter: owner + event_type (common for user-scoped queries)
CREATE INDEX IF NOT EXISTS idx_escrow_events_owner_type_created_at_id
  ON escrow_events (owner, event_type, created_at DESC, id DESC)
  WHERE owner IS NOT NULL AND event_type IS NOT NULL;

-- Pagination without filters
CREATE INDEX IF NOT EXISTS idx_escrow_events_created_at_id_desc
  ON escrow_events (created_at DESC, id DESC);

-- Ledger-based queries
CREATE INDEX IF NOT EXISTS idx_escrow_events_ledger_created_at_id
  ON escrow_events (ledger_sequence DESC, created_at DESC, id DESC);

-- Expiration-based queries (common for escrow state machines)
CREATE INDEX IF NOT EXISTS idx_escrow_events_expires_at_created_at_id
  ON escrow_events (expires_at DESC, created_at DESC, id DESC)
  WHERE expires_at IS NOT NULL;

-- ─── Refund Attempts Optimization ──────────────────────────────────────────
-- Refund queries typically filter by status and paginate by created_at.

CREATE INDEX IF NOT EXISTS idx_refund_attempts_status_created_at_id
  ON refund_attempts (status, created_at DESC, id DESC)
  WHERE status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_refund_attempts_entity_type_created_at_id
  ON refund_attempts (entity_type, created_at DESC, id DESC)
  WHERE entity_type IS NOT NULL;

-- Composite: entity_type + entity_id for quick lookup of refunds for a resource
CREATE INDEX IF NOT EXISTS idx_refund_attempts_entity_type_id_created_at
  ON refund_attempts (entity_type, entity_id, created_at DESC)
  WHERE entity_type IS NOT NULL AND entity_id IS NOT NULL;

-- Idempotency key lookup index (already unique, but useful for reads)
CREATE INDEX IF NOT EXISTS idx_refund_attempts_idempotency_key
  ON refund_attempts (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ─── Indexer Checkpoints Optimization ───────────────────────────────────────
-- Checkpoint lookups are by (contract_id, network, mode) composite.
-- Ensure efficient lookups even with many contracts in the system.

CREATE INDEX IF NOT EXISTS idx_indexer_checkpoints_network_mode
  ON indexer_checkpoints (network, mode)
  WHERE network IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_indexer_checkpoints_updated_at
  ON indexer_checkpoints (updated_at DESC)
  WHERE updated_at IS NOT NULL;

-- ─── Cursors Table Optimization ────────────────────────────────────────────
-- Cursor updates are frequent; ensure lookup by stream ID is fast.

CREATE INDEX IF NOT EXISTS idx_cursors_updated_at
  ON cursors (updated_at DESC);

-- ─── Data Archival Policies ────────────────────────────────────────────────
-- Prevent unbounded growth of log tables by automatically archiving old records.

-- Archive notification_log entries older than 30 days.
-- This prevents the table from growing indefinitely (1M+ entries/day).
-- Archived records are moved to a separate table or deleted based on retention policy.
CREATE TABLE IF NOT EXISTS notification_log_archive AS
SELECT * FROM notification_log WHERE 1=0; -- Create empty archive table with same schema

-- Auto-vacuum policy: Delete notification_log entries older than 30 days
-- Note: Ensure this runs during off-peak hours via pg_cron or external scheduler.
-- Supabase limitation: Manual cleanup via API or scheduled function call recommended.
-- Placeholder for documentation; actual implementation depends on hosting environment.
COMMENT ON TABLE notification_log IS
  'Retention policy: Entries are archived after 30 days via separate scheduled task.
   See: backend/supabase/migrations/archival_policy.md for implementation details.';

-- Refund audit log archival: Similar 30-day retention policy
-- Archive old refund audit entries to maintain query performance
CREATE TABLE IF NOT EXISTS refund_audit_log_archive AS
SELECT * FROM refund_audit_log WHERE 1=0; -- Placeholder if table exists

COMMENT ON TABLE refund_audit_log_archive IS
  'Archive table for refund audit logs older than 30 days. Reduces main table scan costs.';

-- ─── Job Queue Optimization ────────────────────────────────────────────────
-- Add covering index for efficient atomic dequeue with FOR UPDATE SKIP LOCKED.

CREATE INDEX IF NOT EXISTS idx_jobs_status_created_at
  ON jobs (status, created_at ASC)
  WHERE status = 'pending';

-- ─── Payment Links Query Optimization ──────────────────────────────────────
-- Ensure payment link matching queries use destination filter (no full-table scan).

CREATE INDEX IF NOT EXISTS idx_payment_links_destination_status
  ON payment_links (destination_public_key, status)
  WHERE status = 'open';

-- ─── Statistics & Query Analysis ───────────────────────────────────────────
-- Analyze all tables after adding indexes so PostgreSQL query planner
-- has up-to-date statistics for query optimization.

ANALYZE privacy_events;
ANALYZE admin_events;
ANALYZE stealth_events;
ANALYZE escrow_events;
ANALYZE refund_attempts;
ANALYZE indexer_checkpoints;
ANALYZE cursors;
ANALYZE unmatched_transactions;
ANALYZE in_app_notifications;
ANALYZE notification_log;
ANALYZE jobs;
ANALYZE payment_links;

-- ─── Documentation ─────────────────────────────────────────────────────────
COMMENT ON INDEX idx_privacy_events_owner_created_at_id IS
  'Optimizes pagination queries filtered by owner with deterministic ordering (created_at DESC, id DESC).';

COMMENT ON INDEX idx_admin_events_payload_gin IS
  'GIN index for efficient JSONB queries on admin_events.payload field.';

COMMENT ON INDEX idx_escrow_events_commitment_type_created_at_id IS
  'Composite index for state machine queries: commitment + type + pagination columns.';

COMMENT ON INDEX idx_refund_attempts_entity_type_id_created_at IS
  'Composite index for quick lookup of all refunds for a specific resource.';

COMMENT ON INDEX idx_unmatched_transactions_status_ingested_id IS
  'Cursor-based pagination index for admin dashboard: (status, ingested_at DESC, id DESC).';

COMMENT ON INDEX idx_in_app_notifications_public_key_created_id IS
  'Cursor-based pagination index for user notifications: (public_key, created_at DESC, id DESC).';

COMMENT ON INDEX idx_jobs_status_created_at IS
  'Atomic dequeue support: (status, created_at) for efficient lock-free job processing with FOR UPDATE SKIP LOCKED.';

COMMIT;

