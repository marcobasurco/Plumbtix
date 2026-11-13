-- =============================================================================
-- Migration 00036: Lock what customer logins can write directly
-- =============================================================================
-- Found in the pre-testing review (2026-11-12). The screens never offered any
-- of this, but the database allowed it to anyone with a customer login and a
-- browser console — and the rule of this project is that anything a function
-- forbids must also be impossible through PostgREST or the Storage API.
--
--   1. WORK ORDERS. Customer Admin / Staff policies on tickets are FOR ALL
--      (00007) and protect_ticket_columns() (00028) only covers identity,
--      scheduling and the legacy money columns. So a customer could:
--        • lower an emergency's urgency (which stops the on-call paging),
--        • rewrite the description / problem type / completion time later,
--        • INSERT a work order without create-ticket: already Completed, in
--          someone else's name, pre-scheduled, or marked "acknowledged by"
--          a Pro Roto admin.
--      New trigger trg_guard_customer_ticket_writes:
--        • INSERT by anyone who is not Pro Roto must be a plain new report:
--          own name, status 'new', next number from the sequence, nothing
--          scheduled, acknowledged, completed or shared.
--        • UPDATE by anyone who is not Pro Roto is refused. Customer roles
--          have had no status actions since 00035 and no other field edits
--          in the app; comments and photos live in their own tables.
--      Pro Roto admins and the service role (edge functions that use it, the
--      escalation sweep, SQL editor) are unaffected.
--
--   2. PHOTOS AND FILES. Customer roles could delete or overwrite ANY file on
--      a work order they can see — including Pro Roto's own before/after
--      photos, also after the job was closed — and nothing recorded it.
--        • Customers can add files and delete only files they uploaded, and
--          only while the work order is open. No overwriting.
--        • Pro Roto can still delete any file.
--        • Every deletion by a signed-in person is written to the work-order
--          history (ticket_audit_log, field 'attachment_deleted').
--
--   3. TECHNICIANS. pm_read_technicians (00023) let every customer Admin and
--      Staff read every technician's name, phone and email. It existed for an
--      assignment dropdown customers no longer have (00028). Dropped.
--
--   4. RATE LIMITER. check_rate_limit() was executable by anon and
--      authenticated, with a caller-chosen bucket name: a stranger could fill
--      the table or use up someone else's allowance. Only get-public-ticket
--      calls it, with the service role. Now service role only.
--
-- No table or column changes; shared/types/database.ts is unchanged.
-- Idempotent.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Work orders: customer logins may only file a plain new report
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_customer_ticket_writes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    caller_role public.user_role;
    expected_number BIGINT;
BEGIN
    -- Service role, SQL editor, cron: not an end-user session.
    IF COALESCE(auth.role(), '') <> 'authenticated' THEN
        RETURN NEW;
    END IF;

    SELECT role INTO caller_role FROM public.users WHERE id = auth.uid();
    IF caller_role = 'proroto_admin' THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        -- updated_at / search_vector are maintained by later triggers and are
        -- the only things allowed to differ at this point.
        IF (to_jsonb(NEW) - 'updated_at' - 'search_vector')
           IS DISTINCT FROM (to_jsonb(OLD) - 'updated_at' - 'search_vector') THEN
            RAISE EXCEPTION 'Only Pro Roto can change a work order'
                USING ERRCODE = '42501';
        END IF;
        RETURN NEW;
    END IF;

    -- INSERT -----------------------------------------------------------------
    IF NEW.created_by_user_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'A work order can only be reported in your own name'
            USING ERRCODE = '42501';
    END IF;

    IF NEW.status IS DISTINCT FROM 'new' THEN
        RAISE EXCEPTION 'A new work order must start as New'
            USING ERRCODE = '42501';
    END IF;

    -- The number must be the one the sequence just handed out for this row.
    BEGIN
        expected_number := currval(pg_get_serial_sequence('public.tickets', 'ticket_number'));
    EXCEPTION WHEN OTHERS THEN
        expected_number := NULL;   -- no number drawn in this session → caller supplied one
    END;
    IF expected_number IS NULL OR NEW.ticket_number IS DISTINCT FROM expected_number THEN
        RAISE EXCEPTION 'Work order numbers are assigned automatically'
            USING ERRCODE = '42501';
    END IF;

    IF NEW.assigned_technician     IS NOT NULL
    OR NEW.technician_id           IS NOT NULL
    OR NEW.scheduled_date          IS NOT NULL
    OR NEW.scheduled_time_window   IS NOT NULL
    OR NEW.completed_at            IS NOT NULL
    OR NEW.quote_amount            IS NOT NULL
    OR NEW.invoice_number          IS NOT NULL
    OR NEW.acknowledged_at         IS NOT NULL
    OR NEW.acknowledged_by_user_id IS NOT NULL
    OR NEW.escalation_exhausted_at IS NOT NULL
    OR NEW.next_escalation_at      IS NOT NULL
    OR COALESCE(NEW.escalation_step, 0) <> 0
    OR COALESCE(NEW.public_enabled, FALSE)
    OR NEW.public_token            IS NOT NULL THEN
        RAISE EXCEPTION 'Only Pro Roto can schedule, acknowledge, complete or share a work order'
            USING ERRCODE = '42501';
    END IF;

    -- created_at / updated_at are the server's clock, whatever was sent.
    NEW.created_at := NOW();
    NEW.updated_at := NOW();

    RETURN NEW;
