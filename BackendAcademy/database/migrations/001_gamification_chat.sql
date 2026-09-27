CREATE TABLE IF NOT EXISTS xp_ledger (
  event_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('task.passed', 'course.completed', 'streak.day', 'contribution.created')),
  points INTEGER NOT NULL CHECK (points > 0),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS xp_ledger_user_id_idx ON xp_ledger (user_id);

CREATE TABLE IF NOT EXISTS chat_reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('spam', 'abuse', 'harassment', 'other')),
  details TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chat_reports_status_created_at_idx ON chat_reports (status, created_at);
