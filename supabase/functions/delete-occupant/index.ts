// =============================================================================
// PlumbTix — Edge Function: delete-occupant
// =============================================================================

import { handleCors } from '../_shared/cors.ts';
import { createUserClient, getAuthenticatedUserId } from '../_shared/supabase.ts';
import { ok, err, unauthorized, notFound, serverError } from '../_shared/response.ts';
import { z, parseBody, UUID_REGEX } from '../_shared/validation.ts';

const DeleteOccupantSchema = z.object({
  id: z.string().regex(UUID_REGEX, 'Invalid occupant id'),
});

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCors();
  if (req.method !== 'POST') return err('METHOD_NOT_ALLOWED', 'POST required', 405);

  let userClient;
  let userId: string;
  try {
    userClient = createUserClient(req);
    userId = await getAuthenticatedUserId(userClient);
  } catch {
    return unauthorized();
  }

  const parsed = await parseBody(req, DeleteOccupantSchema);
  if (!parsed.success) return err('VALIDATION_ERROR', parsed.message);

  const { id } = parsed.data;

  try {
    // Verify occupant exists + get details before deleting
    const { data: occupant, error: fetchErr } = await userClient
      .from('occupants')
      .select('id, name, user_id, space_id')
      .eq('id', id)
      .single();

    if (fetchErr || !occupant) {
      return notFound('Occupant not found or you do not have access');
    }

    // If occupant has claimed their account, check for open tickets
    if (occupant.user_id) {
      const { data: openTickets } = await userClient
        .from('tickets')
        .select('id')
        .eq('reported_by_user_id', occupant.user_id)
        .not('status', 'in', '("completed","invoiced","cancelled")')
        .limit(1);

      if (openTickets && openTickets.length > 0) {
        return err(
          'HAS_DEPENDENCIES',
          `Cannot delete ${occupant.name} — they have open tickets. Close or reassign first.`,
          409,
        );
      }
    }

    const { error: deleteErr } = await userClient
      .from('occupants')
      .delete()
      .eq('id', id);

    if (deleteErr) {
      if (deleteErr.message?.includes('row-level security')) {
        return err('FORBIDDEN', 'You do not have permission to remove this occupant', 403);
      }
      console.error('[delete-occupant] Delete failed:', deleteErr.message);
      return serverError('Failed to delete occupant');
    }

    console.log('[delete-occupant] Deleted: occupant=%s user=%s', id, userId);
    return ok({ deleted: true, id });
  } catch (e) {
    console.error('[delete-occupant] Unexpected error:', e);
    return serverError('Unexpected error');
  }
});
