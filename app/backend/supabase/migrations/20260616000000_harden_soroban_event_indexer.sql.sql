-- Up migration script for hardening event indexer checkpointing
BEGIN;

-- Drop or alter old table if it exists as single-primary key
CREATE TABLE IF NOT EXISTS public.indexer_checkpoints (
    contract_id VARCHAR(56) NOT NULL,
    network VARCHAR(50) NOT NULL,
    mode VARCHAR(50) NOT NULL,
    last_ledger BIGINT NOT NULL,
    paging_token VARCHAR(255) NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT indexer_checkpoints_pkey PRIMARY KEY (contract_id, network, mode)
);

-- Index to optimize real-time monitoring and fast lookups
CREATE INDEX IF NOT EXISTS idx_indexer_checkpoints_lookup 
ON public.indexer_checkpoints(contract_id, network, mode);

COMMIT;