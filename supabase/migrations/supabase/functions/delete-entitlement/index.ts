// =============================================================================
// Work Orders — Edge Function: delete-entitlement
// =============================================================================

import { handleCors } from '../_shared/cors.ts';
import { createUserClient, getAuthenticatedUserId } from '../_shared/supabase.ts';
import { ok, err, unauthorized, notFound, serverError } from '../_shared/response.ts';
import { z, parseBody, UUID_REGEX } from '../_shared/validation.ts';

const DeleteEntitlementSchema = z.object({
  id: z.string().regex(UUID_REGEX, 'Invalid entitlement id'),
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

  const parsed = await parseBody(req, DeleteEntitlementSchema);
  if (!parsed.success) return err('VALIDATION_ERROR', parsed.message);

  const { id } = parsed.data;

  try {
    const { error: deleteErr } = await userClient
      .from('building_entitlements')
      .delete()
      .eq('id', id);

    if (deleteErr) {
      if (deleteErr.message?.includes('row-level security')) {
        return err('FORBIDDEN', 'You do not have permission to manage this entitlement', 403);
      }
      console.error('[delete-entitlement] Delete failed:', deleteErr.message);
      return serverError('Failed to delete entitlement');
    }

    console.log('[delete-entitlement] Deleted: entitlement=%s by=%s', id, userId);
    return ok({ deleted: true, id });
  } catch (e) {
    console.error('[delete-entitlement] Unexpected error:', e);
    return serverError('Unexpected error');
  }
});
