-- =============================================================================
-- Migration 00035: "Needs Info" leaves the workflow
-- =============================================================================
-- Product decision (Marco, 2026-11-12): whoever opens a work order provides
-- all the information. If Pro Roto needs more, Pro Roto calls. Customers use
-- the system as little as possible — to report problems, nothing else.
--
-- What this does
--   • enforce_ticket_status_transition():
--       - new → needs_info and scheduled → needs_info are gone.
--       - Customer roles (pm_admin, pm_user) can no longer change a work
--         order's status at all. Their only transitions were the Needs Info
--         ones (00028). Every status change is now Pro Roto's.
--       - A historic row still sitting in 'needs_info' can be moved out by
--         Pro Roto only (→ new, scheduled, cancelled), so nothing is stuck.
--   • The 'needs_info' enum value STAYS so historic rows and the audit trail
--     keep their data and nothing that reads them breaks. It is legacy, like
--     'invoiced' (00032): no longer reachable.
--   • Every other transition is unchanged.
--
-- MUST match: shared/types/transitions.ts + supabase/functions/update-ticket.
-- Idempotent.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.enforce_ticket_status_transition()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, auth, pg_temp
LANGUAGE plpgsql
AS $$
DECLARE
    caller_role public.user_role;
    allowed     boolean := false;
BEGIN
    IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
        RETURN NEW;
    END IF;

    BEGIN
        SELECT role INTO caller_role
        FROM public.users
        WHERE id = auth.uid();
    EXCEPTION WHEN OTHERS THEN
        RETURN NEW;
    END;

    IF caller_role IS NULL THEN
        RETURN NEW;
    END IF;

    -- Terminal states. 'invoiced' is legacy (no longer reachable) but still
    -- terminal for any historic row.
    IF OLD.status IN ('completed', 'invoiced', 'cancelled') THEN
        RAISE EXCEPTION 'Cannot transition from terminal status: %', OLD.status
            USING ERRCODE = 'P0001';
    END IF;

    -- proroto_admin: the only role that changes a status (00035).
    -- 'needs_info' is legacy: nothing moves INTO it; a historic row can be
    -- moved out.
    IF caller_role = 'proroto_admin' THEN
        CASE OLD.status
            WHEN 'new' THEN
                allowed := NEW.status IN ('scheduled', 'cancelled');
            WHEN 'needs_info' THEN
                allowed := NEW.status IN ('new', 'scheduled', 'cancelled');
            WHEN 'scheduled' THEN
                allowed := NEW.status IN ('dispatched', 'cancelled');
            WHEN 'dispatched' THEN
                allowed := NEW.status IN ('on_site', 'scheduled', 'cancelled');
            WHEN 'on_site' THEN
                allowed := NEW.status IN ('in_progress', 'cancelled');
            WHEN 'in_progress' THEN
                allowed := NEW.status IN ('waiting_approval', 'completed', 'cancelled');
            WHEN 'waiting_approval' THEN
                allowed := NEW.status IN ('scheduled', 'in_progress', 'cancelled');
            ELSE
                allowed := false;
        END CASE;

    -- pm_admin, pm_user, resident: no status changes (00035)
    ELSE
        allowed := false;
    END IF;

    IF NOT allowed THEN
        RAISE EXCEPTION 'Status transition from "%" to "%" is not permitted for role "%"',
            OLD.status, NEW.status, caller_role
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Verification:
--   SELECT prosrc LIKE '%the only role that changes a status (00035)%'
--     FROM pg_proc WHERE proname = 'enforce_ticket_status_transition';  -- true
--   SELECT count(*) FROM tickets WHERE status = 'needs_info';
--   -- historic rows only (0 expected today); Pro Roto can move each one out
--   As a pm_admin session, on a 'new' work order in their company:
--     UPDATE tickets SET status = 'needs_info' WHERE id = '<id>';
--   -- ERROR P0001: Status transition from "new" to "needs_info" is not
--   --   permitted for role "pm_admin"
--   As a proroto_admin session: new → scheduled succeeds;
--     new → needs_info fails with the same error.
-- ---------------------------------------------------------------------------
