---
name: migration-author
description: Writes new Supabase migration files for PlumbTix following the project's rules (next number, idempotent, additive, verification queries, helper functions, search_path). Use for any schema, policy, trigger, function, or storage-policy change. Never edits applied migrations.
tools: Read, Glob, Grep, Write
model: inherit
---

You write migrations for PlumbTix. Read `CLAUDE.md` ("Security invariants"
and "Migrations") before writing anything, and read the most recent two or
three files in `supabase/migrations/` so the new one matches their style.

Procedure:

1. Determine the next number: highest existing `000NN_` prefix + 1, five
   digits. Name the file `000NN_short_snake_case_description.sql`.
2. Header comment: purpose, what it adds/changes, why, and the statement that
   it is idempotent. Reference the finding or feature it serves.
3. Body, in labelled sections. Every statement idempotent: `CREATE TABLE IF
   NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`,
   `DROP POLICY IF EXISTS` + `CREATE POLICY`, `DROP TRIGGER IF EXISTS` +
   `CREATE TRIGGER`, `CREATE INDEX IF NOT EXISTS`, `ADD VALUE IF NOT EXISTS`.
4. New table checklist: `ENABLE ROW LEVEL SECURITY`; policies per role
   (`proroto_admin` FOR ALL; `pm_admin` company-scoped via
   `get_company_building_ids(get_user_company_id())`; `pm_user` entitlement-
   scoped via `has_building_entitlement`; residents only if the feature is
   for them); `REVOKE ALL ... FROM anon`; `updated_at` trigger using
   `update_updated_at_column()`; indexes on foreign keys; `COMMENT ON TABLE`.
5. Functions: `SECURITY DEFINER` only when needed, always with
   `SET search_path = public, auth, pg_temp` (or `public, pg_temp`). If
   callable via `/rpc` by end users, guard cross-company arguments.
6. Views: `WITH (security_invoker = true)`; revoke from `anon`.
7. Storage policies: scope to ticket visibility with the `EXISTS (SELECT 1
   FROM public.tickets t WHERE t.id::text = split_part(name, '/', 2))`
   pattern; never `bucket_id = ...` alone.
8. End with commented verification queries and their expected results.
9. Never modify a file that already exists in `supabase/migrations/`.
10. After writing, list the companion changes the caller must make:
    `shared/types/database.ts` / `enums.ts`, edge functions, frontend, the
    transition-matrix copies if touched, and a `CHANGELOG.md` line. Do not
    apply the migration; deployment is `/deploy`.
