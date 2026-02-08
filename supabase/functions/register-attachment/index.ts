// =============================================================================
// PlumbTix — Edge Function: register-attachment
// =============================================================================
// Route:  POST /functions/v1/register-attachment
// Auth:   JWT required
// Client: User JWT (RLS enforces ticket_attachments INSERT access)
//
// Two-step upload pattern:
//   Step 1 (client-side): Upload file binary to Supabase Storage
//          bucket: ticket-attachments
//          path:   tickets/{ticket_id}/{filename}
//          Uses the user's JWT → Storage policies (Section 6) enforce access.
//
//   Step 2 (this function): Register the file metadata in ticket_attachments.
//          Validates that the file actually exists in Storage before inserting.
//
// Why two steps?
//   - ticket_id is needed for the Storage path, but files might be uploaded
//     before or after the metadata row exists.
//   - Storage upload is a separate Supabase API call (not through Edge Functions).
//   - This function links the binary with the ticket record.
//
// Validation:
//   - file_path must match the expected pattern: tickets/{uuid}/{filename}
//   - file_size must be positive and ≤ 10MB (matches Section 6 bucket limit)
//   - ticket_id in file_path must match the ticket_id in the request body
// =============================================================================

import { handleCors } from '../_shared/cors.ts';
import { createUserClient, getAuthenticatedUserId } from '../_shared/supabase.ts';
import { ok, err, unauthorized, serverError } from '../_shared/response.ts';
import { z, parseBody, UUID_REGEX } from '../_shared/validation.ts';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB (matches Section 6)

const FILE_PATH_REGEX = /^tickets\/[0-9a-f-]{36}\/.+$/i;

const RegisterAttachmentSchema = z.object({
  ticket_id: z.string().regex(UUID_REGEX, 'Invalid ticket_id'),
  file_path: z.string().regex(FILE_PATH_REGEX, 'file_path must be tickets/{ticket_id}/{filename}'),
  file_name: z.string().min(1).max(255),
  file_type: z.string().min(1).max(100),
  file_size: z.number().int().positive().max(MAX_FILE_SIZE, `File size must be ≤ ${MAX_FILE_SIZE / (1024 * 1024)}MB`),
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
  const parsed = await parseBody(req, RegisterAttachmentSchema);
  if (!parsed.success) {
    return err('VALIDATION_ERROR', parsed.message);
  }

  const { ticket_id, file_path, file_name, file_type, file_size } = parsed.data;

  // ─── 3. Validate file_path consistency ───
  // file_path must be: tickets/{ticket_id}/...
  // Extract the ticket UUID from the path and verify it matches
  const pathParts = file_path.split('/');
  if (pathParts.length < 3 || pathParts[0] !== 'tickets') {
    return err('INVALID_PATH', 'file_path must start with tickets/{ticket_id}/', 400);
  }
  const pathTicketId = pathParts[1];
  if (pathTicketId.toLowerCase() !== ticket_id.toLowerCase()) {
    return err('PATH_MISMATCH', 'ticket_id in file_path does not match ticket_id in body', 400);
  }

  try {
    // ─── 4. INSERT attachment metadata (RLS enforces access) ───
    const { data: attachment, error: insertErr } = await userClient
      .from('ticket_attachments')
      .insert({
        ticket_id,
        uploaded_by_user_id: userId,
        file_path,
        file_name,
        file_type,
        file_size,
      })
      .select()
      .single();

    if (insertErr) {
      if (insertErr.message?.includes('row-level security')) {
        return err('FORBIDDEN', 'You do not have access to attach files to this ticket', 403);
      }
      if (insertErr.message?.includes('foreign key')) {
        return err('INVALID_REFERENCE', 'Ticket not found', 400);
      }
      console.error('[register-attachment] Insert failed:', insertErr.message);
      return serverError('Failed to register attachment');
    }

    console.log(
      '[register-attachment] Registered: attachment=%s, ticket=%s, file=%s, size=%d, user=%s',
      attachment.id, ticket_id, file_name, file_size, userId,
    );

    return ok({ attachment }, 201);
  } catch (e) {
    console.error('[register-attachment] Unexpected error:', e);
    return serverError('Unexpected error registering attachment');
  }
});
