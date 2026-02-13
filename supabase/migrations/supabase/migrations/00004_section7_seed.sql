-- ============================================================================
-- SECTION 7 — v1.0.0 — FINAL / LOCKED — DATA SEEDING & SYSTEM BOOTSTRAP
-- ============================================================================
--
-- Pro Roto Work Orders Portal — Technical Specification v1.0.0
--
-- Purpose:
--   Bootstrap minimum required system data so the application can function
--   immediately after deployment, without manual database edits.
--
-- Layered on top of:
--   • Section 4 (Schema) — FINAL / LOCKED
--   • Section 5 (Security/RLS/Triggers) — FINAL / LOCKED
--   • Section 6 (Storage) — FINAL / LOCKED
--
-- This section is OPTIONAL but RECOMMENDED for new deployments.
--
-- DOES NOT MODIFY any previous section objects:
--   ❌ No CREATE/ALTER/DROP TABLE
--   ❌ No CREATE/ALTER TYPE
--   ❌ No CREATE/DROP INDEX
--   ❌ No CREATE/ALTER CONSTRAINT
--   ❌ No CREATE/DROP TRIGGER
--   ❌ No CREATE/REPLACE FUNCTION
--   ❌ No CREATE/DROP POLICY
--
-- ALLOWED OPERATIONS ONLY:
--   ✓ INSERT INTO public.* (seed data)
--   ✓ INSERT ... ON CONFLICT DO NOTHING
--   ✓ Comments and verification queries
--
-- ============================================================================

-- ============================================================================
-- A) SEED DATA
-- ============================================================================

-- ---------------------------------------------------------------------------
-- A.1 DEFAULT PRO ROTO COMPANY
-- ---------------------------------------------------------------------------
--
-- Why this seed exists:
--   The Pro Roto company is the service provider (plumbing contractor) that
--   operates this portal. This company record is required for:
--     • proroto_admin users to be associated with a company
--     • System-level operations that require a company context
--     • Initial admin user creation during first deployment
--
-- This is the ONLY company that should exist at system bootstrap.
-- All other companies (property management clients) are created via the
-- application by proroto_admin users.
--
-- Idempotency:
--   Uses ON CONFLICT (slug) DO NOTHING to allow safe re-runs.
--   The slug 'pro-roto' is unique per Section 4 schema.
--

INSERT INTO public.companies (
    id,
    name,
    slug,
    settings
)
VALUES (
    '00000000-0000-0000-0000-000000000001',  -- Fixed UUID for system reference
    'Pro Roto, Inc',
    'pro-roto',
    '{}'::jsonb
)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- B) VERIFICATION QUERIES
-- ============================================================================
--
-- V.1 Pro Roto company exists
-- SELECT id, name, slug, settings, created_at
--   FROM public.companies
--   WHERE slug = 'pro-roto';
-- Expected: 1 row with name = 'Pro Roto, Inc'
--
-- V.2 Total seed companies (should be exactly 1)
-- SELECT COUNT(*) FROM public.companies WHERE slug = 'pro-roto';
-- Expected: 1
--
-- V.3 Section 4 unchanged (indexes)
-- SELECT COUNT(*) FROM pg_indexes
--   WHERE schemaname = 'public' AND indexname LIKE 'idx_%';
-- Expected: 28
--
-- V.4 Section 5 unchanged (public table policies)
-- SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public';
-- Expected: 41
--
-- V.5 Section 5 unchanged (triggers)
-- SELECT COUNT(*) FROM pg_trigger
--   WHERE tgrelid IN (
--     SELECT oid FROM pg_class WHERE relnamespace = 'public'::regnamespace
--   ) AND NOT tgisinternal;
-- Expected: 8
--
-- V.6 Section 5 unchanged (SECURITY DEFINER functions)
-- SELECT COUNT(*) FROM pg_proc
--   WHERE pronamespace = 'public'::regnamespace AND prosecdef = true;
-- Expected: 7
--
-- V.7 Section 6 unchanged (storage bucket)
-- SELECT id, name, public FROM storage.buckets
--   WHERE id = 'ticket-attachments';
-- Expected: 1 row, public = false
--
-- V.8 Section 6 unchanged (storage policies)
-- SELECT COUNT(*) FROM pg_policies
--   WHERE schemaname = 'storage' AND tablename = 'objects'
--     AND policyname LIKE 'ticket_attachments%';
-- Expected: 4
--
-- ============================================================================
-- C) SECTION 7 SUMMARY
-- ============================================================================
--
--  Object                              Count
--  ----------------------------------- -----
--  Seed companies                          1  (Pro Roto, Inc)
--  Seed users                              0  (none — created via auth flow)
--  Seed buildings                          0  (none — created via app)
--  Seed tickets                            0  (none — created via app)
--  Section 4 modifications                 0
--  Section 5 modifications                 0
--  Section 6 modifications                 0
--
--  Notes:
--  • No user records are seeded — users are created through Supabase Auth
--    and linked via Edge Functions (accept-invitation, claim-resident)
--  • No hardcoded user IDs or auth.users dependencies
--  • The Pro Roto company ID is deterministic (fixed UUID) to allow
--    predictable first-admin setup without database lookups
--  • All other data (PM companies, buildings, spaces, tickets) is created
--    through normal application workflows
--
-- ============================================================================
-- SECTION 7 — v1.0.0 — FINAL / LOCKED
-- ============================================================================
