-- ============================================================================
-- SECTION 6 — v1.0.0 — FINAL / LOCKED — STORAGE BUCKETS & ACCESS CONTROL
-- ============================================================================
--
-- Pro Roto Work Orders Portal — Technical Specification v1.0.0
--
-- Layered on top of Section 4 (Schema) and Section 5 (RLS/Triggers).
-- Does NOT modify any Section 4 or Section 5 objects.
--
-- ALLOWED OPERATIONS ONLY:
--   ✓ INSERT INTO storage.buckets
--   ✓ DROP POLICY IF EXISTS ON storage.objects
--   ✓ CREATE POLICY ON storage.objects
--
-- Contents:
--   A) Storage bucket creation           (1 bucket, idempotent)
--   B) Storage RLS policies              (4 policies)
--   C) Verification queries
--
-- Path convention: tickets/{ticket_id}/{filename}
-- Access model aligned with Section 5 RLS:
--   • proroto_admin: full access to all files
--   • pm_admin: access to files for tickets in their company
--   • pm_user: access to files for tickets in entitled buildings
--   • resident: access only to files for tickets in their spaces
--
-- ============================================================================

-- ============================================================================
-- A) STORAGE BUCKET CREATION (IDEMPOTENT)
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'ticket-attachments',
    'ticket-attachments',
    false,  -- Private bucket: NO public/anonymous access
    10485760,  -- 10MB file size limit
    ARRAY[
        'image/jpeg',
        'image/png', 
        'image/gif',
        'image/webp',
        'application/pdf',
        'video/mp4',
        'video/quicktime'
    ]
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- B) STORAGE RLS POLICIES ON storage.objects
-- ============================================================================
--
-- Path format: tickets/{ticket_id}/{filename}
-- Ticket ID extraction: (split_part(name, '/', 2))::uuid
--
-- Policy structure:
--   SELECT - Read files for accessible tickets
--   INSERT - Upload files to accessible tickets
--   UPDATE - Modify files (PMs and admin only, no residents)
--   DELETE - Remove files (PMs and admin only, no residents)
--
-- ============================================================================

-- ---------------------------------------------------------------------------
-- B.1 SELECT POLICY: Read files for tickets user can access
-- ---------------------------------------------------------------------------
-- • proroto_admin: all files
-- • pm_admin: files for tickets in company buildings
-- • pm_user: files for tickets in entitled buildings
-- • resident: files for tickets in their spaces only

DROP POLICY IF EXISTS "ticket_attachments_select" ON storage.objects;
CREATE POLICY "ticket_attachments_select" ON storage.objects
FOR SELECT TO authenticated
USING (
    bucket_id = 'ticket-attachments'
    AND (
        -- proroto_admin: full access
        (SELECT role FROM public.users WHERE id = auth.uid()) = 'proroto_admin'
        OR
        -- pm_admin: tickets in their company
        (
            (SELECT role FROM public.users WHERE id = auth.uid()) = 'pm_admin'
            AND EXISTS (
                SELECT 1 
                FROM public.tickets t
                JOIN public.buildings b ON t.building_id = b.id
                JOIN public.users u ON u.id = auth.uid()
                WHERE t.id = (split_part(name, '/', 2))::uuid
                  AND b.company_id = u.company_id
            )
        )
        OR
        -- pm_user: tickets in entitled buildings within company
        (
            (SELECT role FROM public.users WHERE id = auth.uid()) = 'pm_user'
            AND EXISTS (
                SELECT 1 
                FROM public.tickets t
                JOIN public.buildings b ON t.building_id = b.id
                JOIN public.users u ON u.id = auth.uid()
                JOIN public.building_entitlements be ON be.building_id = t.building_id AND be.user_id = auth.uid()
                WHERE t.id = (split_part(name, '/', 2))::uuid
                  AND b.company_id = u.company_id
            )
        )
        OR
        -- resident: tickets in their own spaces only
        (
            (SELECT role FROM public.users WHERE id = auth.uid()) = 'resident'
            AND EXISTS (
                SELECT 1 
                FROM public.tickets t
                JOIN public.occupants o ON o.space_id = t.space_id AND o.user_id = auth.uid()
                WHERE t.id = (split_part(name, '/', 2))::uuid
            )
        )
    )
);

-- ---------------------------------------------------------------------------
-- B.2 INSERT POLICY: Upload files to accessible tickets
-- ---------------------------------------------------------------------------
-- Same access rules as SELECT

