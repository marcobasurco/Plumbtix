-- =============================================================================
-- Migration 00016: In-App Notifications
-- =============================================================================
-- Stores in-app notifications for realtime bell icon + unread count.
-- Triggered by status changes and new comments.
-- =============================================================================

BEGIN;

DO $$ BEGIN RAISE NOTICE 'Running migration 00016_in_app_notifications'; END $$;

CREATE TABLE IF NOT EXISTS public.notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,           -- 'status_change', 'new_comment', 'new_ticket'
  title       TEXT NOT NULL,
  body        TEXT,
  ticket_id   UUID REFERENCES public.tickets(id) ON DELETE CASCADE,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications(user_id, read_at)
  WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);

-- RLS: users can only read/update their own notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY notifications_read_own ON public.notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY notifications_update_own ON public.notifications
  FOR UPDATE USING (user_id = auth.uid());

-- Enable realtime for notifications table
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

COMMIT;