END;
$$;

-- BEFORE-row triggers fire alphabetically by name. "trg_guard…" sorts before
-- trg_protect_* and trg_tickets_emergency_clock, so this sees the caller's
-- own values, before the clock trigger arms next_escalation_at.
DROP TRIGGER IF EXISTS trg_guard_customer_ticket_writes ON public.tickets;
CREATE TRIGGER trg_guard_customer_ticket_writes
    BEFORE INSERT OR UPDATE ON public.tickets
    FOR EACH ROW EXECUTE FUNCTION public.guard_customer_ticket_writes();

-- ---------------------------------------------------------------------------
-- 2. Attachments: customers add, and remove only their own while open
-- ---------------------------------------------------------------------------
-- 2a. Metadata rows (ticket_attachments)
DROP POLICY IF EXISTS "pm_entitled_attachments"        ON public.ticket_attachments;
DROP POLICY IF EXISTS "pm_select_attachments"          ON public.ticket_attachments;
DROP POLICY IF EXISTS "pm_insert_attachments"          ON public.ticket_attachments;
DROP POLICY IF EXISTS "pm_delete_own_attachments"      ON public.ticket_attachments;
DROP POLICY IF EXISTS "resident_delete_own_attachments" ON public.ticket_attachments;

-- The inner SELECTs on tickets run under the caller's own ticket RLS, so
-- "a work order I can see" is defined in exactly one place.
CREATE POLICY "pm_select_attachments" ON public.ticket_attachments
    FOR SELECT
    USING (
        get_user_role() IN ('pm_admin', 'pm_user')
        AND ticket_id IN (SELECT t.id FROM public.tickets t)
    );

CREATE POLICY "pm_insert_attachments" ON public.ticket_attachments
    FOR INSERT
    WITH CHECK (
        get_user_role() IN ('pm_admin', 'pm_user')
        AND uploaded_by_user_id = auth.uid()
        AND ticket_id IN (SELECT t.id FROM public.tickets t)
    );

CREATE POLICY "pm_delete_own_attachments" ON public.ticket_attachments
    FOR DELETE
    USING (
        get_user_role() IN ('pm_admin', 'pm_user')
        AND uploaded_by_user_id = auth.uid()
        AND ticket_id IN (
            SELECT t.id FROM public.tickets t
            WHERE t.status NOT IN ('completed', 'invoiced', 'cancelled')
        )
    );

CREATE POLICY "resident_delete_own_attachments" ON public.ticket_attachments
    FOR DELETE
    USING (
        get_user_role() = 'resident'
        AND uploaded_by_user_id = auth.uid()
        AND ticket_id IN (
            SELECT t.id FROM public.tickets t
            WHERE t.status NOT IN ('completed', 'invoiced', 'cancelled')
        )
    );

