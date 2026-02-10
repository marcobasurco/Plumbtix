-- =============================================================================
-- Work Orders — Migration 00013: Email Notification Infrastructure
-- =============================================================================
-- Tables:
--   1. notification_preferences — per-user email opt-in/out
--   2. email_log — audit trail of sent emails (Resend ID + status)
-- =============================================================================

-- ─── 1. Notification Preferences ─────────────────────────────────────────────
-- Each row = one user's preference for one notification type.
-- Default: all notifications ON (absence = enabled).

CREATE TABLE IF NOT EXISTS notification_preferences (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notification_type VARCHAR(50) NOT NULL,
    enabled          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, notification_type)
);

COMMENT ON TABLE notification_preferences IS 'Per-user email notification opt-in/out. Absence = enabled by default.';
COMMENT ON COLUMN notification_preferences.notification_type IS 'One of: new_ticket, status_change, comment, invitation, weekly_digest';

-- RLS: users can read/update their own preferences
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own preferences" ON notification_preferences
    FOR ALL USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- ─── 2. Email Log ───────────────────────────────────────────────────────────
-- Audit trail for debugging deliverability. Service-role INSERT only.

CREATE TABLE IF NOT EXISTS email_log (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resend_id         VARCHAR(255),
    notification_type VARCHAR(50) NOT NULL,
    recipient_email   VARCHAR(255) NOT NULL,
    subject           VARCHAR(500),
    status            VARCHAR(20) NOT NULL DEFAULT 'sent',
    related_ticket_id UUID REFERENCES tickets(id) ON DELETE SET NULL,
    related_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
    error_message     TEXT,
    metadata          JSONB DEFAULT '{}',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE email_log IS 'Audit log of emails sent via Resend. Service-role writes only.';

CREATE INDEX IF NOT EXISTS idx_email_log_recipient ON email_log(recipient_email);
CREATE INDEX IF NOT EXISTS idx_email_log_ticket ON email_log(related_ticket_id) WHERE related_ticket_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_log_created ON email_log(created_at DESC);

-- RLS: admin read-only, no public access
ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read email log" ON email_log
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'proroto_admin')
    );

-- Service role bypasses RLS for INSERT
-- No INSERT policy needed — edge functions use service client

-- ─── 3. Enable realtime for notification_preferences ─────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
    AND tablename = 'notification_preferences'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notification_preferences;
  END IF;
END $$;
