-- ============================================================================
-- SECTION 5 — v1.0.0 — FINAL / LOCKED — SECURITY & AUTOMATION
-- ============================================================================
--
-- Layered on top of Section 4 (LOCKED). Does NOT modify any Section 4 objects.
--
-- Contents:
--   A) Trigger functions       (2)
--   B) Triggers                (8: 7 updated_at + 1 status log)
--   C) SECURITY DEFINER helpers(6)
--   D) RLS enablement          (11 tables)
--   E) RLS policies            (41 total)
--
-- ============================================================================

-- ============================================================================
-- A) TRIGGER FUNCTIONS (2)
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION log_ticket_status_change()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO public.ticket_status_log (
            ticket_id,
            old_status,
            new_status,
            changed_by_user_id
        ) VALUES (
            NEW.id,
            OLD.status,
            NEW.status,
            auth.uid()
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- B) TRIGGERS (8)
-- ============================================================================

DROP TRIGGER IF EXISTS trg_companies_updated_at ON companies;
CREATE TRIGGER trg_companies_updated_at
    BEFORE UPDATE ON companies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_buildings_updated_at ON buildings;
CREATE TRIGGER trg_buildings_updated_at
    BEFORE UPDATE ON buildings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_spaces_updated_at ON spaces;
CREATE TRIGGER trg_spaces_updated_at
    BEFORE UPDATE ON spaces
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_occupants_updated_at ON occupants;
CREATE TRIGGER trg_occupants_updated_at
    BEFORE UPDATE ON occupants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_tickets_updated_at ON tickets;
CREATE TRIGGER trg_tickets_updated_at
    BEFORE UPDATE ON tickets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_ticket_comments_updated_at ON ticket_comments;
CREATE TRIGGER trg_ticket_comments_updated_at
    BEFORE UPDATE ON ticket_comments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_tickets_status_log ON tickets;
CREATE TRIGGER trg_tickets_status_log
    AFTER UPDATE OF status ON tickets
    FOR EACH ROW EXECUTE FUNCTION log_ticket_status_change();

-- ============================================================================
-- C) SECURITY DEFINER HELPER FUNCTIONS (6)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
    SELECT role FROM public.users WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION get_user_company_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
    SELECT company_id FROM public.users WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION is_proroto_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
    SELECT get_user_role() = 'proroto_admin'
$$;

CREATE OR REPLACE FUNCTION is_pm_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
    SELECT get_user_role() = 'pm_admin'
$$;

CREATE OR REPLACE FUNCTION has_building_entitlement(building_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.building_entitlements
        WHERE user_id = auth.uid() AND building_id = building_uuid
    )
$$;

CREATE OR REPLACE FUNCTION get_resident_space_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
    SELECT space_id FROM public.occupants WHERE user_id = auth.uid()
$$;

-- ============================================================================
-- D) ENABLE ROW LEVEL SECURITY (11 tables)
-- ============================================================================

ALTER TABLE companies             ENABLE ROW LEVEL SECURITY;
ALTER TABLE users                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE buildings             ENABLE ROW LEVEL SECURITY;
ALTER TABLE spaces                ENABLE ROW LEVEL SECURITY;
ALTER TABLE occupants             ENABLE ROW LEVEL SECURITY;
ALTER TABLE building_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets               ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_attachments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_comments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_status_log     ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- E) RLS POLICIES (41 total)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- E.1 COMPANIES (3 policies)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "proroto_admin_all_companies" ON companies;
CREATE POLICY "proroto_admin_all_companies" ON companies
    FOR ALL
    USING  (is_proroto_admin())
    WITH CHECK (is_proroto_admin());

DROP POLICY IF EXISTS "pm_read_own_company" ON companies;
CREATE POLICY "pm_read_own_company" ON companies
    FOR SELECT
    USING (get_user_role() IN ('pm_admin', 'pm_user') AND id = get_user_company_id());

DROP POLICY IF EXISTS "resident_read_own_company" ON companies;
CREATE POLICY "resident_read_own_company" ON companies
    FOR SELECT
    USING (get_user_role() = 'resident' AND id = get_user_company_id());

