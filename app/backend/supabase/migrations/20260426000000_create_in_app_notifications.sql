-- =============================================================================
-- Notification Engine v2: In-App Notifications
-- =============================================================================

-- 1. Update the CHECK constraint on notification_preferences to include 'in_app'
ALTER TABLE notification_preferences
DROP CONSTRAINT IF EXISTS notification_preferences_channel_check;

ALTER TABLE notification_preferences
ADD CONSTRAINT notification_preferences_channel_check
CHECK (channel IN ('email', 'push', 'webhook', 'telegram', 'in_app'));

COMMENT ON COLUMN notification_preferences.channel IS 
  'Notification channel: email, push, webhook, telegram, or in_app';

-- 2. Create in_app_notifications table
CREATE TABLE IF NOT EXISTS in_app_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  public_key TEXT NOT NULL,                -- Stellar public key of the user
  event_type TEXT NOT NULL,                -- e.g. 'payment.received'
  event_id TEXT NOT NULL,                  -- paging_token or tx_hash
  
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Idempotency: don't store same event twice for the same user
  CONSTRAINT in_app_notifications_unique UNIQUE (public_key, event_type, event_id)
);

-- 3. Indexes for performance
CREATE INDEX IF NOT EXISTS in_app_notifications_public_key_idx 
  ON in_app_notifications (public_key);

CREATE INDEX IF NOT EXISTS in_app_notifications_is_read_idx 
  ON in_app_notifications (is_read);

CREATE INDEX IF NOT EXISTS in_app_notifications_occurred_at_idx 
  ON in_app_notifications (occurred_at DESC);

-- 4. Auto-update updated_at (not really needed as we don't update title/body, 
-- but maybe we add updated_at later)
-- For now, just mark read status change if we wanted to track it, but is_read is enough.

COMMENT ON TABLE in_app_notifications IS
  'Stores notifications to be displayed within the application UI.';
