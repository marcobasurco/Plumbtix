-- =============================================================================
-- Migration 00030: Emergency acknowledgement + on-call escalation
-- =============================================================================
-- "When Stanford's technician calls for help, we go — doesn't matter if it's
-- midnight." Today an emergency sends one SMS and one email and that's it.
-- This makes the promise enforceable:
--
--   • An emergency work order must be ACKNOWLEDGED by a Pro Roto admin.
--   • Until it is, the on-call roster is paged in order — SMS + phone call —
--     every `wait_minutes`, wrapping around twice before giving up loudly.
--   • A Pro Roto admin acknowledges with one tap ("I'm on it"), or implicitly
--     by changing the status. The reporter is told who is on it.
--
-- Objects
--   on_call_roster              ordered list of Pro Roto admins to page
--   ticket_escalation_log       every page sent (who, channel, result)
--   tickets.acknowledged_at / acknowledged_by_user_id
--   tickets.escalation_step / next_escalation_at / escalation_exhausted_at
--   trg_tickets_emergency_clock arms the clock on insert, auto-acknowledges
--                               on an admin status change, disarms on close
--   trg_protect_escalation_cols only proroto_admin (or service role) may set
--                               the acknowledgement / escalation columns
--   cron job                    every minute: call the escalate-emergencies
--                               edge function (pg_cron + pg_net, URL and
--                               bearer secret from Vault)
--
-- One-time setup after `db push` (dashboard → SQL editor):
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/escalate-emergencies', 'escalation_url');
--   select vault.create_secret('<long random string>', 'escalation_cron_secret');
-- and the same random string as edge-function secret ESCALATION_CRON_SECRET.
-- Until both exist the job runs and does nothing.
--
-- Idempotent.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. On-call roster
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.on_call_roster (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
    position      INTEGER NOT NULL DEFAULT 1,
    wait_minutes  INTEGER NOT NULL DEFAULT 10 CHECK (wait_minutes BETWEEN 1 AND 120),
    active        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.on_call_roster IS
    'Pro Roto admins paged, in order, while an emergency work order is unacknowledged. wait_minutes = how long this person gets before the next is paged.';

CREATE INDEX IF NOT EXISTS idx_on_call_roster_order ON public.on_call_roster (active, position, created_at);

DROP TRIGGER IF EXISTS trg_on_call_roster_updated_at ON public.on_call_roster;
CREATE TRIGGER trg_on_call_roster_updated_at
    BEFORE UPDATE ON public.on_call_roster
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.on_call_roster ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "proroto_admin_all_on_call" ON public.on_call_roster;
CREATE POLICY "proroto_admin_all_on_call" ON public.on_call_roster
    FOR ALL
    USING  (is_proroto_admin())
    WITH CHECK (is_proroto_admin());

-- Roster members must be Pro Roto admins
CREATE OR REPLACE FUNCTION public.trg_on_call_roster_check_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = NEW.user_id AND role = 'proroto_admin') THEN
        RAISE EXCEPTION 'Only Pro Roto admins can be on call' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_on_call_roster_role ON public.on_call_roster;
CREATE TRIGGER trg_on_call_roster_role
    BEFORE INSERT OR UPDATE OF user_id ON public.on_call_roster
    FOR EACH ROW EXECUTE FUNCTION public.trg_on_call_roster_check_role();

-- ---------------------------------------------------------------------------
-- 2. Ticket columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.tickets
    ADD COLUMN IF NOT EXISTS acknowledged_at          TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS acknowledged_by_user_id  UUID REFERENCES public.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS escalation_step          INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS next_escalation_at       TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS escalation_exhausted_at  TIMESTAMPTZ;

COMMENT ON COLUMN public.tickets.acknowledged_at IS 'When a Pro Roto admin took ownership of an emergency (explicit "I''m on it" or first status change).';
COMMENT ON COLUMN public.tickets.next_escalation_at IS 'When the next on-call page is due. NULL = not armed / acknowledged / closed.';
COMMENT ON COLUMN public.tickets.escalation_exhausted_at IS 'Set when the roster was paged through twice with no acknowledgement.';

