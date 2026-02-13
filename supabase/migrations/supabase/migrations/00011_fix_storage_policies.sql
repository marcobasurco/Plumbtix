-- =============================================================================
-- Work Orders — Migration 00011: Fix Storage Policies
-- =============================================================================
-- PROBLEM: Storage policies in 00003 use split_part(name, '/', 2)::uuid to
-- extract the ticket_id from the file path. This is fragile:
--   1. The `name` column format varies across Supabase versions
--   2. UUID cast failures silently reject ALL uploads for ALL roles
--   3. Complex subqueries in storage policies cause performance issues
--
-- FIX: Replace with simple authenticated-user policies. Security is enforced by:
--   • ticket_attachments table RLS (fine-grained per-role SELECT/INSERT)
--   • register-attachment edge function (validates ticket_id + auth)
--   • Signed URLs (5-min expiry, require auth to generate)
--
-- This is the standard Supabase-recommended pattern: simple storage policies
-- + application-level access control through metadata tables.
-- =============================================================================

-- ─── A) Update bucket: add HEIC/HEIF for iPhones ───────────────────────────

UPDATE storage.buckets
SET
  file_size_limit = NULL,  -- No limit (videos compressed client-side)
  allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/heic',
    'image/heif',
    'application/pdf',
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'video/x-msvideo',
    'video/x-matroska'
]
WHERE id = 'ticket-attachments';

-- ─── B) Drop ALL old storage policies ──────────────────────────────────────

DROP POLICY IF EXISTS "ticket_attachments_select" ON storage.objects;
DROP POLICY IF EXISTS "ticket_attachments_insert" ON storage.objects;
DROP POLICY IF EXISTS "ticket_attachments_update" ON storage.objects;
DROP POLICY IF EXISTS "ticket_attachments_delete" ON storage.objects;

-- ─── C) New simplified storage policies ────────────────────────────────────

-- C.1 SELECT: Any authenticated user can read files from the bucket.
-- Real access control: fetchAttachments() queries ticket_attachments with RLS,
-- then calls createSignedUrl() for each file. Users only get URLs for files
-- attached to tickets they can see (via ticket_attachments RLS).
CREATE POLICY "storage_attachments_select" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'ticket-attachments');

-- C.2 INSERT: Any authenticated user can upload to the bucket.
-- Real access control: register-attachment edge function validates:
--   1. User is authenticated (JWT required)
--   2. ticket_id exists
--   3. file_path matches ticket_id
--   4. ticket_attachments INSERT RLS (per-role: admin/PM/resident)
-- Without a successful register-attachment call, the uploaded file is orphaned
-- and will never appear in any UI (no metadata row → invisible).
CREATE POLICY "storage_attachments_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'ticket-attachments');

-- C.3 UPDATE: Only admin and PM roles can modify files.
-- Residents cannot overwrite or rename uploaded files.
CREATE POLICY "storage_attachments_update" ON storage.objects
FOR UPDATE TO authenticated
USING (
    bucket_id = 'ticket-attachments'
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN (
        'proroto_admin', 'pm_admin', 'pm_user'
    )
);

-- C.4 DELETE: Only admin and PM roles can delete files.
CREATE POLICY "storage_attachments_delete" ON storage.objects
FOR DELETE TO authenticated
USING (
    bucket_id = 'ticket-attachments'
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN (
        'proroto_admin', 'pm_admin', 'pm_user'
    )
);

-- ─── D) Verify ─────────────────────────────────────────────────────────────
-- SELECT policyname, cmd
-- FROM pg_policies
-- WHERE schemaname = 'storage' AND tablename = 'objects'
--   AND policyname LIKE 'storage_attachments%'
-- ORDER BY cmd;
--
-- Expected:
--   storage_attachments_delete  | DELETE
--   storage_attachments_insert  | INSERT
--   storage_attachments_select  | SELECT
--   storage_attachments_update  | UPDATE