-- ---------------------------------------------------------------------------
-- E.2 USERS (5 policies)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "proroto_admin_all_users" ON users;
CREATE POLICY "proroto_admin_all_users" ON users
    FOR ALL
    USING  (is_proroto_admin())
    WITH CHECK (is_proroto_admin());

DROP POLICY IF EXISTS "pm_admin_manage_company_users" ON users;
CREATE POLICY "pm_admin_manage_company_users" ON users
    FOR ALL
    USING  (is_pm_admin() AND company_id = get_user_company_id())
    WITH CHECK (is_pm_admin() AND company_id = get_user_company_id());

DROP POLICY IF EXISTS "pm_user_read_company_users" ON users;
CREATE POLICY "pm_user_read_company_users" ON users
    FOR SELECT
    USING (get_user_role() = 'pm_user' AND company_id = get_user_company_id());

DROP POLICY IF EXISTS "users_read_own" ON users;
CREATE POLICY "users_read_own" ON users
    FOR SELECT
    USING (id = auth.uid());

DROP POLICY IF EXISTS "users_update_own" ON users;
CREATE POLICY "users_update_own" ON users
    FOR UPDATE
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- ---------------------------------------------------------------------------
-- E.3 BUILDINGS (4 policies)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "proroto_admin_all_buildings" ON buildings;
CREATE POLICY "proroto_admin_all_buildings" ON buildings
    FOR ALL
    USING  (is_proroto_admin())
    WITH CHECK (is_proroto_admin());

DROP POLICY IF EXISTS "pm_admin_company_buildings" ON buildings;
CREATE POLICY "pm_admin_company_buildings" ON buildings
    FOR ALL
    USING  (is_pm_admin() AND company_id = get_user_company_id())
    WITH CHECK (is_pm_admin() AND company_id = get_user_company_id());

DROP POLICY IF EXISTS "pm_user_entitled_buildings" ON buildings;
CREATE POLICY "pm_user_entitled_buildings" ON buildings
    FOR SELECT
    USING (
        get_user_role() = 'pm_user'
        AND company_id = get_user_company_id()
        AND has_building_entitlement(id)
    );

DROP POLICY IF EXISTS "resident_own_building" ON buildings;
CREATE POLICY "resident_own_building" ON buildings
    FOR SELECT
    USING (
        get_user_role() = 'resident'
        AND id IN (
            SELECT s.building_id FROM public.spaces s
            WHERE s.id IN (SELECT get_resident_space_ids())
        )
    );

-- ---------------------------------------------------------------------------
-- E.4 SPACES (4 policies)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "proroto_admin_all_spaces" ON spaces;
CREATE POLICY "proroto_admin_all_spaces" ON spaces
    FOR ALL
    USING  (is_proroto_admin())
    WITH CHECK (is_proroto_admin());

DROP POLICY IF EXISTS "pm_admin_company_spaces" ON spaces;
CREATE POLICY "pm_admin_company_spaces" ON spaces
    FOR ALL
    USING (
        is_pm_admin()
        AND building_id IN (
            SELECT id FROM public.buildings WHERE company_id = get_user_company_id()
        )
    )
    WITH CHECK (
        is_pm_admin()
        AND building_id IN (
            SELECT id FROM public.buildings WHERE company_id = get_user_company_id()
        )
    );

DROP POLICY IF EXISTS "pm_user_entitled_spaces" ON spaces;
CREATE POLICY "pm_user_entitled_spaces" ON spaces
    FOR SELECT
    USING (
        get_user_role() = 'pm_user'
        AND has_building_entitlement(building_id)
    );

DROP POLICY IF EXISTS "resident_own_space" ON spaces;
CREATE POLICY "resident_own_space" ON spaces
    FOR SELECT
    USING (
        get_user_role() = 'resident'
        AND id IN (SELECT get_resident_space_ids())
    );

-- ---------------------------------------------------------------------------
-- E.5 OCCUPANTS (4 policies)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "proroto_admin_all_occupants" ON occupants;
CREATE POLICY "proroto_admin_all_occupants" ON occupants
    FOR ALL
    USING  (is_proroto_admin())
    WITH CHECK (is_proroto_admin());

