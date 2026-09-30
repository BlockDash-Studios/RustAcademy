-- Migration 003: Time-locked tutor escrow (BE-050)
--
-- Durable representation of the in-memory EscrowPayoutService. The NestJS
-- services are currently in-memory; this schema is what a future repository
-- layer targets.
--
-- Design notes
-- ─────────────
-- • Amounts are BIGINT in stroops (1 XLM = 10^7 stroops) — the indivisible
--   unit, mirroring the in-memory bigint handling.
-- • accrual_id is the client-supplied idempotency key; UNIQUE per tutor so a
--   replayed accrual is rejected by the database too.
-- • unlocks_at is frozen at accrual time (computed from the tutor's schedule
--   in effect then), so later schedule changes cannot shift existing rows.
-- • state is enforced by CHECK; the transition locked → released is one-way.

-- ── Escrow entries ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tutor_escrow_entries (
  escrow_id      TEXT PRIMARY KEY,
  tutor_id       TEXT NOT NULL,
  amount_stroops BIGINT NOT NULL CHECK (amount_stroops > 0),
  accrued_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unlocks_at     TIMESTAMPTZ NOT NULL,
  state          TEXT NOT NULL DEFAULT 'locked' CHECK (state IN ('locked', 'released')),
  released_at    TIMESTAMPTZ,
  transaction_hash TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tutor_id, escrow_id),
  CHECK (released_at IS NULL OR state = 'released')
);

CREATE INDEX IF NOT EXISTS tutor_escrow_entries_tutor_state_idx ON tutor_escrow_entries (tutor_id, state);
-- Drives the unlock job's "what is due?" scan.
CREATE INDEX IF NOT EXISTS tutor_escrow_entries_state_unlocks_at_idx ON tutor_escrow_entries (state, unlocks_at);

-- ── Withdrawals ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tutor_escrow_withdrawals (
  withdrawal_id  TEXT PRIMARY KEY,
  tutor_id       TEXT NOT NULL,
  amount_stroops BIGINT NOT NULL CHECK (amount_stroops > 0),
  withdrawn_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  transaction_hash TEXT
);

CREATE INDEX IF NOT EXISTS tutor_escrow_withdrawals_tutor_idx ON tutor_escrow_withdrawals (tutor_id);

-- ── Line items: which escrow entries a withdrawal consumed ─────────────────

CREATE TABLE IF NOT EXISTS tutor_escrow_withdrawal_entries (
  withdrawal_id TEXT NOT NULL REFERENCES tutor_escrow_withdrawals(withdrawal_id) ON DELETE CASCADE,
  escrow_id     TEXT NOT NULL REFERENCES tutor_escrow_entries(escrow_id),
  amount_stroops BIGINT NOT NULL CHECK (amount_stroops > 0),
  PRIMARY KEY (withdrawal_id, escrow_id)
);
