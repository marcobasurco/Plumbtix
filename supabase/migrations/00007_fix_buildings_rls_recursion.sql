-- ============================================================================
-- MIGRATION 00007 — ADDITIVE — FIX RLS INFINITE RECURSION
-- ============================================================================
--
-- Problem:
--   PostgreSQL evaluates ALL RLS policies on a table (OR'd together), even
--   when an earlier policy already grants access.  This creates infinite
--   recursion when policies on different tables cross-reference each other:
--
--     buildings RLS  →  resident_own_building  →  subquery on `spaces`
--       ↓ triggers spaces RLS
--     spaces RLS     →  pm_admin_company_spaces →  subquery on `buildings`
--       ↓ triggers buildings RLS again  →  INFINITE RECURSION
--
--   The same recursion can occur via any policy that subqueries `buildings`
--   (on tickets, occupants, entitlements, attachments, comments, status_log)
--   because those subqueries trigger buildings RLS, which triggers spaces
--   RLS, which triggers buildings RLS again.
--
-- Fix:
--   Create SECURITY DEFINER helper functions that read `buildings` and
--   `spaces` directly, bypassing RLS.  Replace every policy that had a
--   cross-table subquery on `buildings` or `spaces` to use these helpers.
--
-- Scope:
--   ✓ 2 new SECURITY DEFINER functions (bypass RLS for subqueries)
--   ✓ 11 policies dropped & recreated (same access logic, no recursion)
--   ✗ No table/column/index changes
--   ✗ Policy count stays at 41 (11 dropped, 11 created)
--   ✗ Access control logic is IDENTICAL — only evaluation path changes
--
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- A) HELPER FUNCTIONS  (SECURITY DEFINER = bypass RLS)
-- ────────────────────────────────────────────────────────────────────────────

-- Returns building IDs belonging to a company.
-- Used by every PM policy that previously did: SELECT id FROM buildings WHERE company_id = ...
CREATE OR REPLACE FUNCTION get_company_building_ids(p_company_id UUID)
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT id FROM public.buildings WHERE company_id = p_company_id
$$;

-- Returns building IDs for a resident (via occupants → spaces).
-- Used by resident_own_building which previously subqueried spaces directly.
CREATE OR REPLACE FUNCTION get_resident_building_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
    SELECT DISTINCT s.building_id
    FROM public.spaces s
    JOIN public.occupants o ON o.space_id = s.id
    WHERE o.user_id = auth.uid()
$$;


-- ────────────────────────────────────────────────────────────────────────────
-- B) BUILDINGS — replace resident_own_building
--    Was: subquery on spaces → triggered spaces RLS → recursion
-- ────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "resident_own_building" ON buildings;
CREATE POLICY "resident_own_building" ON buildings
    FOR SELECT
    USING (
        get_user_role() = 'resident'
        AND id IN (SELECT get_resident_building_ids())
    );


-- ────────────────────────────────────────────────────────────────────────────
-- C) SPACES — replace pm_admin_company_spaces
--    Was: subquery on buildings → triggered buildings RLS → recursion
-- ────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "pm_admin_company_spaces" ON spaces;
CREATE POLICY "pm_admin_company_spaces" ON spaces
    FOR ALL
    USING (
        is_pm_admin()
        AND building_id IN (SELECT get_company_building_ids(get_user_company_id()))
    )
    WITH CHECK (
        is_pm_admin()
        AND building_id IN (SELECT get_company_building_ids(get_user_company_id()))
    );


-- ────────────────────────────────────────────────────────────────────────────
-- D) OCCUPANTS — replace pm_admin_company_occupants
--    Was: JOIN buildings inside subquery → triggered buildings RLS
-- ────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "pm_admin_company_occupants" ON occupants;
CREATE POLICY "pm_admin_company_occupants" ON occupants
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


-- ────────────────────────────────────────────────────────────────────────────
-- E) BUILDING_ENTITLEMENTS — replace pm_admin_company_entitlements
--    Was: subquery on buildings → triggered buildings RLS
-- ────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "pm_admin_company_entitlements" ON building_entitlements;
CREATE POLICY "pm_admin_company_entitlements" ON building_entitlements
    FOR ALL
    USING (
        is_pm_admin()
        AND building_id IN (SELECT get_company_building_ids(get_user_company_id()))
    )
    WITH CHECK (
        is_pm_admin()
        AND building_id IN (SELECT get_company_building_ids(get_user_company_id()))
    );