-- The cron sweep's query
CREATE INDEX IF NOT EXISTS idx_tickets_escalation_due
    ON public.tickets (next_escalation_at)
    WHERE next_escalation_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Page log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ticket_escalation_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id   UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
    step        INTEGER NOT NULL,
    user_id     UUID REFERENCES public.users(id) ON DELETE SET NULL,
    channel     TEXT NOT NULL CHECK (channel IN ('sms', 'call', 'email')),
    ok          BOOLEAN NOT NULL,
    detail      TEXT,
    sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_escalation_log_ticket ON public.ticket_escalation_log (ticket_id, sent_at DESC);

ALTER TABLE public.ticket_escalation_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "proroto_admin_read_escalation_log" ON public.ticket_escalation_log;
CREATE POLICY "proroto_admin_read_escalation_log" ON public.ticket_escalation_log
    FOR SELECT USING (is_proroto_admin());
-- Writes: service role only (the escalation function).

-- ---------------------------------------------------------------------------
-- 4. The emergency clock
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.first_on_call_wait_minutes()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT COALESCE(
        (SELECT wait_minutes FROM public.on_call_roster WHERE active ORDER BY position, created_at LIMIT 1),
        10
    );
$$;

CREATE OR REPLACE FUNCTION public.tickets_emergency_clock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    caller_role public.user_role;
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Arm the clock: if nobody acknowledges within the first wait, page.
        IF NEW.severity = 'emergency' AND NEW.acknowledged_at IS NULL THEN
            NEW.next_escalation_at := NOW() + make_interval(mins => public.first_on_call_wait_minutes());
            NEW.escalation_step := 0;
        END IF;
        RETURN NEW;
    END IF;

    -- UPDATE
    -- Severity raised to emergency after the fact (e.g. keyword detection or
    -- a dispatcher re-triaging): arm the clock now.
    IF NEW.severity = 'emergency' AND OLD.severity IS DISTINCT FROM 'emergency'
       AND NEW.acknowledged_at IS NULL AND NEW.next_escalation_at IS NULL
       AND NEW.status NOT IN ('completed', 'invoiced', 'cancelled') THEN
        NEW.next_escalation_at := NOW() + make_interval(mins => public.first_on_call_wait_minutes());
    END IF;

    -- A Pro Roto admin changing the status IS taking ownership.
    IF NEW.severity = 'emergency' AND NEW.acknowledged_at IS NULL
       AND NEW.status IS DISTINCT FROM OLD.status
       AND COALESCE(auth.role(), '') = 'authenticated' THEN
        SELECT role INTO caller_role FROM public.users WHERE id = auth.uid();
        IF caller_role = 'proroto_admin' THEN
            NEW.acknowledged_at := NOW();
            NEW.acknowledged_by_user_id := auth.uid();
        END IF;
    END IF;

    -- Acknowledged, downgraded, or closed: stop paging.
    IF NEW.acknowledged_at IS NOT NULL
       OR NEW.severity <> 'emergency'
       OR NEW.status IN ('completed', 'invoiced', 'cancelled') THEN
        NEW.next_escalation_at := NULL;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tickets_emergency_clock ON public.tickets;
CREATE TRIGGER trg_tickets_emergency_clock
    BEFORE INSERT OR UPDATE ON public.tickets
    FOR EACH ROW EXECUTE FUNCTION public.tickets_emergency_clock();

-- Only Pro Roto (or the service role) may touch the acknowledgement /
-- escalation columns directly. The clock trigger above runs as definer, so
-- its own writes are unaffected: this fires BEFORE it on the same row, so we
-- compare against the caller's intended values.
CREATE OR REPLACE FUNCTION public.protect_escalation_columns()
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
    IF caller_role IS DISTINCT FROM 'proroto_admin'
       AND (NEW.acknowledged_at         IS DISTINCT FROM OLD.acknowledged_at
         OR NEW.acknowledged_by_user_id IS DISTINCT FROM OLD.acknowledged_by_user_id
         OR NEW.escalation_step         IS DISTINCT FROM OLD.escalation_step
         OR NEW.next_escalation_at      IS DISTINCT FROM OLD.next_escalation_at
         OR NEW.escalation_exhausted_at IS DISTINCT FROM OLD.escalation_exhausted_at) THEN
        RAISE EXCEPTION 'Only Pro Roto can acknowledge an emergency' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_escalation_cols ON public.tickets;
