-- =============================================================================
-- Migration 00015: Full-Text Search on Tickets
-- =============================================================================
-- Adds tsvector column and GIN index for fast full-text search on
-- ticket title (issue_type), description, and building address.
-- =============================================================================

BEGIN;

DO $$ BEGIN RAISE NOTICE 'Running migration 00015_fulltext_search'; END $$;

-- Add tsvector column
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Populate existing rows
UPDATE public.tickets SET search_vector =
  to_tsvector('english',
    COALESCE(description, '') || ' ' ||
    COALESCE(issue_type::text, '') || ' ' ||
    COALESCE(
      (SELECT COALESCE(b.name, '') || ' ' || b.address_line1 || ' ' || b.city
       FROM public.buildings b WHERE b.id = tickets.building_id),
      ''
    )
  );

-- GIN index for fast search
CREATE INDEX IF NOT EXISTS idx_tickets_search_vector
  ON public.tickets USING GIN (search_vector);

-- Trigger to auto-update search_vector on INSERT or UPDATE
CREATE OR REPLACE FUNCTION update_ticket_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    COALESCE(NEW.description, '') || ' ' ||
    COALESCE(NEW.issue_type::text, '') || ' ' ||
    COALESCE(
      (SELECT COALESCE(b.name, '') || ' ' || b.address_line1 || ' ' || b.city
       FROM public.buildings b WHERE b.id = NEW.building_id),
      ''
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ticket_search_vector ON public.tickets;
CREATE TRIGGER trg_ticket_search_vector
  BEFORE INSERT OR UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION update_ticket_search_vector();

COMMIT;
