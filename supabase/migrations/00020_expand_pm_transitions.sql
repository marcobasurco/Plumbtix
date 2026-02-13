-- =============================================================================
-- Migration 00020: Expand PM role transitions + field access
-- =============================================================================
-- pm_admin can now: schedule, assign technician, set needs_info (NO cancel)
-- pm_user gets: approve waiting_approval only (NO cancel)
-- Must match: shared/types/transitions.ts + update-ticket edge function
-- =============================================================================

CREATE OR REPLACE FUNCTION enforce_ticket_status_transition()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, auth
LANGUAGE plpgsql
AS $$
DECLARE
    caller_role user_role;
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

    -- pm_admin: can schedule and triage, but NOT cancel
    ELSIF caller_role = 'pm_admin' THEN
        CASE OLD.status
            WHEN 'new' THEN
                allowed := NEW.status IN ('needs_info', 'scheduled');
            WHEN 'needs_info' THEN
                allowed := NEW.status IN ('new', 'scheduled');
            WHEN 'scheduled' THEN
                allowed := NEW.status IN ('needs_info');
            WHEN 'waiting_approval' THEN
                allowed := NEW.status IN ('scheduled');
            ELSE
                allowed := false;
        END CASE;

    -- pm_user: approve waiting_approval only, no cancel
    ELSIF caller_role = 'pm_user' THEN
        CASE OLD.status
            WHEN 'waiting_approval' THEN
                allowed := NEW.status IN ('scheduled');
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
