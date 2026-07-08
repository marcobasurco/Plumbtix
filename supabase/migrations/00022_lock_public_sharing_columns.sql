-- ============================================================================
-- MIGRATION 00022 — ADDITIVE — LOCK PUBLIC SHARING COLUMNS TO SERVICE ROLE
-- ============================================================================
-- Closes the gap where any authenticated user with ticket UPDATE rights
-- (e.g. pm_user via the FOR ALL policy) could set public_enabled/public_token
-- directly through PostgREST, bypassing the admin-only role gate in the
-- toggle-public-sharing edge function.
--
-- After this migration, public sharing columns can ONLY be changed by the
-- service role — i.e. through toggle-public-sharing, which enforces
-- proroto_admin/pm_admin + RLS-scoped access before writing.
--
-- PURELY ADDITIVE: 1 function + 1 trigger. No policy or column changes.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_public_sharing_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Only restrict end-user JWTs. Service role and dashboard/SQL access pass.
  IF COALESCE(auth.role(), '') = 'authenticated' THEN

    IF TG_OP = 'UPDATE'
       AND (NEW.public_token   IS DISTINCT FROM OLD.public_token
         OR NEW.public_enabled IS DISTINCT FROM OLD.public_enabled)
    THEN
      RAISE EXCEPTION 'Public sharing settings can only be changed via toggle-public-sharing'
        USING ERRCODE = '42501';
    END IF;

    IF TG_OP = 'INSERT'
       AND (NEW.public_token IS NOT NULL OR NEW.public_enabled IS TRUE)
    THEN
      RAISE EXCEPTION 'Public sharing cannot be enabled at ticket creation'
        USING ERRCODE = '42501';
    END IF;

  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_public_sharing ON public.tickets;
CREATE TRIGGER trg_enforce_public_sharing
  BEFORE INSERT OR UPDATE ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_public_sharing_columns();