DROP POLICY IF EXISTS "ticket_attachments_insert" ON storage.objects;
CREATE POLICY "ticket_attachments_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'ticket-attachments'
    AND (
        -- proroto_admin: full access
        (SELECT role FROM public.users WHERE id = auth.uid()) = 'proroto_admin'
        OR
        -- pm_admin: tickets in their company
        (
            (SELECT role FROM public.users WHERE id = auth.uid()) = 'pm_admin'
            AND EXISTS (
                SELECT 1 
                FROM public.tickets t
                JOIN public.buildings b ON t.building_id = b.id
                JOIN public.users u ON u.id = auth.uid()
                WHERE t.id = (split_part(name, '/', 2))::uuid
                  AND b.company_id = u.company_id
            )
        )
        OR
        -- pm_user: tickets in entitled buildings within company
        (
            (SELECT role FROM public.users WHERE id = auth.uid()) = 'pm_user'
            AND EXISTS (
                SELECT 1 
                FROM public.tickets t
                JOIN public.buildings b ON t.building_id = b.id
                JOIN public.users u ON u.id = auth.uid()
                JOIN public.building_entitlements be ON be.building_id = t.building_id AND be.user_id = auth.uid()
                WHERE t.id = (split_part(name, '/', 2))::uuid
                  AND b.company_id = u.company_id
            )
        )
        OR
        -- resident: tickets in their own spaces only
        (
            (SELECT role FROM public.users WHERE id = auth.uid()) = 'resident'
            AND EXISTS (
                SELECT 1 
                FROM public.tickets t
                JOIN public.occupants o ON o.space_id = t.space_id AND o.user_id = auth.uid()
                WHERE t.id = (split_part(name, '/', 2))::uuid
            )
        )
    )
);

-- ---------------------------------------------------------------------------
-- B.3 UPDATE POLICY: Modify files (NO resident access)
-- ---------------------------------------------------------------------------
-- • proroto_admin: all files
-- • pm_admin: files in company
-- • pm_user: files in entitled buildings
-- • resident: ❌ NO UPDATE

DROP POLICY IF EXISTS "ticket_attachments_update" ON storage.objects;
CREATE POLICY "ticket_attachments_update" ON storage.objects
FOR UPDATE TO authenticated
USING (
    bucket_id = 'ticket-attachments'
    AND (
        -- proroto_admin: full access
        (SELECT role FROM public.users WHERE id = auth.uid()) = 'proroto_admin'
        OR
        -- pm_admin: tickets in their company
        (
            (SELECT role FROM public.users WHERE id = auth.uid()) = 'pm_admin'
            AND EXISTS (
                SELECT 1 
                FROM public.tickets t
                JOIN public.buildings b ON t.building_id = b.id
                JOIN public.users u ON u.id = auth.uid()
                WHERE t.id = (split_part(name, '/', 2))::uuid
                  AND b.company_id = u.company_id
            )
        )
        OR
        -- pm_user: tickets in entitled buildings within company
        (
            (SELECT role FROM public.users WHERE id = auth.uid()) = 'pm_user'
            AND EXISTS (
                SELECT 1 
                FROM public.tickets t
                JOIN public.buildings b ON t.building_id = b.id
                JOIN public.users u ON u.id = auth.uid()
                JOIN public.building_entitlements be ON be.building_id = t.building_id AND be.user_id = auth.uid()
                WHERE t.id = (split_part(name, '/', 2))::uuid
                  AND b.company_id = u.company_id
            )
        )
        -- NO resident access to UPDATE
    )
)
WITH CHECK (
    bucket_id = 'ticket-attachments'
    AND (
        (SELECT role FROM public.users WHERE id = auth.uid()) = 'proroto_admin'
        OR
        (
            (SELECT role FROM public.users WHERE id = auth.uid()) = 'pm_admin'
            AND EXISTS (
                SELECT 1 
                FROM public.tickets t
                JOIN public.buildings b ON t.building_id = b.id
                JOIN public.users u ON u.id = auth.uid()
                WHERE t.id = (split_part(name, '/', 2))::uuid
                  AND b.company_id = u.company_id
            )
        )
        OR
        (
            (SELECT role FROM public.users WHERE id = auth.uid()) = 'pm_user'
            AND EXISTS (
                SELECT 1 
                FROM public.tickets t
                JOIN public.buildings b ON t.building_id = b.id
                JOIN public.users u ON u.id = auth.uid()
                JOIN public.building_entitlements be ON be.building_id = t.building_id AND be.user_id = auth.uid()
                WHERE t.id = (split_part(name, '/', 2))::uuid
                  AND b.company_id = u.company_id
            )
        )
    )
);