DROP POLICY IF EXISTS "pm_admin_company_occupants" ON occupants;
CREATE POLICY "pm_admin_company_occupants" ON occupants
    FOR ALL
    USING (
        is_pm_admin()
        AND space_id IN (
            SELECT s.id FROM public.spaces s
            JOIN public.buildings b ON s.building_id = b.id
            WHERE b.company_id = get_user_company_id()
        )
    )
    WITH CHECK (
        is_pm_admin()
        AND space_id IN (
            SELECT s.id FROM public.spaces s
            JOIN public.buildings b ON s.building_id = b.id
            WHERE b.company_id = get_user_company_id()
        )
    );

DROP POLICY IF EXISTS "pm_user_entitled_occupants" ON occupants;
CREATE POLICY "pm_user_entitled_occupants" ON occupants
    FOR SELECT
    USING (
        get_user_role() = 'pm_user'
        AND space_id IN (
            SELECT s.id FROM public.spaces s
            WHERE has_building_entitlement(s.building_id)
        )
    );

DROP POLICY IF EXISTS "resident_own_occupant" ON occupants;
CREATE POLICY "resident_own_occupant" ON occupants
    FOR SELECT
    USING (get_user_role() = 'resident' AND user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- E.6 BUILDING_ENTITLEMENTS (3 policies)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "proroto_admin_all_entitlements" ON building_entitlements;
CREATE POLICY "proroto_admin_all_entitlements" ON building_entitlements
    FOR ALL
    USING  (is_proroto_admin())
    WITH CHECK (is_proroto_admin());

DROP POLICY IF EXISTS "pm_admin_company_entitlements" ON building_entitlements;
CREATE POLICY "pm_admin_company_entitlements" ON building_entitlements
    FOR ALL
    USING (
        is_pm_admin()
        AND building_id IN (
            SELECT id FROM public.buildings WHERE company_id = get_user_company_id()
        )
    )
    WITH CHECK (
        is_pm_admin()
        AND building_id IN (
            SELECT id FROM public.buildings WHERE company_id = get_user_company_id()
        )
    );

DROP POLICY IF EXISTS "pm_user_own_entitlements" ON building_entitlements;
CREATE POLICY "pm_user_own_entitlements" ON building_entitlements
    FOR SELECT
    USING (get_user_role() = 'pm_user' AND user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- E.7 INVITATIONS (2 policies)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "proroto_admin_all_invitations" ON invitations;
CREATE POLICY "proroto_admin_all_invitations" ON invitations
    FOR ALL
    USING  (is_proroto_admin())
    WITH CHECK (is_proroto_admin());

DROP POLICY IF EXISTS "pm_admin_company_invitations" ON invitations;
CREATE POLICY "pm_admin_company_invitations" ON invitations
    FOR ALL
    USING  (is_pm_admin() AND company_id = get_user_company_id())
    WITH CHECK (is_pm_admin() AND company_id = get_user_company_id());

-- ---------------------------------------------------------------------------
-- E.8 TICKETS (5 policies)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "proroto_admin_all_tickets" ON tickets;
CREATE POLICY "proroto_admin_all_tickets" ON tickets
    FOR ALL
    USING  (is_proroto_admin())
    WITH CHECK (is_proroto_admin());

DROP POLICY IF EXISTS "pm_admin_company_tickets" ON tickets;
CREATE POLICY "pm_admin_company_tickets" ON tickets
    FOR ALL
    USING (
        is_pm_admin()
        AND building_id IN (
            SELECT id FROM public.buildings WHERE company_id = get_user_company_id()
        )
    )
    WITH CHECK (
        is_pm_admin()
        AND building_id IN (
            SELECT id FROM public.buildings WHERE company_id = get_user_company_id()
        )
    );

DROP POLICY IF EXISTS "pm_user_entitled_tickets" ON tickets;
CREATE POLICY "pm_user_entitled_tickets" ON tickets
    FOR ALL
    USING (
        get_user_role() = 'pm_user'
        AND building_id IN (
            SELECT id FROM public.buildings WHERE company_id = get_user_company_id()
        )
        AND has_building_entitlement(building_id)
    )
    WITH CHECK (
        get_user_role() = 'pm_user'
        AND building_id IN (
            SELECT id FROM public.buildings WHERE company_id = get_user_company_id()
        )
        AND has_building_entitlement(building_id)
    );

DROP POLICY IF EXISTS "resident_select_own_tickets" ON tickets;
CREATE POLICY "resident_select_own_tickets" ON tickets
    FOR SELECT
    USING (
        get_user_role() = 'resident'
        AND space_id IN (SELECT get_resident_space_ids())
    );

DROP POLICY IF EXISTS "resident_insert_own_tickets" ON tickets;
CREATE POLICY "resident_insert_own_tickets" ON tickets
    FOR INSERT
    WITH CHECK (
        get_user_role() = 'resident'
        AND space_id IN (SELECT get_resident_space_ids())
        AND created_by_user_id = auth.uid()
    );

-- ---------------------------------------------------------------------------
-- E.9 TICKET_ATTACHMENTS (4 policies)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "proroto_admin_all_attachments" ON ticket_attachments;
CREATE POLICY "proroto_admin_all_attachments" ON ticket_attachments
    FOR ALL
    USING  (is_proroto_admin())
    WITH CHECK (is_proroto_admin());

DROP POLICY IF EXISTS "pm_entitled_attachments" ON ticket_attachments;
CREATE POLICY "pm_entitled_attachments" ON ticket_attachments
    FOR ALL
    USING (
        get_user_role() IN ('pm_admin', 'pm_user')
        AND ticket_id IN (
            SELECT t.id FROM public.tickets t
            JOIN public.buildings b ON t.building_id = b.id
            WHERE b.company_id = get_user_company_id()
              AND (is_pm_admin() OR has_building_entitlement(t.building_id))
        )
    )
    WITH CHECK (
        get_user_role() IN ('pm_admin', 'pm_user')
        AND ticket_id IN (
            SELECT t.id FROM public.tickets t
            JOIN public.buildings b ON t.building_id = b.id
            WHERE b.company_id = get_user_company_id()
              AND (is_pm_admin() OR has_building_entitlement(t.building_id))
        )
    );

DROP POLICY IF EXISTS "resident_select_own_attachments" ON ticket_attachments;
CREATE POLICY "resident_select_own_attachments" ON ticket_attachments
    FOR SELECT
    USING (
        get_user_role() = 'resident'
        AND ticket_id IN (
            SELECT id FROM public.tickets
            WHERE space_id IN (SELECT get_resident_space_ids())
        )
    );

DROP POLICY IF EXISTS "resident_insert_own_attachments" ON ticket_attachments;
CREATE POLICY "resident_insert_own_attachments" ON ticket_attachments
    FOR INSERT
    WITH CHECK (
        get_user_role() = 'resident'
        AND uploaded_by_user_id = auth.uid()
        AND ticket_id IN (
            SELECT id FROM public.tickets
            WHERE space_id IN (SELECT get_resident_space_ids())
        )
    );

-- ---------------------------------------------------------------------------
-- E.10 TICKET_COMMENTS (4 policies)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "proroto_admin_all_comments" ON ticket_comments;
CREATE POLICY "proroto_admin_all_comments" ON ticket_comments
    FOR ALL
    USING  (is_proroto_admin())
    WITH CHECK (is_proroto_admin());

DROP POLICY IF EXISTS "pm_entitled_comments" ON ticket_comments;
CREATE POLICY "pm_entitled_comments" ON ticket_comments
    FOR ALL
    USING (
        get_user_role() IN ('pm_admin', 'pm_user')
        AND ticket_id IN (
            SELECT t.id FROM public.tickets t
            JOIN public.buildings b ON t.building_id = b.id
            WHERE b.company_id = get_user_company_id()
              AND (is_pm_admin() OR has_building_entitlement(t.building_id))
        )
    )
    WITH CHECK (
        get_user_role() IN ('pm_admin', 'pm_user')
        AND ticket_id IN (
            SELECT t.id FROM public.tickets t
            JOIN public.buildings b ON t.building_id = b.id
            WHERE b.company_id = get_user_company_id()
              AND (is_pm_admin() OR has_building_entitlement(t.building_id))
        )
    );

DROP POLICY IF EXISTS "resident_read_public_comments" ON ticket_comments;
CREATE POLICY "resident_read_public_comments" ON ticket_comments
    FOR SELECT
    USING (
        get_user_role() = 'resident'
        AND is_internal = false
        AND ticket_id IN (
            SELECT id FROM public.tickets
            WHERE space_id IN (SELECT get_resident_space_ids())
        )
    );

DROP POLICY IF EXISTS "resident_write_public_comments" ON ticket_comments;
CREATE POLICY "resident_write_public_comments" ON ticket_comments
    FOR INSERT
    WITH CHECK (
        get_user_role() = 'resident'
        AND is_internal = false
        AND user_id = auth.uid()
        AND ticket_id IN (
            SELECT id FROM public.tickets
            WHERE space_id IN (SELECT get_resident_space_ids())
        )
    );

-- ---------------------------------------------------------------------------
-- E.11 TICKET_STATUS_LOG (3 policies)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "proroto_admin_all_status_logs" ON ticket_status_log;
CREATE POLICY "proroto_admin_all_status_logs" ON ticket_status_log
    FOR ALL
    USING  (is_proroto_admin())
    WITH CHECK (is_proroto_admin());

DROP POLICY IF EXISTS "pm_read_entitled_status_logs" ON ticket_status_log;
CREATE POLICY "pm_read_entitled_status_logs" ON ticket_status_log
    FOR SELECT
    USING (
        get_user_role() IN ('pm_admin', 'pm_user')
        AND ticket_id IN (
            SELECT t.id FROM public.tickets t
            JOIN public.buildings b ON t.building_id = b.id
            WHERE b.company_id = get_user_company_id()
              AND (is_pm_admin() OR has_building_entitlement(t.building_id))
        )
    );

DROP POLICY IF EXISTS "resident_own_status_logs" ON ticket_status_log;
CREATE POLICY "resident_own_status_logs" ON ticket_status_log
    FOR SELECT
    USING (
        get_user_role() = 'resident'
        AND ticket_id IN (
            SELECT id FROM public.tickets
            WHERE space_id IN (SELECT get_resident_space_ids())
        )
    );

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
--
-- RLS-enabled tables (expected: 11)
-- SELECT COUNT(*) FROM pg_tables
--   WHERE schemaname = 'public' AND rowsecurity = true;
--
-- Custom triggers (expected: 8)
-- SELECT COUNT(*) FROM pg_trigger
--   WHERE tgrelid IN (
--     SELECT oid FROM pg_class WHERE relnamespace = 'public'::regnamespace
--   ) AND NOT tgisinternal;
--
-- SECURITY DEFINER functions (expected: 7)
-- SELECT COUNT(*) FROM pg_proc
--   WHERE pronamespace = 'public'::regnamespace AND prosecdef = true;
--
-- Trigger functions (expected: 2)
-- SELECT COUNT(*) FROM pg_proc
--   WHERE pronamespace = 'public'::regnamespace
--     AND prorettype = 'trigger'::regtype;
--
-- RLS policies total (expected: 41)
-- SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public';
--
-- Policy distribution:
-- SELECT tablename, COUNT(*) FROM pg_policies
--   WHERE schemaname = 'public' GROUP BY tablename ORDER BY tablename;
-- Expected:
--   building_entitlements  3
--   buildings              4
--   companies              3
--   invitations            2
--   occupants              4
--   spaces                 4
--   ticket_attachments     4
--   ticket_comments        4
--   ticket_status_log      3
--   tickets                5
--   users                  5
--   TOTAL                 41
--
-- Section 4 unchanged (expected: 28 indexes)
-- SELECT COUNT(*) FROM pg_indexes
--   WHERE schemaname = 'public' AND indexname LIKE 'idx_%';
--
-- ============================================================================
