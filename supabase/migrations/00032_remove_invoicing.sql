-- =============================================================================
-- Migration 00032: Invoicing leaves the product
-- =============================================================================
-- Product decision (Marco, 2026-10-16): invoices are created in ServiceTitan.
-- PlumbTix reports problems and dispatches to them; a work order ends at
-- "Completed".
--
-- What this does
--   • enforce_ticket_status_transition(): completed → invoiced is gone;
--     `completed` is now a terminal status like cancelled.
--   • tickets.invoice_number is no longer written by the app (update-ticket
--     ignores it). The column and the 'invoiced' enum value STAY so historic
--     rows keep their data and nothing that reads them breaks. Both are
--     marked deprecated.
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

    -- proroto_admin: full lifecycle; the work order ends at completed
    IF caller_role = 'proroto_admin' THEN
        CASE OLD.status
            WHEN 'new' THEN
                allowed := NEW.status IN ('needs_info', 'scheduled', 'cancelled');
            WHEN 'needs_info' THEN
                allowed := NEW.status IN ('new', 'scheduled', 'cancelled');
            WHEN 'scheduled' THEN
                allowed := NEW.status IN ('dispatched', 'needs_info', 'cancelled');
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

    -- pm_admin: information triage only (00028)
    ELSIF caller_role = 'pm_admin' THEN
        CASE OLD.status
            WHEN 'new' THEN
                allowed := NEW.status IN ('needs_info');
            WHEN 'needs_info' THEN
                allowed := NEW.status IN ('new');
            ELSE
                allowed := false;
        END CASE;

    -- pm_user: answer an information request (00028)
    ELSIF caller_role = 'pm_user' THEN
        CASE OLD.status
            WHEN 'needs_info' THEN
                allowed := NEW.status IN ('new');
            ELSE
                allowed := false;
        END CASE;

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

COMMENT ON COLUMN public.tickets.invoice_number IS
    'DEPRECATED (00032): invoices live in ServiceTitan. Kept for historic rows; the app no longer writes it.';

-- ---------------------------------------------------------------------------
-- Verification:
--   SELECT prosrc LIKE '%the work order ends at completed%'
--     FROM pg_proc WHERE proname = 'enforce_ticket_status_transition';  -- true
--   SELECT count(*) FROM tickets WHERE status = 'invoiced';  -- historic rows only
-- ---------------------------------------------------------------------------