-- ---------------------------------------------------------------------------
-- B.4 DELETE POLICY: Remove files (NO resident access)
-- ---------------------------------------------------------------------------
-- • proroto_admin: all files
-- • pm_admin: files in company
-- • pm_user: files in entitled buildings
-- • resident: ❌ NO DELETE

DROP POLICY IF EXISTS "ticket_attachments_delete" ON storage.objects;
CREATE POLICY "ticket_attachments_delete" ON storage.objects
FOR DELETE TO authenticated
USING (
    bucket_id = 'ticket-attachments'
    AND (
        -- proroto_admin: full access
        (SELECT role FROM public.users WHERE id = auth.uid()) = 'proroto_admin'
        OR
        -- pm_admin: tickets in their company
        (
            (SELECT role FROM public.users WHERE id = auth.uid()) = 'pm_admin'
            AND EXISTS (
                SELECT 1 
                FROM public.tickets t
                JOIN public.buildings b ON t.building_id = b.id
                JOIN public.users u ON u.id = auth.uid()
                WHERE t.id = (split_part(name, '/', 2))::uuid
                  AND b.company_id = u.company_id
            )
        )
        OR
        -- pm_user: tickets in entitled buildings within company
        (
            (SELECT role FROM public.users WHERE id = auth.uid()) = 'pm_user'
            AND EXISTS (
                SELECT 1 
                FROM public.tickets t
                JOIN public.buildings b ON t.building_id = b.id
                JOIN public.users u ON u.id = auth.uid()
                JOIN public.building_entitlements be ON be.building_id = t.building_id AND be.user_id = auth.uid()
                WHERE t.id = (split_part(name, '/', 2))::uuid
                  AND b.company_id = u.company_id
            )
        )
        -- NO resident access to DELETE
    )
);

-- ============================================================================
-- C) VERIFICATION QUERIES
-- ============================================================================
--
-- V.1 Bucket exists and is private
-- SELECT id, name, public, file_size_limit, allowed_mime_types
--   FROM storage.buckets
--   WHERE id = 'ticket-attachments';
-- Expected: 1 row, public = false
--
-- V.2 Storage policies on storage.objects (expected: 4)
-- SELECT policyname, cmd
--   FROM pg_policies
--   WHERE schemaname = 'storage' AND tablename = 'objects'
--     AND policyname LIKE 'ticket_attachments%'
--   ORDER BY policyname;
-- Expected:
--   ticket_attachments_delete  | DELETE
--   ticket_attachments_insert  | INSERT
--   ticket_attachments_select  | SELECT
--   ticket_attachments_update  | UPDATE
--
-- V.3 Section 4 unchanged (public indexes)
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
-- V.7 No anonymous/public access to bucket
-- SELECT id, public FROM storage.buckets WHERE id = 'ticket-attachments';
-- Expected: public = false
--
-- ============================================================================
-- SECTION 6 SUMMARY
-- ============================================================================
--
--  Object                              Count
--  ----------------------------------- -----
--  Storage buckets                         1  (ticket-attachments, private)
--  Storage RLS policies                    4  (SELECT, INSERT, UPDATE, DELETE)
--  Section 4 modifications                 0
--  Section 5 modifications                 0
--
--  Access Matrix:
--  ┌─────────────────┬────────┬────────┬────────┬────────┐
--  │ Role            │ SELECT │ INSERT │ UPDATE │ DELETE │
--  ├─────────────────┼────────┼────────┼────────┼────────┤
--  │ proroto_admin   │   ✓    │   ✓    │   ✓    │   ✓    │
--  │ pm_admin        │   ✓*   │   ✓*   │   ✓*   │   ✓*   │
--  │ pm_user         │   ✓**  │   ✓**  │   ✓**  │   ✓**  │
--  │ resident        │   ✓*** │   ✓*** │   ✗    │   ✗    │
--  │ anonymous       │   ✗    │   ✗    │   ✗    │   ✗    │
--  └─────────────────┴────────┴────────┴────────┴────────┘
--  *   = within company only
--  **  = within entitled buildings only
--  *** = within own spaces only
--
-- ============================================================================
-- SECTION 6 — v1.0.0 — FINAL / LOCKED
-- ============================================================================
