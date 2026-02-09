// =============================================================================
// PlumbTix — Edge Function: delete-space
// =============================================================================
// Route:  POST /functions/v1/delete-space
// Auth:   JWT required
// Client: User JWT pass-through (RLS enforces building access)
//
// Pre-check: Verifies no tickets or occupants reference this space.
//            tickets.space_id has ON DELETE RESTRICT.
//            occupants.space_id has ON DELETE CASCADE — but we warn anyway.
// =============================================================================

import { handleCors } from '../_shared/cors.ts';
import { createUserClient, getAuthenticatedUserId } from '../_shared/supabase.ts';
import { ok, err, unauthorized, notFound, conflict, serverError } from '../_shared/response.ts';
import { z, parseBody, UUID_REGEX } from '../_shared/validation.ts';

const DeleteSpaceSchema = z.object({
  id: z.string().regex(UUID_REGEX, 'Invalid space id'),
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

  const parsed = await parseBody(req, DeleteSpaceSchema);
  if (!parsed.success) {
    return err('VALIDATION_ERROR', parsed.message);
  }

  const { id } = parsed.data;

  try {
    // ─── Verify space exists and is accessible ───
    const { data: existing, error: fetchErr } = await userClient
      .from('spaces')
      .select('id, space_type, unit_number, common_area_type, building_id')
      .eq('id', id)
      .single();

    if (fetchErr || !existing) {
      return notFound('Space not found or you do not have access');
    }

    // ─── Check for tickets referencing this space (ON DELETE RESTRICT) ───
    const { count: ticketCount } = await userClient
      .from('tickets')
      .select('*', { count: 'exact', head: true })
      .eq('space_id', id);

    if ((ticketCount ?? 0) > 0) {
      const label = existing.unit_number
        ? `Unit ${existing.unit_number}`
        : (existing.common_area_type ?? 'Space');
      return conflict(
        `Cannot delete ${label}: it has ${ticketCount} ticket(s). ` +
          'Delete or reassign tickets first.'
      );
    }

    // ─── Check for occupants (CASCADE would delete — warn user) ───
    const { count: occupantCount } = await userClient
      .from('occupants')
      .select('*', { count: 'exact', head: true })
      .eq('space_id', id);

    if ((occupantCount ?? 0) > 0) {
      const label = existing.unit_number
        ? `Unit ${existing.unit_number}`
        : (existing.common_area_type ?? 'Space');
      return conflict(
        `Cannot delete ${label}: it has ${occupantCount} occupant(s). ` +
          'Remove occupants first.'
      );
    }

    // ─── Delete (RLS enforces permission) ───
    const { error: deleteErr } = await userClient
      .from('spaces')
      .delete()
      .eq('id', id);

    if (deleteErr) {
      if (deleteErr.message?.includes('row-level security')) {
        return err('FORBIDDEN', 'You do not have permission to delete this space', 403);
      }
      if (deleteErr.message?.includes('RESTRICT') || deleteErr.message?.includes('foreign key')) {
        return conflict('Cannot delete: this space has dependent records');
      }
      console.error('[delete-space] Delete failed:', deleteErr.message);
      return serverError('Failed to delete space');
    }

    console.log('[delete-space] Deleted: space=%s, building=%s, user=%s', id, existing.building_id, userId);
    return ok({ deleted: true, id });
  } catch (e) {
    console.error('[delete-space] Unexpected error:', e);
    return serverError('Unexpected error during space deletion');
  }
});
