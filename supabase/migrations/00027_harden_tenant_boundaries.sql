-- ============================================================================
-- MIGRATION 00027 — HARDEN TENANT BOUNDARIES (P0 security fixes)
-- ============================================================================
--
-- Closes the findings from the October 2026 production-readiness review that
-- let a low-privilege account cross tenant lines or escalate privileges by
-- calling PostgREST / Storage directly, bypassing the edge functions:
--
--   S1/S3  Any user could change their own (or, as pm_admin, a colleague's)
--          role / company_id through the users table.
--   S2     Any authenticated account could list, download, overwrite and
--          delete every file in the ticket-attachments bucket.
--   S4     Customer roles could DELETE tickets (cascading the audit trail) and
--          edit financial / dispatch columns the edge function forbids.
--   S6     v_company_analytics ran as its owner and exposed every company's
--          name, volumes and subscription to any key, including anon.
--   S11    company-logos bucket accepted uploads/deletes from any account.
--   S15    SECURITY DEFINER helpers were callable via /rpc for any company;
--          three lacked a fixed search_path.
--   S16    A ticket could reference a space in a different building.
--   —      pm_user could read equipment for buildings they are not entitled to.
--   —      notifications UPDATE policy had no WITH CHECK.
--
-- Principle: the database is the source of truth for authorization. Edge
-- functions validate first for friendly errors; these triggers, grants and
-- policies are the enforcement layer that cannot be bypassed.
--
-- Supersedes the "LOCKED sections" rule: applied migrations stay immutable,
-- but new migrations may freely replace earlier policies.
--
-- All statements are idempotent. Apply with `supabase db push` (preferred) or
-- paste into the SQL editor and then `supabase migration repair --status applied 00027`.
-- ============================================================================


-- ============================================================================
-- A) USERS — identity columns can only be changed by Pro Roto
-- ============================================================================
-- Locked policy users_update_own (00002) lets a user update every column of
-- their own row. This trigger makes role / company_id / email / id immutable
-- for end-user sessions, with one carve-out: pm_admin may move OTHER staff in
-- their own company between pm_admin and pm_user (the Import page needs this).
-- Service role, migrations and dashboard SQL are not end-user sessions and pass.

CREATE OR REPLACE FUNCTION public.protect_user_identity_columns()
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

    IF caller_role = 'proroto_admin' THEN
        RETURN NEW;
    END IF;

    IF NEW.id         IS DISTINCT FROM OLD.id
    OR NEW.role       IS DISTINCT FROM OLD.role
    OR NEW.company_id IS DISTINCT FROM OLD.company_id
    OR NEW.email      IS DISTINCT FROM OLD.email THEN

        IF caller_role = 'pm_admin'
           AND OLD.id <> auth.uid()
           AND NEW.id = OLD.id
           AND OLD.role IN ('pm_admin', 'pm_user')
           AND NEW.role IN ('pm_admin', 'pm_user')
           AND NEW.company_id IS NOT DISTINCT FROM OLD.company_id
           AND NEW.email = OLD.email THEN
            RETURN NEW;
        END IF;

        RAISE EXCEPTION 'Role, company and email can only be changed by Pro Roto'
            USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_user_identity ON public.users;
CREATE TRIGGER trg_protect_user_identity
    BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.protect_user_identity_columns();

-- Accounts are only ever created by accept-invitation / claim-resident
-- (service role) and only removed by Pro Roto. End-user sessions get neither.
REVOKE INSERT, DELETE ON public.users FROM authenticated;
REVOKE ALL ON public.users FROM anon;


-- ============================================================================
-- B) TICKETS — no end-user deletes; column rules enforced at the DB level
-- ============================================================================

-- B.1 Deleting a ticket (and, via CASCADE, its comments, attachments, status
--     log and audit trail) is a Pro Roto-only, service-role operation.
REVOKE DELETE ON public.tickets FROM authenticated;
REVOKE ALL    ON public.tickets FROM anon;

-- B.2 The audit trail must outlive accidental deletes: RESTRICT instead of
--     CASCADE. Deleting a ticket now requires deleting its history first,
--     explicitly, as a deliberate act.
ALTER TABLE public.ticket_audit_log
    DROP CONSTRAINT IF EXISTS ticket_audit_log_ticket_id_fkey;
ALTER TABLE public.ticket_audit_log
    ADD CONSTRAINT ticket_audit_log_ticket_id_fkey
    FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE RESTRICT;

