---
name: check-matrix
description: Verify that the ticket status-transition matrix is identical in its three copies — the enforce_ticket_status_transition() function (latest migration that defines it), TRANSITION_MATRIX in supabase/functions/update-ticket/index.ts, and shared/types/transitions.ts. Use after any change to ticket statuses or role permissions.
allowed-tools: Read Grep Glob
---

Compare the three copies of the transition matrix:

1. Database: the most recent `CREATE OR REPLACE FUNCTION
   enforce_ticket_status_transition` in `supabase/migrations/` (currently
   00020). Extract, per role, the allowed targets for each current status.
2. Edge function: `TRANSITION_MATRIX` in
   `supabase/functions/update-ticket/index.ts`.
3. Frontend: `TRANSITION_MATRIX` in `shared/types/transitions.ts`.

Also confirm the field rules agree: `quote_amount`/`invoice_number` are
`proroto_admin`-only and technician/scheduling fields are
`proroto_admin`/`pm_admin`-only in both `update-ticket` and the
`protect_ticket_columns()` trigger (migration 00027).

Output a table: current status → allowed targets per role, with one column
per copy, and mark any cell that differs. State clearly either "all three
copies match" or exactly which entries differ and which copy is the odd one
out. Remember the product rule: PM roles never cancel; only Pro Roto does.
