-- =============================================================================
-- PlumbTix — Migration 00012: Allow Residents to Delete Own Attachments
-- =============================================================================
-- Residents need to delete incorrectly uploaded images.
-- They can only delete attachments they uploaded themselves.
-- =============================================================================

-- ─── A) ticket_attachments DELETE policy for residents ──────────────────────

DROP POLICY IF EXISTS "resident_delete_own_attachments" ON ticket_attachments;
CREATE POLICY "resident_delete_own_attachments" ON ticket_attachments
    FOR DELETE
    USING (
        get_user_role() = 'resident'
        AND uploaded_by_user_id = auth.uid()
        AND ticket_id IN (
            SELECT id FROM public.tickets
            WHERE space_id IN (SELECT get_resident_space_ids())
        )
    );

-- ─── B) Update storage DELETE policy to include residents ──────────────────
-- Residents can delete their own files from the bucket.
-- (The edge function enforces that they can only delete files they uploaded.)

DROP POLICY IF EXISTS "storage_attachments_delete" ON storage.objects;
CREATE POLICY "storage_attachments_delete" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'ticket-attachments');
