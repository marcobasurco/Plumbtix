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
--   • A person changes it through the existing users_update_own policy (the
--     same path as phone / SMS settings, a sanctioned self-profile write).
--   • Each member keeps their own theme (Marco, 2026-11-12): a new trigger,
--     trg_protect_user_theme, rejects a change to someone else's
--     theme_preference from any signed-in session — company Admins and
--     Pro Roto admins included. Without it, pm_admin_manage_company_users
--     (FOR ALL, company-scoped) would let an Admin change a staff member's.
--   • trg_protect_user_identity (00027) is unchanged — role, company_id,
--     email and id stay locked.
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
-- Only the person themself may change their theme.
-- Service role / SQL editor (auth.role() <> 'authenticated') pass through.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_user_theme_preference()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, auth, pg_temp
AS $$
BEGIN
    IF COALESCE(auth.role(), '') = 'authenticated'
       AND NEW.theme_preference IS DISTINCT FROM OLD.theme_preference
       AND OLD.id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'A theme can only be changed by the person it belongs to'
            USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_user_theme ON public.users;
CREATE TRIGGER trg_protect_user_theme
    BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.protect_user_theme_preference();

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
--   SELECT tgname FROM pg_trigger WHERE tgname = 'trg_protect_user_theme';
--   -- 1 row
--   As a pm_admin session, on a colleague in the same company:
--     UPDATE users SET theme_preference = 'dark' WHERE id = '<colleague id>';
--   -- ERROR 42501: A theme can only be changed by the person it belongs to
--   As any session, on your own row: succeeds.
-- ---------------------------------------------------------------------------
