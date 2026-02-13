// =============================================================================
// Work Orders — Edge Function: create-entitlement
// =============================================================================
// Grants a pm_user access to a specific building.
// Only proroto_admin and pm_admin (for their own company) can grant entitlements.
// RLS enforces company scoping.
// =============================================================================

import { handleCors } from '../_shared/cors.ts';
import { createUserClient, getAuthenticatedUserId } from '../_shared/supabase.ts';
import { ok, err, unauthorized, serverError } from '../_shared/response.ts';
import { z, parseBody, UUID_REGEX } from '../_shared/validation.ts';

const CreateEntitlementSchema = z.object({
  building_id: z.string().regex(UUID_REGEX, 'Invalid building_id'),
  user_id: z.string().regex(UUID_REGEX, 'Invalid user_id'),
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

  const parsed = await parseBody(req, CreateEntitlementSchema);
  if (!parsed.success) return err('VALIDATION_ERROR', parsed.message);

  const { building_id, user_id } = parsed.data;

  try {
    const { data: entitlement, error: insertErr } = await userClient
      .from('building_entitlements')
      .insert({ building_id, user_id })
      .select()
      .single();

    if (insertErr) {
      if (insertErr.message?.includes('row-level security')) {
        return err('FORBIDDEN', 'You do not have permission to manage entitlements for this building', 403);
      }
      if (insertErr.message?.includes('duplicate') || insertErr.message?.includes('building_entitlements_user_building_unique')) {
        return err('DUPLICATE', 'This user already has access to this building', 409);
      }
      if (insertErr.message?.includes('foreign key')) {
        const entity = insertErr.message.includes('user_id') ? 'User' : 'Building';
        return err('INVALID_REFERENCE', `${entity} not found`, 400);
      }
      console.error('[create-entitlement] Insert failed:', insertErr.message);
      return serverError('Failed to create entitlement');
    }

    console.log('[create-entitlement] Created: building=%s target_user=%s by=%s', building_id, user_id, userId);
    return ok(entitlement, 201);
  } catch (e) {
    console.error('[create-entitlement] Unexpected error:', e);
    return serverError('Unexpected error');
  }
});
