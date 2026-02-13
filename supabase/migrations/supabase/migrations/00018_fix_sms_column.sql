-- =============================================================================
-- Migration 00018: Fix missing sms_notifications_enabled column
-- =============================================================================
-- Migration 00017 was tracked as applied but the column was not created.
-- This migration safely re-applies the column using IF NOT EXISTS.
-- =============================================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS sms_notifications_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.users.sms_notifications_enabled
  IS 'When true AND phone is set, user receives SMS for high-urgency events.';
