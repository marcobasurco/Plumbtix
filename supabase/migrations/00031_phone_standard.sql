-- =============================================================================
-- Migration 00031: One phone-number standard — E.164 everywhere
-- =============================================================================
-- Phone numbers were stored however they were typed: "(415) 555-0100" from
-- the Import page, "+16505551234" from Settings, free text for technicians
-- and building contacts. SMS, voice calls and tel: links need E.164, and a
-- person reading two screens should see the same shape.
--
-- Columns covered
--   users.phone, technicians.phone, buildings.onsite_contact_phone,
--   occupants.phone
--
-- What this does
--   1. public.normalize_phone(text) → E.164 or NULL (same rules as
--      shared/phone.ts: 10 digits → +1…, 11 starting with 1 → +…, leading "+"
--      with 8–15 digits → as typed; anything else → NULL).
--   2. Logs every value that changes or can't be parsed to
--      public.phone_cleanup_log, then rewrites the columns.
--   3. BEFORE INSERT/UPDATE triggers normalize on every write and reject
--      text that isn't a phone number (friendly message), so the Import
--      page, the dashboard, PostgREST and the edge functions all converge.
--   4. CHECK constraints as the seatbelt.
--
-- Idempotent.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Normalizer
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_phone(raw TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    t      TEXT := btrim(COALESCE(raw, ''));
    digits TEXT;
BEGIN
    IF t = '' THEN
        RETURN NULL;
    END IF;
    digits := regexp_replace(t, '\D', '', 'g');
    IF digits = '' THEN
        RETURN NULL;
    END IF;
    IF left(t, 1) = '+' THEN
        IF length(digits) BETWEEN 8 AND 15 AND left(digits, 1) <> '0' THEN
            RETURN '+' || digits;
        END IF;
        RETURN NULL;
    END IF;
    IF length(digits) = 10 THEN
        RETURN '+1' || digits;
    END IF;
    IF length(digits) = 11 AND left(digits, 1) = '1' THEN
        RETURN '+' || digits;
    END IF;
    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.normalize_phone(TEXT) IS
    'E.164 from whatever was typed, or NULL. Mirrors shared/phone.ts normalizePhone().';

-- ---------------------------------------------------------------------------
-- 2. Cleanup with a paper trail
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.phone_cleanup_log (
    id          BIGSERIAL PRIMARY KEY,
    table_name  TEXT NOT NULL,
    column_name TEXT NOT NULL,
    row_id      UUID NOT NULL,
    original    TEXT,
    normalized  TEXT,
    cleaned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE public.phone_cleanup_log IS
    'Every phone value changed or blanked by migration 00031. normalized IS NULL = could not be parsed and was cleared.';
ALTER TABLE public.phone_cleanup_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "proroto_admin_read_phone_cleanup" ON public.phone_cleanup_log;
CREATE POLICY "proroto_admin_read_phone_cleanup" ON public.phone_cleanup_log
    FOR SELECT USING (is_proroto_admin());

DO $$
BEGIN
    -- users.phone
    INSERT INTO public.phone_cleanup_log (table_name, column_name, row_id, original, normalized)
    SELECT 'users', 'phone', id, phone, public.normalize_phone(phone)
    FROM public.users
    WHERE phone IS NOT NULL AND phone IS DISTINCT FROM public.normalize_phone(phone);
    UPDATE public.users SET phone = public.normalize_phone(phone)
    WHERE phone IS NOT NULL AND phone IS DISTINCT FROM public.normalize_phone(phone);

    -- technicians.phone
    INSERT INTO public.phone_cleanup_log (table_name, column_name, row_id, original, normalized)
    SELECT 'technicians', 'phone', id, phone, public.normalize_phone(phone)
    FROM public.technicians
    WHERE phone IS NOT NULL AND phone IS DISTINCT FROM public.normalize_phone(phone);
    UPDATE public.technicians SET phone = public.normalize_phone(phone)
    WHERE phone IS NOT NULL AND phone IS DISTINCT FROM public.normalize_phone(phone);

    -- buildings.onsite_contact_phone
    INSERT INTO public.phone_cleanup_log (table_name, column_name, row_id, original, normalized)
    SELECT 'buildings', 'onsite_contact_phone', id, onsite_contact_phone, public.normalize_phone(onsite_contact_phone)
    FROM public.buildings
    WHERE onsite_contact_phone IS NOT NULL AND onsite_contact_phone IS DISTINCT FROM public.normalize_phone(onsite_contact_phone);
    UPDATE public.buildings SET onsite_contact_phone = public.normalize_phone(onsite_contact_phone)
    WHERE onsite_contact_phone IS NOT NULL AND onsite_contact_phone IS DISTINCT FROM public.normalize_phone(onsite_contact_phone);

    -- occupants.phone
    INSERT INTO public.phone_cleanup_log (table_name, column_name, row_id, original, normalized)
    SELECT 'occupants', 'phone', id, phone, public.normalize_phone(phone)
    FROM public.occupants
    WHERE phone IS NOT NULL AND phone IS DISTINCT FROM public.normalize_phone(phone);
    UPDATE public.occupants SET phone = public.normalize_phone(phone)
    WHERE phone IS NOT NULL AND phone IS DISTINCT FROM public.normalize_phone(phone);
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Normalize on every write
-- ---------------------------------------------------------------------------
-- One trigger function for all four columns; TG_ARGV[0] names the column.
-- A non-empty value that can't be parsed is rejected rather than silently
-- blanked — the person typing it should fix it.
CREATE OR REPLACE FUNCTION public.trg_normalize_phone_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    col   TEXT := TG_ARGV[0];
    raw   TEXT;
    e164  TEXT;
    rec   JSONB;
BEGIN
    rec := to_jsonb(NEW);
    raw := rec ->> col;
    IF raw IS NULL OR btrim(raw) = '' THEN
        e164 := NULL;
    ELSE
        e164 := public.normalize_phone(raw);
        IF e164 IS NULL THEN
            RAISE EXCEPTION 'Enter a 10-digit US number like (650) 555-1234, or an international number starting with +'
                USING ERRCODE = '23514', HINT = 'column ' || col;
        END IF;
    END IF;
    IF (rec ->> col) IS DISTINCT FROM e164 THEN
        NEW := jsonb_populate_record(NEW, jsonb_build_object(col, e164));
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_phone_normalize ON public.users;
CREATE TRIGGER trg_users_phone_normalize
    BEFORE INSERT OR UPDATE OF phone ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.trg_normalize_phone_column('phone');

DROP TRIGGER IF EXISTS trg_technicians_phone_normalize ON public.technicians;
CREATE TRIGGER trg_technicians_phone_normalize
    BEFORE INSERT OR UPDATE OF phone ON public.technicians
    FOR EACH ROW EXECUTE FUNCTION public.trg_normalize_phone_column('phone');

DROP TRIGGER IF EXISTS trg_buildings_phone_normalize ON public.buildings;
CREATE TRIGGER trg_buildings_phone_normalize
    BEFORE INSERT OR UPDATE OF onsite_contact_phone ON public.buildings
    FOR EACH ROW EXECUTE FUNCTION public.trg_normalize_phone_column('onsite_contact_phone');

DROP TRIGGER IF EXISTS trg_occupants_phone_normalize ON public.occupants;
CREATE TRIGGER trg_occupants_phone_normalize
    BEFORE INSERT OR UPDATE OF phone ON public.occupants
    FOR EACH ROW EXECUTE FUNCTION public.trg_normalize_phone_column('phone');

-- ---------------------------------------------------------------------------
-- 4. Seatbelt: the column can only ever hold E.164
-- ---------------------------------------------------------------------------
-- technicians.phone is TEXT; the others are VARCHAR(20) — E.164 is ≤ 16 chars.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_phone_e164_check') THEN
        ALTER TABLE public.users ADD CONSTRAINT users_phone_e164_check
            CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{1,14}$');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'technicians_phone_e164_check') THEN
        ALTER TABLE public.technicians ADD CONSTRAINT technicians_phone_e164_check
            CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{1,14}$');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'buildings_onsite_contact_phone_e164_check') THEN
        ALTER TABLE public.buildings ADD CONSTRAINT buildings_onsite_contact_phone_e164_check
            CHECK (onsite_contact_phone IS NULL OR onsite_contact_phone ~ '^\+[1-9][0-9]{1,14}$');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'occupants_phone_e164_check') THEN
        ALTER TABLE public.occupants ADD CONSTRAINT occupants_phone_e164_check
            CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{1,14}$');
    END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Verification (after `supabase db push`):
--   SELECT table_name, count(*) FILTER (WHERE normalized IS NULL) AS cleared,
--          count(*) AS changed FROM public.phone_cleanup_log GROUP BY 1;
--   SELECT public.normalize_phone('(650) 555-1234');   -- +16505551234
--   SELECT public.normalize_phone('+44 7700 900123');  -- +447700900123
--   SELECT public.normalize_phone('555-1234');          -- NULL
-- ---------------------------------------------------------------------------
