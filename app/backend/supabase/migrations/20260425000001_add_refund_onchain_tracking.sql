-- =============================================================================
-- Refund on-chain tracking fields (BE-12 follow-up)
-- =============================================================================
-- Adds fields to track on-chain transaction state and retry metadata
-- =============================================================================

-- ---------------------------------------------------------------------------
-- refund_attempts - add on-chain tracking columns
-- ---------------------------------------------------------------------------

ALTER TABLE IF EXISTS refund_attempts
  ADD COLUMN IF NOT EXISTS on_chain_tx_hash TEXT,
  ADD COLUMN IF NOT EXISTS contract_id TEXT,
  ADD COLUMN IF NOT EXISTS network TEXT,
  ADD COLUMN IF NOT EXISTS failure_reason TEXT,
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_retryable BOOLEAN NOT NULL DEFAULT true;

-- Update status check constraint to include new states
ALTER TABLE IF EXISTS refund_attempts
  DROP CONSTRAINT IF EXISTS refund_attempts_status_check,
  ADD CONSTRAINT refund_attempts_status_check
  CHECK (status IN ('pending', 'approved', 'submitted', 'confirmed', 'failed', 'rejected'));

-- Create index for querying by on-chain transaction hash
CREATE INDEX IF NOT EXISTS idx_refund_attempts_tx_hash
  ON refund_attempts (on_chain_tx_hash)
  WHERE on_chain_tx_hash IS NOT NULL;

-- Create index for querying by contract_id
CREATE INDEX IF NOT EXISTS idx_refund_attempts_contract_id
  ON refund_attempts (contract_id)
  WHERE contract_id IS NOT NULL;