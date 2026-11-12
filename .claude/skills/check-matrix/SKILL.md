---
name: check-matrix
description: Verify that the ticket status-transition matrix is identical in its three copies — the enforce_ticket_status_transition() function (latest migration that defines it), TRANSITION_MATRIX in supabase/functions/update-ticket/index.ts, and shared/types/transitions.ts. Use after any change to ticket statuses or role permissions.
allowed-tools: Read Grep Glob
---

Compare the three copies of the transition matrix:

1. Database: the most recent `CREATE OR REPLACE FUNCTION
   enforce_ticket_status_transition` in `supabase/migrations/` (currently
   00035). Extract, per role, the allowed targets for each current status.
2. Edge function: `TRANSITION_MATRIX` in
   `supabase/functions/update-ticket/index.ts`.
3. Frontend: `TRANSITION_MATRIX` in `shared/types/transitions.ts`.

Also confirm the field rules agree: technician/scheduling fields are
`proroto_admin`-only in both `update-ticket` and the
`protect_ticket_columns()` trigger (migration 00028), and `update-ticket`
accepts no money fields at all (`quote_amount` retired in 00033,
`invoice_number` in 00032; the trigger still locks both legacy columns).

Output a table: current status → allowed targets per role, with one column
per copy, and mark any cell that differs. State clearly either "all three
copies match" or exactly which entries differ and which copy is the odd one
out. Remember the product rules: only Pro Roto changes a status — PM roles and
residents have no transitions at all (00035) — and `needs_info` / `invoiced`
are legacy statuses that nothing may move into.