-- B.3 Mirror update-ticket's field rules so PostgREST cannot bypass them:
--       • identity fields are immutable
--       • quote_amount / invoice_number: proroto_admin only
--       • technician + scheduling fields: proroto_admin or pm_admin
--     (public_token / public_enabled are already locked by 00022.)
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

    IF (caller_role IS NULL OR caller_role NOT IN ('proroto_admin', 'pm_admin'))
       AND (NEW.assigned_technician   IS DISTINCT FROM OLD.assigned_technician
         OR NEW.technician_id         IS DISTINCT FROM OLD.technician_id
         OR NEW.scheduled_date        IS DISTINCT FROM OLD.scheduled_date
         OR NEW.scheduled_time_window IS DISTINCT FROM OLD.scheduled_time_window) THEN
        RAISE EXCEPTION 'Only admin roles can change scheduling fields'
            USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_ticket_columns ON public.tickets;
CREATE TRIGGER trg_protect_ticket_columns
    BEFORE UPDATE ON public.tickets
    FOR EACH ROW EXECUTE FUNCTION public.protect_ticket_columns();

-- B.4 A ticket's space must belong to its building (S16). SECURITY DEFINER so
--     the check sees spaces regardless of the caller's RLS.
CREATE OR REPLACE FUNCTION public.enforce_ticket_space_in_building()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.spaces s
        WHERE s.id = NEW.space_id AND s.building_id = NEW.building_id
    ) THEN
        RAISE EXCEPTION 'Space does not belong to the ticket''s building'
            USING ERRCODE = '23503';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tickets_space_in_building ON public.tickets;
CREATE TRIGGER trg_tickets_space_in_building
    BEFORE INSERT OR UPDATE OF space_id, building_id ON public.tickets
    FOR EACH ROW EXECUTE FUNCTION public.enforce_ticket_space_in_building();


-- ============================================================================
-- C) STORAGE — a file is accessible exactly when its ticket is
-- ============================================================================
-- Path convention: tickets/{ticket_id}/{filename}. The EXISTS subquery runs
-- under the CALLER's tickets RLS, so every role rule (company, entitlement,
-- own space) is inherited automatically and nothing is duplicated here.
-- Comparing as text avoids the UUID-cast failures that motivated 00011.

DROP POLICY IF EXISTS "storage_attachments_select" ON storage.objects;
DROP POLICY IF EXISTS "storage_attachments_insert" ON storage.objects;
DROP POLICY IF EXISTS "storage_attachments_update" ON storage.objects;
DROP POLICY IF EXISTS "storage_attachments_delete" ON storage.objects;
DROP POLICY IF EXISTS "ticket_files_select" ON storage.objects;
DROP POLICY IF EXISTS "ticket_files_insert" ON storage.objects;
DROP POLICY IF EXISTS "ticket_files_update" ON storage.objects;
DROP POLICY IF EXISTS "ticket_files_delete" ON storage.objects;

CREATE POLICY "ticket_files_select" ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'ticket-attachments'
        AND EXISTS (SELECT 1 FROM public.tickets t WHERE t.id::text = split_part(name, '/', 2))
    );

CREATE POLICY "ticket_files_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'ticket-attachments'
        AND EXISTS (SELECT 1 FROM public.tickets t WHERE t.id::text = split_part(name, '/', 2))
    );

-- Overwrite / rename: PM and admin roles only (residents never modify files).
CREATE POLICY "ticket_files_update" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
        bucket_id = 'ticket-attachments'
        AND public.get_user_role() IN ('proroto_admin', 'pm_admin', 'pm_user')
        AND EXISTS (SELECT 1 FROM public.tickets t WHERE t.id::text = split_part(name, '/', 2))
    )
    WITH CHECK (
        bucket_id = 'ticket-attachments'
        AND public.get_user_role() IN ('proroto_admin', 'pm_admin', 'pm_user')
        AND EXISTS (SELECT 1 FROM public.tickets t WHERE t.id::text = split_part(name, '/', 2))
    );

-- Delete: PM/admin roles for visible tickets; residents only their own uploads.
CREATE POLICY "ticket_files_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'ticket-attachments'
        AND EXISTS (SELECT 1 FROM public.tickets t WHERE t.id::text = split_part(name, '/', 2))
        AND (
            public.get_user_role() IN ('proroto_admin', 'pm_admin', 'pm_user')
            OR owner_id = auth.uid()::text
        )
    );

