-- =============================================================================
-- Migration 00014: Audit Log Table
-- =============================================================================
-- Logs every invite/resend action with user_id, action, details, and count.
-- Used by Email/Invite Safeguards (Improvement 1).
-- =============================================================================

BEGIN;

-- Lock schema version
DO $$ BEGIN RAISE NOTICE 'Running migration 00014_audit_log'; END $$;

CREATE TABLE IF NOT EXISTS public.audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  details     JSONB DEFAULT '{}',
  count       INTEGER DEFAULT 0
);

-- Index for querying by user and action
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON public.audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON public.audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON public.audit_log(created_at DESC);

-- RLS: only proroto_admin can read audit logs; edge functions insert via service role
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_log_admin_read ON public.audit_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.role = 'proroto_admin'
    )
  );

-- Service role can always insert (no policy needed — it bypasses RLS)

COMMIT;
