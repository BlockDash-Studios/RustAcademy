-- Performance Optimization SQL for Supabase
-- This file contains index optimizations and query performance improvements

-- ============================================================================
-- RECURRING PAYMENT LINKS TABLE OPTIMIZATIONS
-- ============================================================================

-- Index for fetching links due for execution (most critical query)
CREATE INDEX IF NOT EXISTS idx_recurring_links_due_execution 
ON recurring_payment_links(status, next_execution_date) 
WHERE status = 'active';

-- Index for listing links by owner/status
CREATE INDEX IF NOT EXISTS idx_recurring_links_owner_status 
ON recurring_payment_links(username, status, created_at DESC);

-- Index for filtering by destination/asset
CREATE INDEX IF NOT EXISTS idx_recurring_links_destination_asset 
ON recurring_payment_links(destination, asset);

-- ============================================================================
-- RECURRING PAYMENT EXECUTIONS TABLE OPTIMIZATIONS
-- ============================================================================

-- Index for fetching executions by link ID
CREATE INDEX IF NOT EXISTS idx_recurring_executions_link_id 
ON recurring_payment_executions(recurring_link_id, created_at DESC);

-- Index for finding pending executions
CREATE INDEX IF NOT EXISTS idx_recurring_executions_status 
ON recurring_payment_executions(status, scheduled_at) 
WHERE status = 'pending';

-- Index for retry logic
CREATE INDEX IF NOT EXISTS idx_recurring_executions_retry 
ON recurring_payment_executions(status, retry_count, last_retry_at) 
WHERE status IN ('failed', 'pending');

-- ============================================================================
-- API KEYS TABLE OPTIMIZATIONS
-- ============================================================================

-- Index for API key lookups (frequent read)
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash 
ON api_keys(key_hash);

-- Index for owner queries
CREATE INDEX IF NOT EXISTS idx_api_keys_owner 
ON api_keys(owner_id, created_at DESC);

-- ============================================================================
-- NOTIFICATION PREFERENCES TABLE OPTIMIZATIONS
-- ============================================================================

-- Index for user notification preferences
CREATE INDEX IF NOT EXISTS idx_notification_preferences_user 
ON notification_preferences(user_id, provider);

-- Index for rate limiting queries
CREATE INDEX IF NOT EXISTS idx_notification_logs_provider_time 
ON notification_logs(provider, created_at DESC);

-- ============================================================================
-- NOTIFICATION LOGS TABLE OPTIMIZATIONS
-- ============================================================================

-- Index for recent logs by provider
CREATE INDEX IF NOT EXISTS idx_notification_logs_recent 
ON notification_logs(provider, created_at DESC);

-- Index for user notification history
CREATE INDEX IF NOT EXISTS idx_notification_logs_user 
ON notification_logs(user_id, created_at DESC);

-- ============================================================================
-- CURSOR TRACKING TABLE OPTIMIZATIONS (for event ingestion)
-- ============================================================================

-- Index for cursor lookups by source
CREATE INDEX IF EXISTS idx_cursor_repository_source_cursor_type
ON cursor_repository(source, cursor_type);

-- ============================================================================
-- ESCROW EVENTS TABLE OPTIMIZATIONS
-- ============================================================================

-- Index for event lookups by contract
CREATE INDEX IF NOT EXISTS idx_escrow_events_contract_id 
ON escrow_events(contract_id, block_timestamp DESC);

-- Index for event filtering by type
CREATE INDEX IF NOT EXISTS idx_escrow_events_type 
ON escrow_events(event_type, block_timestamp DESC);

-- ============================================================================
-- QUERY PERFORMANCE TIPS
-- ============================================================================

-- For Supabase, enable query performance monitoring:
-- 1. Use EXPLAIN ANALYZE to identify slow queries
-- 2. Monitor p95/p99 query times in Supabase dashboard
-- 3. Consider connection pooling for high-traffic endpoints

-- Recommended connection pool settings for Supabase:
-- max_connections: 20-50 based on workload
-- statement_timeout: 30s for regular queries, 5min for batch operations

-- ============================================================================
-- CACHING STRATEGY RECOMMENDATIONS
-- ============================================================================

-- 1. Cache frequently accessed data with TTL:
--    - API key lookups: 5-15 minutes
--    - User preferences: 15-30 minutes
--    - Asset lists: 1 hour
--    - Transaction counts: 1-5 minutes

-- 2. Use Redis or Supabase Edge Functions caching:
--    - Horizon responses can be cached briefly
--    - Rate limiting counters should use atomic operations

-- 3. Implement cache invalidation:
--    - Invalidate on write operations
--    - Use event-driven cache updates when possible