-- company-logos: public bucket, no feature uses it yet. Public buckets serve
-- files without a SELECT policy; the SELECT policy only enabled listing.
-- Remove all end-user access until a scoped upload feature exists, and cap
-- what the bucket accepts.
DROP POLICY IF EXISTS "Public read company logos" ON storage.objects;
DROP POLICY IF EXISTS "PM admins upload company logos" ON storage.objects;
DROP POLICY IF EXISTS "PM admins delete company logos" ON storage.objects;

UPDATE storage.buckets
SET file_size_limit    = 2097152,  -- 2 MB
    allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp']
WHERE id = 'company-logos';


-- ============================================================================
-- D) ANALYTICS VIEW — run as the caller, never for anon
-- ============================================================================
-- Views execute with their owner's privileges unless security_invoker is set;
-- the owner (postgres) bypasses RLS, so every company's row was visible to any
-- key. With security_invoker the underlying RLS applies: proroto_admin still
-- sees all companies, pm_admin sees only their own.

ALTER VIEW public.v_company_analytics SET (security_invoker = true);
REVOKE ALL ON public.v_company_analytics FROM anon;


-- ============================================================================
-- E) EQUIPMENT — same access model as spaces (entitlement-aware)
-- ============================================================================
-- Replaces the production policies captured in 00026:
--   • pm_admin: full access within their company
--   • pm_user:  read-only, entitled buildings only (was: whole company)
--   • resident: no access
-- Uses the SECURITY DEFINER helpers so evaluation cannot recurse.

DROP POLICY IF EXISTS "pm_read_company_equipment" ON public.equipment;
DROP POLICY IF EXISTS "pm_admin_write_company_equipment" ON public.equipment;
DROP POLICY IF EXISTS "pm_admin_company_equipment" ON public.equipment;
DROP POLICY IF EXISTS "pm_user_entitled_equipment" ON public.equipment;

CREATE POLICY "pm_admin_company_equipment" ON public.equipment
    FOR ALL
    USING (
        is_pm_admin()
        AND space_id IN (
            SELECT s.id FROM public.spaces s
            WHERE s.building_id IN (SELECT get_company_building_ids(get_user_company_id()))
        )
    )
    WITH CHECK (
        is_pm_admin()
        AND space_id IN (
            SELECT s.id FROM public.spaces s
            WHERE s.building_id IN (SELECT get_company_building_ids(get_user_company_id()))
        )
    );

CREATE POLICY "pm_user_entitled_equipment" ON public.equipment
    FOR SELECT
    USING (
        get_user_role() = 'pm_user'
        AND space_id IN (
            SELECT s.id FROM public.spaces s
            WHERE has_building_entitlement(s.building_id)
        )
    );

DROP TRIGGER IF EXISTS trg_equipment_updated_at ON public.equipment;
CREATE TRIGGER trg_equipment_updated_at
    BEFORE UPDATE ON public.equipment
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

REVOKE ALL ON public.equipment FROM anon;


-- ============================================================================
-- F) HELPER FUNCTIONS — no cross-company answers via /rpc; fixed search_path
-- ============================================================================
-- Policies call these with the caller's own company, which still works. An
-- end-user session calling them directly with another company's id gets
-- nothing. Service role and SQL sessions are unrestricted.

CREATE OR REPLACE FUNCTION public.get_company_building_ids(p_company_id UUID)
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, auth, pg_temp
AS $$
    SELECT id FROM public.buildings
    WHERE company_id = p_company_id
      AND (
        COALESCE(auth.role(), '') NOT IN ('anon', 'authenticated')
        OR is_proroto_admin()
        OR p_company_id = get_user_company_id()
      )
$$;