CREATE TRIGGER trg_protect_escalation_cols
    BEFORE UPDATE ON public.tickets
    FOR EACH ROW EXECUTE FUNCTION public.protect_escalation_columns();

-- Trigger order: Postgres fires BEFORE-row triggers alphabetically by name.
--   trg_protect_escalation_cols  (p)  → rejects end-user tampering
--   trg_protect_ticket_columns   (p)  → 00027/00028 rules
--   trg_tickets_emergency_clock  (t)  → then sets the columns itself
-- "trg_p…" < "trg_t…", so the protection runs before the clock mutates NEW.

-- ---------------------------------------------------------------------------
-- 5. Audit: record acknowledgements in the ticket audit trail
-- ---------------------------------------------------------------------------
-- audit_ticket_changes() (00024) only logs listed columns; add ours without
-- rewriting it: a small companion trigger.
CREATE OR REPLACE FUNCTION public.audit_ticket_acknowledgement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.acknowledged_at IS NOT NULL AND OLD.acknowledged_at IS NULL THEN
        INSERT INTO public.ticket_audit_log (ticket_id, changed_by, field, old_value, new_value)
        VALUES (NEW.id, NEW.acknowledged_by_user_id, 'acknowledged', NULL, to_char(NEW.acknowledged_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS"Z"'));
    END IF;
    IF NEW.escalation_exhausted_at IS NOT NULL AND OLD.escalation_exhausted_at IS NULL THEN
        INSERT INTO public.ticket_audit_log (ticket_id, changed_by, field, old_value, new_value)
        VALUES (NEW.id, NULL, 'escalation_exhausted', NULL, NEW.escalation_step::text || ' pages, no acknowledgement');
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_ticket_ack ON public.tickets;
CREATE TRIGGER trg_audit_ticket_ack
    AFTER UPDATE ON public.tickets
    FOR EACH ROW EXECUTE FUNCTION public.audit_ticket_acknowledgement();

-- ---------------------------------------------------------------------------
-- 6. Scheduler: every minute, ask the edge function to sweep
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Runs as the job owner (postgres). Does nothing until the two Vault secrets
-- exist, so the job is safe to schedule before setup.
CREATE OR REPLACE FUNCTION public.run_emergency_escalation()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_url    TEXT;
    v_secret TEXT;
BEGIN
    SELECT decrypted_secret INTO v_url    FROM vault.decrypted_secrets WHERE name = 'escalation_url'         LIMIT 1;
    SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'escalation_cron_secret' LIMIT 1;
    IF v_url IS NULL OR v_secret IS NULL THEN
        RETURN;
    END IF;
    -- Cheap pre-check so the function is only invoked when something is due
    IF NOT EXISTS (SELECT 1 FROM public.tickets WHERE next_escalation_at IS NOT NULL AND next_escalation_at <= NOW()) THEN
        RETURN;
    END IF;
    PERFORM net.http_post(
        url     := v_url,
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
        body    := '{}'::jsonb,
        timeout_milliseconds := 20000
    );
END;
$$;

REVOKE ALL ON FUNCTION public.run_emergency_escalation() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'escalate-emergencies') THEN
        PERFORM cron.unschedule('escalate-emergencies');
    END IF;
    PERFORM cron.schedule('escalate-emergencies', '* * * * *', 'SELECT public.run_emergency_escalation();');
END;
$$;

-- ---------------------------------------------------------------------------
-- Verification (after `supabase db push` and the Vault secrets):
--   SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'escalate-emergencies';
--   SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 5;
--   SELECT name FROM vault.decrypted_secrets WHERE name IN ('escalation_url','escalation_cron_secret');
-- ---------------------------------------------------------------------------
