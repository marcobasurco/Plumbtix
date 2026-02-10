-- =============================================================================
-- Work Orders — Post-Migration Verification
-- =============================================================================
-- Run after `supabase db reset` to verify all 6 migrations applied correctly.
-- Usage: psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f scripts/verify-migrations.sql
-- =============================================================================

-- V1: Tables = 11
SELECT 'V1 Tables' AS check,
       COUNT(*) AS actual,
       11 AS expected,
       CASE WHEN COUNT(*) = 11 THEN 'PASS' ELSE 'FAIL' END AS result
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'companies','users','buildings','spaces','occupants',
    'building_entitlements','invitations','tickets',
    'ticket_attachments','ticket_comments','ticket_status_log'
  );

-- V2: Enums = 8
SELECT 'V2 Enums' AS check,
       COUNT(*) AS actual,
       8 AS expected,
       CASE WHEN COUNT(*) = 8 THEN 'PASS' ELSE 'FAIL' END AS result
FROM pg_type
WHERE typtype = 'e'
  AND typname IN (
    'user_role','space_type','common_area_type','occupant_type',
    'issue_type','ticket_severity','ticket_status','invitation_role'
  );

-- V3: Indexes = 28
SELECT 'V3 Indexes' AS check,
       COUNT(*) AS actual,
       28 AS expected,
       CASE WHEN COUNT(*) = 28 THEN 'PASS' ELSE 'FAIL' END AS result
FROM pg_indexes
WHERE schemaname = 'public' AND indexname LIKE 'idx_%';

-- V4: RLS-enabled tables = 11
SELECT 'V4 RLS Tables' AS check,
       COUNT(*) AS actual,
       11 AS expected,
       CASE WHEN COUNT(*) = 11 THEN 'PASS' ELSE 'FAIL' END AS result
FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity = true;

-- V5: RLS policies = 41
SELECT 'V5 RLS Policies' AS check,
       COUNT(*) AS actual,
       41 AS expected,
       CASE WHEN COUNT(*) = 41 THEN 'PASS' ELSE 'FAIL' END AS result
FROM pg_policies WHERE schemaname = 'public';

-- V6: Triggers = 9 (Section 5: 8 + migration 00005: 1)
SELECT 'V6 Triggers' AS check,
       COUNT(*) AS actual,
       9 AS expected,
       CASE WHEN COUNT(*) = 9 THEN 'PASS' ELSE 'FAIL' END AS result
FROM pg_trigger
WHERE tgrelid IN (
    SELECT oid FROM pg_class WHERE relnamespace = 'public'::regnamespace
  ) AND NOT tgisinternal;

-- V7: SECURITY DEFINER functions = 8 (Section 5: 7 + migration 00005: 1)
SELECT 'V7 SecDef Funcs' AS check,
       COUNT(*) AS actual,
       8 AS expected,
       CASE WHEN COUNT(*) = 8 THEN 'PASS' ELSE 'FAIL' END AS result
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace AND prosecdef = true;

-- V8: Storage bucket exists (private)
SELECT 'V8 Storage Bucket' AS check,
       id AS actual,
       'ticket-attachments' AS expected,
       CASE WHEN public = false THEN 'PASS' ELSE 'FAIL' END AS result
FROM storage.buckets WHERE id = 'ticket-attachments';

-- V9: Storage policies = 4
SELECT 'V9 Storage Policies' AS check,
       COUNT(*) AS actual,
       4 AS expected,
       CASE WHEN COUNT(*) = 4 THEN 'PASS' ELSE 'FAIL' END AS result
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname LIKE 'ticket_attachments%';

-- V10: Seed company exists
SELECT 'V10 Seed Company' AS check,
       slug AS actual,
       'pro-roto' AS expected,
       CASE WHEN slug = 'pro-roto' THEN 'PASS' ELSE 'FAIL' END AS result
FROM public.companies WHERE id = '00000000-0000-0000-0000-000000000001';

-- V11: Transition trigger exists
SELECT 'V11 Transition Trigger' AS check,
       tgname AS actual,
       'trg_tickets_enforce_transition' AS expected,
       'PASS' AS result
FROM pg_trigger
WHERE tgrelid = 'public.tickets'::regclass
  AND tgname = 'trg_tickets_enforce_transition';

-- V12: ticket_comments SELECT revoked from anon (migration 00006)
SELECT 'V12 Revoke anon SELECT' AS check,
       has_table_privilege('anon', 'public.ticket_comments', 'SELECT')::text AS actual,
       'false' AS expected,
       CASE WHEN NOT has_table_privilege('anon', 'public.ticket_comments', 'SELECT')
            THEN 'PASS' ELSE 'FAIL' END AS result;

-- V13: ticket_comments SELECT revoked from authenticated (migration 00006)
SELECT 'V13 Revoke auth SELECT' AS check,
       has_table_privilege('authenticated', 'public.ticket_comments', 'SELECT')::text AS actual,
       'false' AS expected,
       CASE WHEN NOT has_table_privilege('authenticated', 'public.ticket_comments', 'SELECT')
            THEN 'PASS' ELSE 'FAIL' END AS result;

-- V14: ticket_comments INSERT revoked from authenticated (migration 00006)
SELECT 'V14 Revoke auth INSERT' AS check,
       has_table_privilege('authenticated', 'public.ticket_comments', 'INSERT')::text AS actual,
       'false' AS expected,
       CASE WHEN NOT has_table_privilege('authenticated', 'public.ticket_comments', 'INSERT')
            THEN 'PASS' ELSE 'FAIL' END AS result;

-- V15: service_role retains SELECT on ticket_comments
SELECT 'V15 service_role SELECT' AS check,
       has_table_privilege('service_role', 'public.ticket_comments', 'SELECT')::text AS actual,
       'true' AS expected,
       CASE WHEN has_table_privilege('service_role', 'public.ticket_comments', 'SELECT')
            THEN 'PASS' ELSE 'FAIL' END AS result;

-- V16: service_role retains INSERT on ticket_comments
SELECT 'V16 service_role INSERT' AS check,
       has_table_privilege('service_role', 'public.ticket_comments', 'INSERT')::text AS actual,
       'true' AS expected,
       CASE WHEN has_table_privilege('service_role', 'public.ticket_comments', 'INSERT')
            THEN 'PASS' ELSE 'FAIL' END AS result;
