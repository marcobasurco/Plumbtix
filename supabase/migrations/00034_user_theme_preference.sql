-- =============================================================================
-- Migration 00034: Light / dark theme saved on the user's profile
-- =============================================================================
-- Product decision (Marco, 2026-11-12): the app opens in daylight (light) by
-- default. If a person switches to dark, that choice is kept on their profile
-- so it follows them to any device after they sign in.
--
-- What this does
--   • users.theme_preference: 'light' (default) or 'dark'. Existing users get
--     'light'.
--   • No new policy or grant: a person changes it through the existing
--     users_update_own policy (the same path as phone / SMS settings, a
--     sanctioned self-profile write). trg_protect_user_identity (00027) is
--     unchanged — role, company_id, email and id stay locked.
--
-- Idempotent.
-- =============================================================================

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS theme_preference TEXT NOT NULL DEFAULT 'light';

ALTER TABLE public.users
    DROP CONSTRAINT IF EXISTS users_theme_preference_check;
ALTER TABLE public.users
    ADD CONSTRAINT users_theme_preference_check
    CHECK (theme_preference IN ('light', 'dark'));

COMMENT ON COLUMN public.users.theme_preference IS
    'Screen theme the person chose: light (default, "daylight") or dark. Set by the person from the header toggle.';

-- ---------------------------------------------------------------------------
-- Verification:
--   SELECT column_name, data_type, column_default, is_nullable
--     FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'users'
--      AND column_name = 'theme_preference';
--   -- theme_preference | text | 'light'::text | NO
--   SELECT theme_preference, count(*) FROM public.users GROUP BY 1;
--   -- every existing user: light
--   SELECT conname FROM pg_constraint WHERE conname = 'users_theme_preference_check';
--   -- 1 row
-- ---------------------------------------------------------------------------
