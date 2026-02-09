// =============================================================================
// PlumbTix — Edge Function: update-building
// =============================================================================
// Route:  POST /functions/v1/update-building
// Auth:   JWT required
// Client: User JWT pass-through (RLS enforces company scoping)
//
// Security:
//   - RLS enforces: proroto_admin (all), pm_admin (own company only)
//   - pm_user / resident: blocked by RLS UPDATE policy
// =============================================================================

import { handleCors } from '../_shared/cors.ts';
import { createUserClient, getAuthenticatedUserId } from '../_shared/supabase.ts';
import { ok, err, unauthorized, notFound, serverError } from '../_shared/response.ts';
import { z, parseBody, UUID_REGEX } from '../_shared/validation.ts';

const UpdateBuildingSchema = z.object({
  id: z.string().regex(UUID_REGEX, 'Invalid building id'),
  name: z.string().max(255).nullable().optional().transform((v) => v?.trim() || null),
  address_line1: z.string().min(1, 'Address is required').max(255).transform((v) => v.trim()),
  address_line2: z.string().max(255).nullable().optional().transform((v) => v?.trim() || null),
  city: z.string().min(1, 'City is required').max(100).transform((v) => v.trim()),
  state: z
    .string()
    .length(2, 'State must be exactly 2 characters')
    .transform((v) => v.trim().toUpperCase()),
  zip: z
    .string()
    .min(1, 'ZIP is required')
    .max(10)
    .regex(/^\d{5}(-\d{4})?$/, 'ZIP must be 5 digits or 5+4 format')
    .transform((v) => v.trim()),
  gate_code: z.string().max(50).nullable().optional().transform((v) => v?.trim() || null),
  water_shutoff_location: z.string().max(500).nullable().optional().transform((v) => v?.trim() || null),
  gas_shutoff_location: z.string().max(500).nullable().optional().transform((v) => v?.trim() || null),
  onsite_contact_name: z.string().max(255).nullable().optional().transform((v) => v?.trim() || null),
  onsite_contact_phone: z.string().max(20).nullable().optional().transform((v) => v?.trim() || null),
  access_notes: z.string().nullable().optional().transform((v) => v?.trim() || null),
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
  const parsed = await parseBody(req, UpdateBuildingSchema);
  if (!parsed.success) {
    return err('VALIDATION_ERROR', parsed.message);
  }

  const { id, ...updateFields } = parsed.data;

  // ─── Update building (RLS enforces ownership) ───
  try {
    const { data: building, error: updateErr } = await userClient
      .from('buildings')
      .update(updateFields)
      .eq('id', id)
      .select()
      .single();

    if (updateErr) {
      if (updateErr.message?.includes('row-level security')) {
        return err('FORBIDDEN', 'You do not have permission to update this building', 403);
      }
      // "0 rows" → building not found or not visible to this user
      if (updateErr.code === 'PGRST116') {
        return notFound('Building not found or you do not have access');
      }
      console.error('[update-building] Update failed:', updateErr.message);
      return serverError('Failed to update building');
    }

    console.log('[update-building] Updated: building=%s, user=%s', id, userId);
    return ok(building);
  } catch (e) {
    console.error('[update-building] Unexpected error:', e);
    return serverError('Unexpected error during building update');
  }
});
