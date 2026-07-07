-- ============================================================================
-- MIGRATION 00021 — ADDITIVE — TOKEN-BASED PUBLIC TICKET SHARING
-- ============================================================================
--
-- PlumbTix — Pro Roto Work Orders Portal
--
-- Purpose:
--   Replace the "any ticket UUID is publicly viewable" model with explicit,
--   revocable, opt-in public sharing:
--     • public_token   — random UUID, unrelated to the ticket's primary key.
--                        Knowing a ticket's id no longer grants public access.
--     • public_enabled — must be TRUE for the public view to resolve.
--                        Disabling instantly revokes all previously shared
--                        links/QR codes without deleting the token.
--
-- Relationship to locked sections:
--   • Does NOT modify any Section 4 objects' existing columns/constraints
--   • Does NOT modify any Section 5 RLS policies (columns are covered by
--     the existing row-level policies on tickets)
--   • PURELY ADDITIVE: 2 columns + 1 partial index
--
-- Access model:
--   • Public reads go through the get-public-ticket Edge Function ONLY
--     (service role), which requires public_enabled = TRUE and looks up
--     by public_token. No PostgREST path exposes these rows anonymously.
--   • Enable/disable goes through the toggle-public-sharing Edge Function
--     using the caller's JWT — existing tickets RLS (proroto_admin FOR ALL,
--     pm_admin FOR ALL company-scoped) is the enforcement layer.
--
-- ⚠ BREAKING CHANGE (deliberate):
--   Previously printed QR codes / links of the form /p/<ticket_id> stop
--   working once get-public-ticket switches to token lookup. Re-enable
--   sharing per ticket and reprint where needed. This is the security fix:
--   old links were irrevocable.
--
-- ============================================================================

-- ---------------------------------------------------------------------------
-- A) COLUMNS
-- ---------------------------------------------------------------------------

ALTER TABLE public.tickets
    ADD COLUMN IF NOT EXISTS public_token   UUID    UNIQUE,
    ADD COLUMN IF NOT EXISTS public_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.tickets.public_token IS
    'Random UUID for login-less public ticket view (/p/:token). NULL until sharing is first enabled. Never equal to tickets.id.';
COMMENT ON COLUMN public.tickets.public_enabled IS
    'When TRUE, get-public-ticket resolves this ticket by public_token. FALSE revokes all shared links immediately.';

-- ---------------------------------------------------------------------------
-- B) LOOKUP INDEX
-- ---------------------------------------------------------------------------
-- The UNIQUE constraint above already creates a btree index on public_token,
-- but a partial index on enabled rows keeps the hot public-lookup path tight.

CREATE INDEX IF NOT EXISTS idx_tickets_public_token_enabled
    ON public.tickets (public_token)
    WHERE public_enabled = TRUE;

-- ---------------------------------------------------------------------------
-- C) OPTIONAL BACKFILL (commented out — decide explicitly)
-- ---------------------------------------------------------------------------
-- If you want every EXISTING ticket to remain publicly reachable (with new,
-- revocable URLs) rather than requiring per-ticket re-enable, uncomment:
--
-- UPDATE public.tickets
--    SET public_token   = gen_random_uuid(),
--        public_enabled = TRUE
--  WHERE public_token IS NULL;
--
-- Leaving this OFF is the recommended, secure default: sharing becomes
-- opt-in per ticket from the ticket detail page.
