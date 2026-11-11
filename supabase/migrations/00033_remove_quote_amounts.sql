-- =============================================================================
-- Migration 00033: Dollar amounts leave the product
-- =============================================================================
-- Product decision (Marco, 2026-11-11): PlumbTix is not a billing system.
-- It collects the situations reported by property managers and staff and
-- dispatches to them. Estimates are sent from Pro Roto's estimating software;
-- invoices live in ServiceTitan (00032).
--
-- What this does
--   • tickets.quote_amount is no longer written or shown by the app
--     (update-ticket ignores it; screens, PDF and emails no longer print it).
--     The column STAYS so historic rows and the audit trail keep their data.
--     It is marked deprecated, like invoice_number.
--   • trg_protect_ticket_columns (00028) is unchanged: the column remains
--     proroto_admin-only at the database level.
--   • The 'waiting_approval' status is unchanged — a job can still pause while
--     the customer decides — so the transition matrix does not move.
--
-- Idempotent.
-- =============================================================================

COMMENT ON COLUMN public.tickets.quote_amount IS
    'DEPRECATED (00033): estimates are sent from Pro Roto''s estimating software. Kept for historic rows; the app no longer writes or shows it.';

-- ---------------------------------------------------------------------------
-- Verification:
--   SELECT col_description('public.tickets'::regclass, attnum)
--     FROM pg_attribute
--    WHERE attrelid = 'public.tickets'::regclass AND attname = 'quote_amount';
--   -- starts with 'DEPRECATED (00033)'
--   SELECT count(*) FROM tickets WHERE quote_amount IS NOT NULL;  -- historic rows only
-- ---------------------------------------------------------------------------
