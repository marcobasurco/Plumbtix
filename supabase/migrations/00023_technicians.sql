-- ============================================================================
-- MIGRATION 00023 — ADDITIVE — TECHNICIANS ROSTER
-- ============================================================================
--
-- Replaces free-text technician assignment with a real roster:
--   • technicians — Pro Roto's crew (name, phone, email, active flag)
--   • tickets.technician_id — FK to the roster (SET NULL on delete)
--
-- The legacy tickets.assigned_technician TEXT column is KEPT and remains the
-- denormalized display name: the update-ticket edge function writes BOTH
-- (id + name) on assignment, so every existing consumer — PDF, public view,
-- notifications, DispatchBoard grouping — keeps working unchanged.
--
-- Backfill: distinct existing assigned_technician values become roster rows,
-- and matching tickets get linked, so history is preserved from day one.
--
-- PURELY ADDITIVE: 1 table + 2 policies + 1 column + 2 indexes + backfill.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- A) TABLE
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.technicians (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT NOT NULL CHECK (length(trim(name)) > 0),
    phone      TEXT,
    email      TEXT,
    active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Case-insensitive uniqueness: prevents "Bryan" / "bryan" duplicates and
-- gives the backfill a conflict target.
CREATE UNIQUE INDEX IF NOT EXISTS idx_technicians_name_unique
    ON public.technicians (lower(trim(name)));

COMMENT ON TABLE public.technicians IS
    'Pro Roto field crew roster. Managed by proroto_admin; readable by PM roles for ticket assignment dropdowns.';

-- ---------------------------------------------------------------------------
-- B) RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.technicians ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "proroto_admin_all_technicians" ON public.technicians;
CREATE POLICY "proroto_admin_all_technicians" ON public.technicians
    FOR ALL
    USING  (is_proroto_admin())
    WITH CHECK (is_proroto_admin());

-- PM roles need read access to populate the assignment dropdown.
-- Residents get no policy → no access.
DROP POLICY IF EXISTS "pm_read_technicians" ON public.technicians;
CREATE POLICY "pm_read_technicians" ON public.technicians
    FOR SELECT
    USING (get_user_role() IN ('pm_admin', 'pm_user'));

-- ---------------------------------------------------------------------------
-- C) TICKETS LINK COLUMN
-- ---------------------------------------------------------------------------

ALTER TABLE public.tickets
    ADD COLUMN IF NOT EXISTS technician_id UUID REFERENCES public.technicians(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_technician_id
    ON public.tickets (technician_id)
    WHERE technician_id IS NOT NULL;

COMMENT ON COLUMN public.tickets.technician_id IS
    'FK to technicians roster. assigned_technician TEXT remains the denormalized display name, written together with this by update-ticket.';

-- ---------------------------------------------------------------------------
-- D) BACKFILL — roster from existing free-text names, then link tickets
-- ---------------------------------------------------------------------------

INSERT INTO public.technicians (name)
SELECT DISTINCT trim(assigned_technician)
FROM public.tickets
WHERE assigned_technician IS NOT NULL
  AND length(trim(assigned_technician)) > 0
ON CONFLICT ((lower(trim(name)))) DO NOTHING;

UPDATE public.tickets t
SET technician_id = tech.id
FROM public.technicians tech
WHERE t.technician_id IS NULL
  AND t.assigned_technician IS NOT NULL
  AND lower(trim(t.assigned_technician)) = lower(trim(tech.name));
