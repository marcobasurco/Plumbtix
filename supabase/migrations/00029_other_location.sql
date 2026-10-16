-- =============================================================================
-- Migration 00029: "Somewhere else" — report a problem at a location that
--                  isn't in the building's list
-- =============================================================================
-- A hospital corridor, a loading dock, a roof drain: the person standing next
-- to the leak must never be blocked because the exact space isn't listed and
-- Staff (pm_user) cannot create spaces.
--
--   1. tickets.location_note — free text ("3rd floor corridor by elevator B"),
--      set by the reporter when they pick "Somewhere else".
--   2. Every building gets one catch-all common-area space labelled
--      'Other / not listed' (common_area_type = 'other'). Created by trigger
--      for new buildings; backfilled for existing ones. The wizard sends the
--      ticket against that space with the note.
--
-- Idempotent. No authorization changes: location_note is an ordinary
-- editable column (RLS + update-ticket decide who may change it).
-- =============================================================================

ALTER TABLE public.tickets
    ADD COLUMN IF NOT EXISTS location_note VARCHAR(300);

COMMENT ON COLUMN public.tickets.location_note IS
    'Free-text location when the reporter chose "Somewhere else" (space = the building''s Other / not listed catch-all).';

-- ---------------------------------------------------------------------------
-- Catch-all space per building
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_other_location_space(p_building_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_id UUID;
BEGIN
    SELECT id INTO v_id
    FROM public.spaces
    WHERE building_id = p_building_id
      AND space_type = 'common_area'
      AND common_area_type = 'other'
      AND label = 'Other / not listed'
    LIMIT 1;

    IF v_id IS NULL THEN
        INSERT INTO public.spaces (building_id, space_type, common_area_type, label)
        VALUES (p_building_id, 'common_area', 'other', 'Other / not listed')
        RETURNING id INTO v_id;
    END IF;

    RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_other_location_space(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_buildings_ensure_other_space()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    PERFORM public.ensure_other_location_space(NEW.id);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_buildings_other_space ON public.buildings;
CREATE TRIGGER trg_buildings_other_space
    AFTER INSERT ON public.buildings
    FOR EACH ROW EXECUTE FUNCTION public.trg_buildings_ensure_other_space();

-- Backfill existing buildings
DO $$
DECLARE
    b RECORD;
BEGIN
    FOR b IN SELECT id FROM public.buildings LOOP
        PERFORM public.ensure_other_location_space(b.id);
    END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- Verification (run by hand after `supabase db push`):
--   SELECT count(*) FROM public.buildings b
--   WHERE NOT EXISTS (SELECT 1 FROM public.spaces s WHERE s.building_id = b.id
--                     AND s.common_area_type = 'other' AND s.label = 'Other / not listed');
--   -- expect 0
-- ---------------------------------------------------------------------------