-- ────────────────────────────────────────────────────────────────────────────
-- F) TICKETS — replace pm_admin + pm_user policies
--    Both subqueried buildings → triggered buildings RLS
-- ────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "pm_admin_company_tickets" ON tickets;
CREATE POLICY "pm_admin_company_tickets" ON tickets
    FOR ALL
    USING (
        is_pm_admin()
        AND building_id IN (SELECT get_company_building_ids(get_user_company_id()))
    )
    WITH CHECK (
        is_pm_admin()
        AND building_id IN (SELECT get_company_building_ids(get_user_company_id()))
    );

DROP POLICY IF EXISTS "pm_user_entitled_tickets" ON tickets;
CREATE POLICY "pm_user_entitled_tickets" ON tickets
    FOR ALL
    USING (
        get_user_role() = 'pm_user'
        AND building_id IN (SELECT get_company_building_ids(get_user_company_id()))
        AND has_building_entitlement(building_id)
    )
    WITH CHECK (
        get_user_role() = 'pm_user'
        AND building_id IN (SELECT get_company_building_ids(get_user_company_id()))
        AND has_building_entitlement(building_id)
    );


-- ────────────────────────────────────────────────────────────────────────────
-- G) TICKET_ATTACHMENTS — replace pm_entitled_attachments
--    Was: JOIN buildings inside subquery → triggered buildings RLS
-- ────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "pm_entitled_attachments" ON ticket_attachments;
CREATE POLICY "pm_entitled_attachments" ON ticket_attachments
    FOR ALL
    USING (
        get_user_role() IN ('pm_admin', 'pm_user')
        AND ticket_id IN (
            SELECT t.id FROM public.tickets t
            WHERE t.building_id IN (SELECT get_company_building_ids(get_user_company_id()))
              AND (is_pm_admin() OR has_building_entitlement(t.building_id))
        )
    )
    WITH CHECK (
        get_user_role() IN ('pm_admin', 'pm_user')
        AND ticket_id IN (
            SELECT t.id FROM public.tickets t
            WHERE t.building_id IN (SELECT get_company_building_ids(get_user_company_id()))
              AND (is_pm_admin() OR has_building_entitlement(t.building_id))
        )
    );


-- ────────────────────────────────────────────────────────────────────────────
-- H) TICKET_COMMENTS — replace pm_entitled_comments
--    Was: JOIN buildings inside subquery → triggered buildings RLS
-- ────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "pm_entitled_comments" ON ticket_comments;
CREATE POLICY "pm_entitled_comments" ON ticket_comments
    FOR ALL
    USING (
        get_user_role() IN ('pm_admin', 'pm_user')
        AND ticket_id IN (
            SELECT t.id FROM public.tickets t
            WHERE t.building_id IN (SELECT get_company_building_ids(get_user_company_id()))
              AND (is_pm_admin() OR has_building_entitlement(t.building_id))
        )
    )
    WITH CHECK (
        get_user_role() IN ('pm_admin', 'pm_user')
        AND ticket_id IN (
            SELECT t.id FROM public.tickets t
            WHERE t.building_id IN (SELECT get_company_building_ids(get_user_company_id()))
              AND (is_pm_admin() OR has_building_entitlement(t.building_id))
        )
    );


-- ────────────────────────────────────────────────────────────────────────────
-- I) TICKET_STATUS_LOG — replace pm_read_entitled_status_logs
--    Was: JOIN buildings inside subquery → triggered buildings RLS
-- ────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "pm_read_entitled_status_logs" ON ticket_status_log;
CREATE POLICY "pm_read_entitled_status_logs" ON ticket_status_log
    FOR SELECT
    USING (
        get_user_role() IN ('pm_admin', 'pm_user')
        AND ticket_id IN (
            SELECT t.id FROM public.tickets t
            WHERE t.building_id IN (SELECT get_company_building_ids(get_user_company_id()))
              AND (is_pm_admin() OR has_building_entitlement(t.building_id))
        )
    );


-- ============================================================================
-- VERIFICATION
-- ============================================================================
--
-- V.1  Policy count unchanged
--      SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public';
--      Expected: 41
--
-- V.2  New helper functions exist
--      SELECT proname FROM pg_proc
--        WHERE pronamespace = 'public'::regnamespace
--          AND proname IN ('get_company_building_ids', 'get_resident_building_ids');
--      Expected: 2 rows
--
-- V.3  No recursion on buildings
--      (as authenticated user) SELECT * FROM buildings LIMIT 1;
--      Expected: rows or empty set, NO error
--
-- V.4  No recursion on spaces
--      (as authenticated user) SELECT * FROM spaces LIMIT 1;
--      Expected: rows or empty set, NO error
--
-- V.5  No recursion on tickets
--      (as authenticated user) SELECT * FROM tickets LIMIT 1;
--      Expected: rows or empty set, NO error
--
-- ============================================================================
