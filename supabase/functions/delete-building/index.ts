// =============================================================================
// PlumbTix — Edge Function: delete-building
// =============================================================================
// Route:  POST /functions/v1/delete-building
// Auth:   JWT required
// Client: User JWT pass-through (RLS enforces company scoping)
//
// Pre-check: Verifies no dependent spaces or tickets exist before deletion.
//            Buildings table has ON DELETE CASCADE for spaces, but tickets
//            reference buildings with ON DELETE RESTRICT — so Postgres would
//            block the delete anyway. We check upfront to give a clear message.
//
// Security:
//   - RLS enforces: proroto_admin (all), pm_admin (own company only)
// =============================================================================

import { handleCors } from '../_shared/cors.ts';
import { createUserClient, getAuthenticatedUserId } from '../_shared/supabase.ts';
import { ok, err, unauthorized, notFound, conflict, serverError } from '../_shared/response.ts';
import { z, parseBody, UUID_REGEX } from '../_shared/validation.ts';

const DeleteBuildingSchema = z.object({
  id: z.string().regex(UUID_REGEX, 'Invalid building id'),
});

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCors();
  if (req.method !== 'POST') return err('METHOD_NOT_ALLOWED', 'POST required', 405);

  // ─── Authenticate ───
  let userClient;
  let userId: string;
  try {
    userClient = createUserClient(req);
    userId = await getAuthenticatedUserId(userClient);
  } catch {
    return unauthorized();
  }

  // ─── Validate body ───
  const parsed = await parseBody(req, DeleteBuildingSchema);
  if (!parsed.success) {
    return err('VALIDATION_ERROR', parsed.message);
  }

  const { id } = parsed.data;

  try {
    // ─── Check the building exists and is visible to this user ───
    const { data: existing, error: fetchErr } = await userClient
      .from('buildings')
      .select('id, name, address_line1')
      .eq('id', id)
      .single();

    if (fetchErr || !existing) {
      return notFound('Building not found or you do not have access');
    }

    // ─── Check for dependent tickets (ON DELETE RESTRICT) ───
    const { count: ticketCount, error: ticketErr } = await userClient
      .from('tickets')
      .select('*', { count: 'exact', head: true })
      .eq('building_id', id);

    if (ticketErr) {
      console.error('[delete-building] Ticket count failed:', ticketErr.message);
      return serverError('Failed to check building dependencies');
    }

    if ((ticketCount ?? 0) > 0) {
      return conflict(
        `Cannot delete building "${existing.name || existing.address_line1}": ` +
          `it has ${ticketCount} ticket(s). Delete or reassign tickets first.`
      );
    }

    // ─── Check for spaces (CASCADE would delete them — warn the user) ───
    const { count: spaceCount } = await userClient
      .from('spaces')
      .select('*', { count: 'exact', head: true })
      .eq('building_id', id);

    if ((spaceCount ?? 0) > 0) {
      return conflict(
        `Cannot delete building "${existing.name || existing.address_line1}": ` +
          `it has ${spaceCount} space(s). Remove all spaces first.`
      );
    }

    // ─── Delete (RLS enforces permission) ───
    const { error: deleteErr } = await userClient
      .from('buildings')
      .delete()
      .eq('id', id);

    if (deleteErr) {
      if (deleteErr.message?.includes('row-level security')) {
        return err('FORBIDDEN', 'You do not have permission to delete this building', 403);
      }
      if (deleteErr.message?.includes('foreign key') || deleteErr.message?.includes('RESTRICT')) {
        return conflict('Cannot delete: this building has dependent records');
      }
      console.error('[delete-building] Delete failed:', deleteErr.message);
      return serverError('Failed to delete building');
    }

    console.log('[delete-building] Deleted: building=%s, user=%s', id, userId);
    return ok({ deleted: true, id });
  } catch (e) {
    console.error('[delete-building] Unexpected error:', e);
    return serverError('Unexpected error during building deletion');
  }
});