CREATE OR REPLACE FUNCTION public.fn_snapshot_company_usage(p_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_period DATE := date_trunc('month', NOW())::DATE;
    v_buildings INT;
    v_spaces INT;
    v_users INT;
    v_bytes BIGINT;
BEGIN
    IF COALESCE(auth.role(), '') IN ('anon', 'authenticated')
       AND NOT COALESCE(is_proroto_admin(), FALSE)
       AND p_company_id IS DISTINCT FROM get_user_company_id() THEN
        RAISE EXCEPTION 'Not allowed for this company' USING ERRCODE = '42501';
    END IF;

    SELECT COUNT(*) INTO v_buildings
    FROM buildings WHERE company_id = p_company_id;

    SELECT COUNT(*) INTO v_spaces
    FROM spaces s
    JOIN buildings b ON b.id = s.building_id
    WHERE b.company_id = p_company_id;

    SELECT COUNT(*) INTO v_users
    FROM users WHERE company_id = p_company_id;

    SELECT COALESCE(SUM(ta.file_size), 0) INTO v_bytes
    FROM ticket_attachments ta
    JOIN tickets t ON t.id = ta.ticket_id
    JOIN spaces sp ON sp.id = t.space_id
    JOIN buildings bld ON bld.id = sp.building_id
    WHERE bld.company_id = p_company_id
      AND ta.created_at >= v_period;

    INSERT INTO company_usage_monthly (company_id, period, building_count, space_count, user_count, attachment_bytes)
    VALUES (p_company_id, v_period, v_buildings, v_spaces, v_users, v_bytes)
    ON CONFLICT (company_id, period)
    DO UPDATE SET
        building_count = v_buildings,
        space_count = v_spaces,
        user_count = v_users,
        attachment_bytes = v_bytes,
        updated_at = NOW();
END;
$$;

-- Same bodies as 00008 / 00010, now with a fixed search_path.
CREATE OR REPLACE FUNCTION public.fn_track_ticket_usage()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_company_id UUID;
    v_period     DATE;
BEGIN
    SELECT b.company_id INTO v_company_id
    FROM spaces s
    JOIN buildings b ON b.id = s.building_id
    WHERE s.id = NEW.space_id;

    IF v_company_id IS NULL THEN
        RETURN NEW;
    END IF;

    v_period := date_trunc('month', NEW.created_at)::DATE;

    INSERT INTO company_usage_monthly (company_id, period, ticket_count)
    VALUES (v_company_id, v_period, 1)
    ON CONFLICT (company_id, period)
    DO UPDATE SET
        ticket_count = company_usage_monthly.ticket_count + 1,
        updated_at = NOW();

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_auto_create_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    INSERT INTO company_subscriptions (
        company_id, tier, status,
        max_buildings, max_users, max_tickets_mo, max_storage_mb,
        trial_ends_at
    ) VALUES (
        NEW.id,
        'starter',
        'trialing',
        10, 25, 100, 1024,
        NOW() + INTERVAL '30 days'
    )
    ON CONFLICT (company_id) DO NOTHING;
    RETURN NEW;
END;
$$;


-- ============================================================================
-- G) NOTIFICATIONS — users cannot reassign a notification to someone else
-- ============================================================================

DROP POLICY IF EXISTS notifications_update_own ON public.notifications;
CREATE POLICY notifications_update_own ON public.notifications
    FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());


-- ============================================================================
-- VERIFICATION — run each as the named role (curl with that user's JWT)
-- ============================================================================
--
-- As pm_user:
--   PATCH /rest/v1/users?id=eq.<self>  {"role":"proroto_admin"}        → 42501
--   PATCH /rest/v1/users?id=eq.<self>  {"phone":"+16505550100"}        → 204 (own phone still OK)
--   DELETE /rest/v1/tickets?id=eq.<visible ticket>                     → permission denied
--   PATCH /rest/v1/tickets?id=eq.<visible>  {"invoice_number":"X"}     → 42501
--   storage list 'tickets/'                                            → only own-visible ticket folders
--   storage download tickets/<other company ticket>/file               → 400/404
--   GET /rest/v1/v_company_analytics                                   → own company only
-- As pm_admin:
--   PATCH /rest/v1/users?id=eq.<colleague> {"role":"pm_user"}          → 204
--   PATCH /rest/v1/users?id=eq.<colleague> {"role":"proroto_admin"}    → 42501
--   PATCH /rest/v1/users?id=eq.<self>      {"role":"pm_user"}          → 42501
-- As anon (apikey only):
--   GET /rest/v1/v_company_analytics                                   → 401/permission denied
--   POST /rest/v1/rpc/get_company_building_ids {"p_company_id":"…"}   → []
--
-- SELECT COUNT(*) FROM pg_policies WHERE schemaname='storage' AND policyname LIKE 'ticket_files_%';  → 4
-- SELECT COUNT(*) FROM pg_policies WHERE schemaname='storage' AND policyname LIKE '%company logos%'; → 0
-- SELECT reloptions FROM pg_class WHERE relname='v_company_analytics';  → {security_invoker=true}
-- SELECT has_table_privilege('authenticated','public.tickets','DELETE'); → false
-- SELECT has_table_privilege('authenticated','public.users','INSERT');   → false
-- ============================================================================