-- 2b. The files themselves (storage.objects, bucket ticket-attachments)
DROP POLICY IF EXISTS "ticket_files_update" ON storage.objects;
DROP POLICY IF EXISTS "ticket_files_delete" ON storage.objects;

-- Overwrite / rename: Pro Roto only. Uploads never overwrite (upsert: false).
CREATE POLICY "ticket_files_update" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
        bucket_id = 'ticket-attachments'
        AND public.is_proroto_admin()
    )
    WITH CHECK (
        bucket_id = 'ticket-attachments'
        AND public.is_proroto_admin()
    );

-- Delete: Pro Roto any file; everyone else only a file they uploaded, on a
-- work order they can see that is still open.
CREATE POLICY "ticket_files_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'ticket-attachments'
        AND (
            public.is_proroto_admin()
            OR (
                owner_id = auth.uid()::text
                AND EXISTS (
                    SELECT 1 FROM public.tickets t
                    WHERE t.id::text = split_part(name, '/', 2)
                      AND t.status NOT IN ('completed', 'invoiced', 'cancelled')
                )
            )
        )
    );

-- 2c. Record deletions in the work-order history
CREATE OR REPLACE FUNCTION public.audit_attachment_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
    -- Only a signed-in person's deletion is history. A service-role or SQL
    -- clean-up (data reset, cascade from removing a work order) must not
    -- write new history rows for a work order that is itself going away.
    IF COALESCE(auth.role(), '') = 'authenticated'
       AND EXISTS (SELECT 1 FROM public.tickets WHERE id = OLD.ticket_id) THEN
        INSERT INTO public.ticket_audit_log (ticket_id, changed_by, field, old_value, new_value)
        VALUES (OLD.ticket_id, auth.uid(), 'attachment_deleted', OLD.file_name, NULL);
    END IF;
    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_attachment_delete ON public.ticket_attachments;
CREATE TRIGGER trg_audit_attachment_delete
    AFTER DELETE ON public.ticket_attachments
    FOR EACH ROW EXECUTE FUNCTION public.audit_attachment_delete();

-- ---------------------------------------------------------------------------
-- 3. Technicians: Pro Roto only
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "pm_read_technicians" ON public.technicians;

COMMENT ON TABLE public.technicians IS
    'Pro Roto field crew roster. Pro Roto admins only. Customers see the assigned technician''s name on the work order itself (tickets.assigned_technician), never this table.';

-- ---------------------------------------------------------------------------
-- 4. Rate limiter: service role only
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.check_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, INTEGER, INTEGER) TO service_role;

-- ---------------------------------------------------------------------------
-- Verification (after `supabase db push`)
-- ---------------------------------------------------------------------------
--   SELECT tgname FROM pg_trigger
--    WHERE tgrelid = 'public.tickets'::regclass AND NOT tgisinternal ORDER BY tgname;
--   -- trg_guard_customer_ticket_writes is listed, before trg_protect_*
--
--   SELECT policyname, cmd FROM pg_policies
--    WHERE tablename = 'ticket_attachments' ORDER BY policyname;
--   -- pm_select_attachments SELECT, pm_insert_attachments INSERT,
--   -- pm_delete_own_attachments DELETE, resident_delete_own_attachments DELETE,
--   -- plus the proroto_admin_all and resident select/insert policies; NO pm_entitled_attachments
--
--   SELECT count(*) FROM pg_policies WHERE tablename = 'technicians';        -- 1 (proroto_admin_all_technicians)
--   SELECT has_function_privilege('anon',          'public.check_rate_limit(text,integer,integer)', 'EXECUTE');  -- false
--   SELECT has_function_privilege('authenticated', 'public.check_rate_limit(text,integer,integer)', 'EXECUTE');  -- false
--   SELECT has_function_privilege('service_role',  'public.check_rate_limit(text,integer,integer)', 'EXECUTE');  -- true
--
--   In the app, as a customer Staff login: report a problem (works), add a
--   photo (works), delete your own photo while open (works).
--   As that login from the browser console, on one of their work orders:
--     supabase.from('tickets').update({ severity: 'standard' }).eq('id', '<id>')
--     -- error 42501: Only Pro Roto can change a work order
-- ---------------------------------------------------------------------------
