-- ============================================================================
-- MIGRATION 00024 — ADDITIVE — TICKET AUDIT TRAIL
-- ============================================================================
--
-- Field-level change history for work orders, captured by a database trigger
-- so it CANNOT be bypassed by application code, edge functions, or direct
-- PostgREST writes. One row per changed field per UPDATE, with before/after
-- values, the acting user, and a timestamp.
--
-- Why at the DB layer: for litigation/discovery purposes, "the database
-- recorded it automatically on every write path" is a materially stronger
-- statement than "the application was supposed to log it."
--
-- Scope:
--   • INSERT  → one '__created__' row
--   • UPDATE  → one row per audited column that actually changed
--   • Audited: status, severity, issue_type, description, access_instructions,
--     assigned_technician, scheduled_date, scheduled_time_window,
--     quote_amount, invoice_number, public_enabled,
--     public_token (values MASKED — tokens never stored in the audit trail)
--   • changed_by = auth.uid(); NULL for service-role writes (rendered as
--     "System" in the UI — e.g. toggle-public-sharing's service write)
--
-- Access: proroto_admin SELECT only. Inserts happen inside a SECURITY DEFINER
-- trigger function, so no INSERT policy is needed for any role.
--
-- PURELY ADDITIVE: 1 table + 1 policy + 1 function + 2 triggers.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- A) TABLE
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ticket_audit_log (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id  UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
    changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    field      TEXT NOT NULL,
    old_value  TEXT,
    new_value  TEXT
);

CREATE INDEX IF NOT EXISTS idx_ticket_audit_ticket
    ON public.ticket_audit_log (ticket_id, changed_at DESC);

COMMENT ON TABLE public.ticket_audit_log IS
    'Field-level work order change history, written by trg_audit_ticket_* triggers. Tamper-resistant: no app write path can skip it.';

-- ---------------------------------------------------------------------------
-- B) RLS — proroto_admin read-only
-- ---------------------------------------------------------------------------

ALTER TABLE public.ticket_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "proroto_admin_read_ticket_audit" ON public.ticket_audit_log;
CREATE POLICY "proroto_admin_read_ticket_audit" ON public.ticket_audit_log
    FOR SELECT
    USING (is_proroto_admin());

-- No INSERT/UPDATE/DELETE policies: the trigger function below is
-- SECURITY DEFINER and writes as its owner; end users cannot modify history.

-- ---------------------------------------------------------------------------
-- C) TRIGGER FUNCTION
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.audit_ticket_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    actor UUID := auth.uid();  -- NULL under service role → "System"
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.ticket_audit_log (ticket_id, changed_by, field, old_value, new_value)
        VALUES (NEW.id, actor, '__created__', NULL, 'Ticket #' || NEW.ticket_number::text);
        RETURN NEW;
    END IF;

    -- UPDATE: one audit row per changed, audited column
    IF NEW.status IS DISTINCT FROM OLD.status THEN
        INSERT INTO public.ticket_audit_log (ticket_id, changed_by, field, old_value, new_value)
        VALUES (NEW.id, actor, 'status', OLD.status::text, NEW.status::text);
    END IF;

    IF NEW.severity IS DISTINCT FROM OLD.severity THEN
        INSERT INTO public.ticket_audit_log (ticket_id, changed_by, field, old_value, new_value)
        VALUES (NEW.id, actor, 'severity', OLD.severity::text, NEW.severity::text);
    END IF;

    IF NEW.issue_type IS DISTINCT FROM OLD.issue_type THEN
        INSERT INTO public.ticket_audit_log (ticket_id, changed_by, field, old_value, new_value)
        VALUES (NEW.id, actor, 'issue_type', OLD.issue_type::text, NEW.issue_type::text);
    END IF;

    IF NEW.description IS DISTINCT FROM OLD.description THEN
        INSERT INTO public.ticket_audit_log (ticket_id, changed_by, field, old_value, new_value)
        VALUES (NEW.id, actor, 'description', OLD.description, NEW.description);
    END IF;

    IF NEW.access_instructions IS DISTINCT FROM OLD.access_instructions THEN
        INSERT INTO public.ticket_audit_log (ticket_id, changed_by, field, old_value, new_value)
        VALUES (NEW.id, actor, 'access_instructions', OLD.access_instructions, NEW.access_instructions);
    END IF;

    IF NEW.assigned_technician IS DISTINCT FROM OLD.assigned_technician THEN
        INSERT INTO public.ticket_audit_log (ticket_id, changed_by, field, old_value, new_value)
        VALUES (NEW.id, actor, 'assigned_technician', OLD.assigned_technician, NEW.assigned_technician);
    END IF;

    IF NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date THEN
        INSERT INTO public.ticket_audit_log (ticket_id, changed_by, field, old_value, new_value)
        VALUES (NEW.id, actor, 'scheduled_date', OLD.scheduled_date::text, NEW.scheduled_date::text);
    END IF;

    IF NEW.scheduled_time_window IS DISTINCT FROM OLD.scheduled_time_window THEN
        INSERT INTO public.ticket_audit_log (ticket_id, changed_by, field, old_value, new_value)
        VALUES (NEW.id, actor, 'scheduled_time_window', OLD.scheduled_time_window, NEW.scheduled_time_window);
    END IF;

    IF NEW.quote_amount IS DISTINCT FROM OLD.quote_amount THEN
        INSERT INTO public.ticket_audit_log (ticket_id, changed_by, field, old_value, new_value)
        VALUES (NEW.id, actor, 'quote_amount', OLD.quote_amount::text, NEW.quote_amount::text);
    END IF;

    IF NEW.invoice_number IS DISTINCT FROM OLD.invoice_number THEN
        INSERT INTO public.ticket_audit_log (ticket_id, changed_by, field, old_value, new_value)
        VALUES (NEW.id, actor, 'invoice_number', OLD.invoice_number, NEW.invoice_number);
    END IF;


    IF NEW.public_enabled IS DISTINCT FROM OLD.public_enabled THEN
        INSERT INTO public.ticket_audit_log (ticket_id, changed_by, field, old_value, new_value)
        VALUES (NEW.id, actor, 'public_enabled', OLD.public_enabled::text, NEW.public_enabled::text);
    END IF;

    -- Token values are secrets: record THAT it changed, never WHAT it is
    IF NEW.public_token IS DISTINCT FROM OLD.public_token THEN
        INSERT INTO public.ticket_audit_log (ticket_id, changed_by, field, old_value, new_value)
        VALUES (NEW.id, actor, 'public_token',
                CASE WHEN OLD.public_token IS NULL THEN NULL ELSE '[token]' END,
                CASE WHEN NEW.public_token IS NULL THEN NULL ELSE '[new token]' END);
    END IF;

    RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- D) TRIGGERS
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_audit_ticket_insert ON public.tickets;
CREATE TRIGGER trg_audit_ticket_insert
    AFTER INSERT ON public.tickets
    FOR EACH ROW
    EXECUTE FUNCTION public.audit_ticket_changes();

DROP TRIGGER IF EXISTS trg_audit_ticket_update ON public.tickets;
CREATE TRIGGER trg_audit_ticket_update
    AFTER UPDATE ON public.tickets
    FOR EACH ROW
    EXECUTE FUNCTION public.audit_ticket_changes();
