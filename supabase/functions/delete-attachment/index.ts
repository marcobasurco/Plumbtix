// =============================================================================
// PlumbTix — Edge Function: delete-attachment
// =============================================================================
// Deletes an attachment's storage file and metadata row.
// RLS enforces:
//   • proroto_admin: can delete any attachment
//   • pm_admin/pm_user: can delete attachments in their company/entitled buildings
//   • resident: can delete ONLY attachments they uploaded themselves
// =============================================================================

import { handleCors } from '../_shared/cors.ts';
import { createUserClient, getAuthenticatedUserId } from '../_shared/supabase.ts';
import { ok, err, unauthorized, serverError } from '../_shared/response.ts';
import { z, parseBody, UUID_REGEX } from '../_shared/validation.ts';

const DeleteAttachmentSchema = z.object({
  id: z.string().regex(UUID_REGEX, 'Invalid attachment id'),
});

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCors();
  if (req.method !== 'POST') return err('METHOD_NOT_ALLOWED', 'POST required', 405);

  // ─── 1. Authenticate ───
  let userClient;
  let userId: string;
  try {
    userClient = createUserClient(req);
    userId = await getAuthenticatedUserId(userClient);
  } catch {
    return unauthorized();
  }

  // ─── 2. Validate body ───
  const parsed = await parseBody(req, DeleteAttachmentSchema);
  if (!parsed.success) return err('VALIDATION_ERROR', parsed.message);

  const { id } = parsed.data;

  try {
    // ─── 3. Fetch attachment metadata (RLS enforces access) ───
    const { data: attachment, error: fetchErr } = await userClient
      .from('ticket_attachments')
      .select('id, file_path, uploaded_by_user_id')
      .eq('id', id)
      .single();

    if (fetchErr || !attachment) {
      return err('NOT_FOUND', 'Attachment not found or you do not have access', 404);
    }

    // ─── 4. Delete from storage ───
    const { error: storageErr } = await userClient
      .storage
      .from('ticket-attachments')
      .remove([attachment.file_path]);

    if (storageErr) {
      console.error('[delete-attachment] Storage delete failed:', storageErr.message);
      // Continue to delete metadata even if storage delete fails
      // (file may already be missing)
    }

    // ─── 5. Delete metadata row (RLS enforces access) ───
    const { error: deleteErr } = await userClient
      .from('ticket_attachments')
      .delete()
      .eq('id', id);

    if (deleteErr) {
      if (deleteErr.message?.includes('row-level security')) {
        return err('FORBIDDEN', 'You do not have permission to delete this attachment', 403);
      }
      console.error('[delete-attachment] Delete failed:', deleteErr.message);
      return serverError('Failed to delete attachment');
    }

    console.log('[delete-attachment] Deleted: attachment=%s file=%s user=%s', id, attachment.file_path, userId);
    return ok({ deleted: true, id });

  } catch (e) {
    console.error('[delete-attachment] Unexpected error:', e);
    return serverError('Unexpected error');
  }
});
