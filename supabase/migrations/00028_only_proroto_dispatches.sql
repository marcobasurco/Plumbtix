-- =============================================================================
-- Migration 00028: Only Pro Roto dispatches
-- =============================================================================
-- Product decision (Marco, 2026-10-16): property-manager roles report
-- problems and answer Pro Roto's questions. Pro Roto schedules, dispatches,
-- cancels, and takes quote approvals by phone.
--
-- Changes
--   1. protect_ticket_columns(): technician / scheduling columns are now
--      proroto_admin-only (were proroto_admin + pm_admin, migration 00027).
--   2. enforce_ticket_status_transition():
--        pm_admin: keeps new → needs_info and needs_info → new; loses
--                  new → scheduled, needs_info → scheduled,
--                  scheduled → needs_info, waiting_approval → scheduled.
--        pm_user:  needs_info → new ("I've added the info", new — the reporter
--                  answers Pro Roto directly); loses waiting_approval →
--                  scheduled.
--        proroto_admin unchanged.
--
-- MUST match: shared/types/transitions.ts + supabase/functions/update-ticket.
-- Idempotent: CREATE OR REPLACE only; no data changes.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Column protection
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_ticket_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    caller_role public.user_role;
BEGIN
    IF COALESCE(auth.role(), '') <> 'authenticated' THEN
        RETURN NEW;
    END IF;

    SELECT role INTO caller_role FROM public.users WHERE id = auth.uid();

    IF NEW.id                 IS DISTINCT FROM OLD.id
    OR NEW.ticket_number      IS DISTINCT FROM OLD.ticket_number
    OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
    OR NEW.building_id        IS DISTINCT FROM OLD.building_id
    OR NEW.space_id           IS DISTINCT FROM OLD.space_id
    OR NEW.created_at         IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'Ticket identity fields are immutable'
            USING ERRCODE = '42501';
    END IF;

    IF caller_role IS DISTINCT FROM 'proroto_admin'
       AND (NEW.quote_amount   IS DISTINCT FROM OLD.quote_amount
         OR NEW.invoice_number IS DISTINCT FROM OLD.invoice_number) THEN
        RAISE EXCEPTION 'Only Pro Roto can change financial fields'
            USING ERRCODE = '42501';
    END IF;

    -- Only Pro Roto dispatches: technician and scheduling are proroto_admin-only.
    IF caller_role IS DISTINCT FROM 'proroto_admin'
       AND (NEW.assigned_technician   IS DISTINCT FROM OLD.assigned_technician
         OR NEW.technician_id         IS DISTINCT FROM OLD.technician_id
         OR NEW.scheduled_date        IS DISTINCT FROM OLD.scheduled_date
         OR NEW.scheduled_time_window IS DISTINCT FROM OLD.scheduled_time_window) THEN
        RAISE EXCEPTION 'Only Pro Roto can change scheduling fields'
            USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_ticket_columns ON public.tickets;
CREATE TRIGGER trg_protect_ticket_columns
    BEFORE UPDATE ON public.tickets
    FOR EACH ROW EXECUTE FUNCTION public.protect_ticket_columns();

-- ---------------------------------------------------------------------------
-- 2. Status transitions
-- ---------------------------------------------------------------------------
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

    -- Terminal states
    IF OLD.status IN ('invoiced', 'cancelled') THEN
        RAISE EXCEPTION 'Cannot transition from terminal status: %', OLD.status
            USING ERRCODE = 'P0001';
    END IF;

    -- proroto_admin: full lifecycle (unchanged)
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
            WHEN 'completed' THEN
                allowed := NEW.status IN ('invoiced');
            ELSE
                allowed := false;
        END CASE;

    -- pm_admin: information triage only. Never schedules, un-schedules,
    -- approves or cancels — only Pro Roto dispatches; approvals are by phone.
    ELSIF caller_role = 'pm_admin' THEN
        CASE OLD.status
            WHEN 'new' THEN
                allowed := NEW.status IN ('needs_info');
            WHEN 'needs_info' THEN
                allowed := NEW.status IN ('new');
            ELSE
                allowed := false;
        END CASE;

    -- pm_user: answer an information request on a work order they can see
    ELSIF caller_role = 'pm_user' THEN
        CASE OLD.status
            WHEN 'needs_info' THEN
                allowed := NEW.status IN ('new');
            ELSE
                allowed := false;
        END CASE;

    -- resident: no transitions
    ELSIF caller_role = 'resident' THEN
        allowed := false;

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

-- The trigger itself (trg_tickets_enforce_transition, migration 00005) is
-- unchanged; CREATE OR REPLACE swaps the function body in place.

-- ---------------------------------------------------------------------------
-- Verification (run by hand after `supabase db push`):
--   SELECT prosrc LIKE '%Only Pro Roto can change scheduling fields%'
--     FROM pg_proc WHERE proname = 'protect_ticket_columns';            -- true
--   SELECT prosrc LIKE '%approvals are by phone%'
--     FROM pg_proc WHERE proname = 'enforce_ticket_status_transition'; -- true
-- ---------------------------------------------------------------------------
