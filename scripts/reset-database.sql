-- =============================================================================
-- PlumbTix — Full data reset
-- =============================================================================
-- Removes DATA only. Tables, policies, triggers, functions and the migration
-- history are untouched, so nothing needs to be redeployed afterwards.
--
-- Keeps:   Pro Roto admin logins (role = proroto_admin) and the seed
--          Pro Roto company (00000000-0000-0000-0000-000000000001).
-- Deletes: everything else — all customers, buildings, spaces, tickets,
--          comments, attachments, audit history, invitations, notifications,
--          technicians, usage counters, and all non-admin logins.
--
-- Run in: Supabase Dashboard → SQL Editor (runs as postgres; RLS does not apply).
-- Before: 1) take a backup (Dashboard → Database → Backups, or pg_dump),
--         2) empty the two storage buckets from Dashboard → Storage
--            (select all → Delete) so the physical files are removed too.
-- =============================================================================

BEGIN;

-- 1) Operational data. RESTART IDENTITY resets ticket numbering to #1.
--    CASCADE also empties any table that references these (e.g. equipment → spaces).
TRUNCATE TABLE
  public.tickets,
  public.ticket_attachments,
  public.ticket_comments,
  public.ticket_status_log,
  public.ticket_audit_log,
  public.buildings,
  public.spaces,
  public.occupants,
  public.building_entitlements,
  public.invitations,
  public.technicians,
  public.notifications,
  public.notification_preferences,
  public.email_log,
  public.sms_log,
  public.audit_log,
  public.company_usage_monthly,
  public.rate_limit_counters
RESTART IDENTITY CASCADE;

-- 2) Accounts: keep Pro Roto admins only. Deleting auth.users cascades to
--    sessions, identities and MFA factors. Orphaned auth users (no profile) go too.
DELETE FROM public.users WHERE role <> 'proroto_admin';
DELETE FROM auth.users   WHERE id NOT IN (SELECT id FROM public.users);

-- 3) Companies: keep only the seed Pro Roto company (admin profiles point at it).
--    Deleting a company cascades to its subscription row.
DELETE FROM public.companies WHERE id <> '00000000-0000-0000-0000-000000000001';
INSERT INTO public.companies (id, name, slug, settings)
VALUES ('00000000-0000-0000-0000-000000000001', 'Pro Roto, Inc', 'pro-roto', '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- 4) Storage: NOT deletable from SQL (Supabase blocks it with storage.protect_delete
--    to avoid orphaned files). Empty the buckets through the Storage API instead:
--      Dashboard → Storage → bucket → select the folder → Delete
--    or, from your own machine with the service role key (never in the frontend):
--      curl -X POST "$SUPABASE_URL/storage/v1/bucket/ticket-attachments/empty" \
--        -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H "apikey: $SERVICE_ROLE_KEY"
--      curl -X POST "$SUPABASE_URL/storage/v1/bucket/company-logos/empty" \
--        -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H "apikey: $SERVICE_ROLE_KEY"
--    Verify (reads are allowed):  SELECT bucket_id, count(*) FROM storage.objects GROUP BY 1;

COMMIT;

-- 5) Verify. Expected: every row 0 except companies = 1 and the two users rows = number of admins.
SELECT 'tickets'         AS table_name, count(*) FROM public.tickets
UNION ALL SELECT 'buildings',       count(*) FROM public.buildings
UNION ALL SELECT 'spaces',          count(*) FROM public.spaces
UNION ALL SELECT 'occupants',       count(*) FROM public.occupants
UNION ALL SELECT 'invitations',     count(*) FROM public.invitations
UNION ALL SELECT 'companies',       count(*) FROM public.companies
UNION ALL SELECT 'public.users',    count(*) FROM public.users
UNION ALL SELECT 'auth.users',      count(*) FROM auth.users
UNION ALL SELECT 'storage.objects', count(*) FROM storage.objects;

-- =============================================================================
-- Variant — wipe the admin logins as well (true zero state):
--   replace step 2 with:   DELETE FROM auth.users;
--   afterwards create a new admin in Dashboard → Authentication → Add User,
--   then run scripts/bootstrap-first-admin.sql with that user's UUID.
-- To keep the technician roster, remove `public.technicians,` from step 1.
-- =============================================================================
