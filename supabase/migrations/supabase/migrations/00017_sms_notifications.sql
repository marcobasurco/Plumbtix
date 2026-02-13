-- =============================================================================
-- Migration 00017: SMS Notification Infrastructure
-- =============================================================================
-- Adds:
--   1. sms_notifications_enabled column to users table
--   2. sms_log audit table (service-role INSERT only)
--
-- Uses existing users.phone column (VARCHAR(20)) for phone numbers.
-- No separate phone_number column needed — phone already exists from 00001.
--
-- LOCKED — do not modify after deployment.
-- =============================================================================

BEGIN;

DO $$ BEGIN RAISE NOTICE 'Running migration 00017_sms_notifications'; END $$;

-- ─── 1. Add SMS opt-in column to users ──────────────────────────────────────

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS sms_notifications_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.users.sms_notifications_enabled
  IS 'When true AND phone is set, user receives SMS for high-urgency events.';

-- ─── 2. SMS Log ─────────────────────────────────────────────────────────────
-- Audit trail for SMS sends. Service-role INSERT only (edge functions).

CREATE TABLE IF NOT EXISTS public.sms_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ticket_id       UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
  phone_number    TEXT NOT NULL,
  message_body    TEXT NOT NULL,
  twilio_sid      TEXT,
  status          TEXT NOT NULL DEFAULT 'sent',  -- sent, failed, sandbox
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.sms_log IS 'Audit log of SMS messages sent via Twilio. Service-role writes only.';

CREATE INDEX IF NOT EXISTS idx_sms_log_user ON public.sms_log(user_id);
CREATE INDEX IF NOT EXISTS idx_sms_log_ticket ON public.sms_log(ticket_id) WHERE ticket_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sms_log_created ON public.sms_log(created_at DESC);

-- RLS: admin read-only, no public access
ALTER TABLE public.sms_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read sms_log" ON public.sms_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'proroto_admin')
  );

-- Service role bypasses RLS for INSERT — no INSERT policy needed.

-- ─── 3. RLS: users can update their own sms_notifications_enabled ───────────
-- The existing users_read_own and users_update_own policies from 00002 already
-- cover self-read and self-update of ALL columns. The new column is automatically
-- included. No additional policies needed.

COMMIT;
