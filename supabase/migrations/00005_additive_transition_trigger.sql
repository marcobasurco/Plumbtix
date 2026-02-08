-- ============================================================================
-- MIGRATION 00005 — ADDITIVE — STATUS TRANSITION ENFORCEMENT TRIGGER
-- ============================================================================
--
-- PlumbTix — Pro Roto Work Orders Portal
--
-- Purpose:
--   Enforce the ticket status transition matrix at the database level.
--   This is a "seatbelt" trigger that prevents invalid status transitions
--   even if a client bypasses Edge Functions and PATCHes directly via PostgREST.
--
-- Relationship to locked sections:
--   • Does NOT modify any Section 4 objects (tables, columns, constraints, indexes)
--   • Does NOT modify any Section 5 objects (existing triggers, functions, RLS policies)
--   • Does NOT modify any Section 6 objects (storage bucket, storage policies)
--   • Does NOT modify any Section 7 objects (seed data)
--
-- This migration is PURELY ADDITIVE:
--   ✓ 1 new function: enforce_ticket_status_transition()
--   ✓ 1 new trigger:  trg_tickets_enforce_transition (BEFORE UPDATE OF status)
--
-- Firing order on tickets UPDATE:
--   1. trg_tickets_enforce_transition  (this — BEFORE UPDATE — validates)
--   2. trg_tickets_updated_at          (Section 5 — BEFORE UPDATE — sets updated_at)
--   3. trg_tickets_status_log          (Section 5 — AFTER UPDATE  — logs to audit)
--
-- Transition matrix rules:
--   • proroto_admin: full lifecycle control
--   • pm_admin / pm_user: cancel in early stages, approve/decline in waiting_approval
--   • resident: no status transitions permitted
--   • Terminal states (invoiced, cancelled): no outbound transitions
--
-- Service role bypass:
--   If no authenticated user is found (Edge Functions using service key,
--   migrations, or manual admin ops), the transition is ALLOWED.
--   This ensures system-level operations are not blocked.
--
-- ============================================================================

-- ---------------------------------------------------------------------------
-- A) TRANSITION ENFORCEMENT FUNCTION
-- ---------------------------------------------------------------------------

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
    -- Only fire when status actually changes
    IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
        RETURN NEW;
    END IF;

    -- Look up caller role from public.users via auth.uid().
    -- If no authenticated user (service role, migration, etc.), allow the
    -- transition — Edge Functions use the service key for system operations.
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

    -- ─── Terminal states: no outbound transitions ───
    IF OLD.status IN ('invoiced', 'cancelled') THEN
        RAISE EXCEPTION 'Cannot transition from terminal status: %', OLD.status
            USING ERRCODE = 'P0001';
    END IF;

    -- ─── proroto_admin: full lifecycle ───
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

    -- ─── pm_admin / pm_user: limited transitions ───
    ELSIF caller_role IN ('pm_admin', 'pm_user') THEN
        CASE OLD.status
            WHEN 'new' THEN
                allowed := NEW.status IN ('cancelled');
            WHEN 'needs_info' THEN
                allowed := NEW.status IN ('new', 'cancelled');
            WHEN 'waiting_approval' THEN
                allowed := NEW.status IN ('scheduled', 'cancelled');
            ELSE
                allowed := false;
        END CASE;

    -- ─── resident: no transitions ───
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

-- ---------------------------------------------------------------------------
-- B) TRIGGER (BEFORE UPDATE — fires before Section 5 triggers)
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_tickets_enforce_transition ON tickets;
CREATE TRIGGER trg_tickets_enforce_transition
    BEFORE UPDATE OF status ON tickets
    FOR EACH ROW
    EXECUTE FUNCTION enforce_ticket_status_transition();

-- ============================================================================
-- C) VERIFICATION
-- ============================================================================
--
-- V.1 Function exists
-- SELECT proname, prosecdef FROM pg_proc
--   WHERE pronamespace = 'public'::regnamespace
--     AND proname = 'enforce_ticket_status_transition';
-- Expected: 1 row, prosecdef = true
--
-- V.2 Trigger exists
-- SELECT tgname FROM pg_trigger
--   WHERE tgrelid = 'public.tickets'::regclass
--     AND tgname = 'trg_tickets_enforce_transition';
-- Expected: 1 row
--
-- V.3 Total triggers = 9 (Section 5's 8 + this 1)
-- SELECT COUNT(*) FROM pg_trigger
--   WHERE tgrelid IN (
--     SELECT oid FROM pg_class WHERE relnamespace = 'public'::regnamespace
--   ) AND NOT tgisinternal;
-- Expected: 9
--
-- V.4 Total SECURITY DEFINER functions = 8 (Section 5's 7 + this 1)
-- SELECT COUNT(*) FROM pg_proc
--   WHERE pronamespace = 'public'::regnamespace AND prosecdef = true;
-- Expected: 8
--
-- V.5 Section 4 indexes unchanged
-- SELECT COUNT(*) FROM pg_indexes
--   WHERE schemaname = 'public' AND indexname LIKE 'idx_%';
-- Expected: 28
--
-- V.6 Section 5 RLS policies unchanged
-- SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public';
-- Expected: 41
--
-- ============================================================================
