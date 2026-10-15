-- ============================================================================
-- MIGRATION 00026 — CAPTURE PRODUCTION SCHEMA DRIFT
-- ============================================================================
--
-- Three objects were created directly in the production dashboard in July
-- 2026 and never committed to the repo:
--
--   • public.equipment            (asset registry: water heaters, pumps, …)
--   • public.spaces.label         (display name for common areas)
--   • common_area_type: gym, restroom
--
-- Without them a fresh database (`supabase db reset`, CI, a staging project)
-- does not run the current frontend. This migration records them exactly as
-- introspected from production on 2026-10-14 (pg_catalog / information_schema).
--
-- Every statement is idempotent:
--   • In production it is a no-op for existing objects. Policies are dropped
--     and recreated with identical definitions.
--   • On a fresh database it creates everything.
--
-- The equipment policies below are the PRODUCTION definitions, kept verbatim
-- so this migration is a faithful capture. Migration 00027 tightens them.
--
-- From here on, every schema change goes through a migration file. Never edit
-- the schema in the dashboard again — run `supabase db diff` instead.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- A) common_area_type — two values added in production
-- ---------------------------------------------------------------------------
-- (ADD VALUE is allowed inside a transaction on PG 12+ as long as the new
--  values are not used in the same transaction. They are not used here.)

ALTER TYPE public.common_area_type ADD VALUE IF NOT EXISTS 'gym';
ALTER TYPE public.common_area_type ADD VALUE IF NOT EXISTS 'restroom';

-- ---------------------------------------------------------------------------
-- B) spaces.label — optional display name ("Main Boiler Room", "Pool House")
-- ---------------------------------------------------------------------------

ALTER TABLE public.spaces ADD COLUMN IF NOT EXISTS label VARCHAR;

COMMENT ON COLUMN public.spaces.label IS
    'Optional display name for a space (mostly common areas). Falls back to unit_number / common_area_type in the UI.';

-- ---------------------------------------------------------------------------
-- C) equipment — asset registry attached to a space
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.equipment (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id      UUID NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
    category      VARCHAR NOT NULL,
    name          VARCHAR NOT NULL,
    manufacturer  VARCHAR,
    model         VARCHAR,
    serial_number VARCHAR,
    spec          VARCHAR,
    install_date  DATE,
    notes         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_equipment_space ON public.equipment (space_id);

COMMENT ON TABLE public.equipment IS
    'Plumbing assets registered to a space (water heaters, backflow devices, sump pumps, …). Shown on ticket detail and the Equipment Register report.';

ALTER TABLE public.equipment ENABLE ROW LEVEL SECURITY;

-- Production policies, verbatim (replaced by entitlement-aware versions in 00027).

DROP POLICY IF EXISTS "proroto_admin_all_equipment" ON public.equipment;
CREATE POLICY "proroto_admin_all_equipment" ON public.equipment
    FOR ALL
    USING  (is_proroto_admin())
    WITH CHECK (is_proroto_admin());

DROP POLICY IF EXISTS "pm_read_company_equipment" ON public.equipment;
CREATE POLICY "pm_read_company_equipment" ON public.equipment
    FOR SELECT
    USING (EXISTS (
        SELECT 1
        FROM public.spaces s
        JOIN public.buildings b ON b.id = s.building_id
        JOIN public.users u ON u.id = auth.uid()
        WHERE s.id = equipment.space_id
          AND u.role IN ('pm_admin', 'pm_user')
          AND u.company_id = b.company_id
    ));

DROP POLICY IF EXISTS "pm_admin_write_company_equipment" ON public.equipment;
CREATE POLICY "pm_admin_write_company_equipment" ON public.equipment
    FOR ALL
    USING (EXISTS (
        SELECT 1
        FROM public.spaces s
        JOIN public.buildings b ON b.id = s.building_id
        JOIN public.users u ON u.id = auth.uid()
        WHERE s.id = equipment.space_id
          AND u.role = 'pm_admin'
          AND u.company_id = b.company_id
    ))
    WITH CHECK (EXISTS (
        SELECT 1
        FROM public.spaces s
        JOIN public.buildings b ON b.id = s.building_id
        JOIN public.users u ON u.id = auth.uid()
        WHERE s.id = equipment.space_id
          AND u.role = 'pm_admin'
          AND u.company_id = b.company_id
    ));

-- ============================================================================
-- VERIFICATION
-- ============================================================================
--
-- SELECT enumlabel FROM pg_enum WHERE enumtypid = 'public.common_area_type'::regtype ORDER BY enumsortorder;
--   Expected: boiler_room, pool, garage, roof, crawlspace, laundry, water_room, other, gym, restroom
--
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'spaces' AND column_name = 'label';
--   Expected: 1 row
--
-- SELECT COUNT(*) FROM pg_policies WHERE tablename = 'equipment';
--   Expected: 3
-- ============================================================================
