// =============================================================================
// Work Orders — Edge Function: update-space
// =============================================================================
// Route:  POST /functions/v1/update-space
// Auth:   JWT required
// Client: User JWT pass-through (RLS enforces building access)
// =============================================================================

import { handleCors } from '../_shared/cors.ts';
import { createUserClient, getAuthenticatedUserId } from '../_shared/supabase.ts';
import { ok, err, unauthorized, notFound, serverError } from '../_shared/response.ts';
import { z, parseBody, UUID_REGEX } from '../_shared/validation.ts';

const COMMON_AREA_TYPES = [
  'boiler_room', 'pool', 'garage', 'roof',
  'crawlspace', 'laundry', 'water_room', 'other',
] as const;

const UpdateUnitSchema = z.object({
  id: z.string().regex(UUID_REGEX, 'Invalid space id'),
  space_type: z.literal('unit'),
  unit_number: z.string().min(1).max(20).transform((v) => v.trim()),
  common_area_type: z.null().optional().default(null),
  floor: z.number().int().optional().nullable().default(null),
  bedrooms: z.number().int().optional().nullable().default(null),
  bathrooms: z.number().optional().nullable().default(null),
});

const UpdateCommonAreaSchema = z.object({
  id: z.string().regex(UUID_REGEX, 'Invalid space id'),
  space_type: z.literal('common_area'),
  unit_number: z.null().optional().default(null),
  common_area_type: z.enum(COMMON_AREA_TYPES),
  floor: z.number().int().optional().nullable().default(null),
  bedrooms: z.null().optional().default(null),
  bathrooms: z.null().optional().default(null),
});

const UpdateSpaceSchema = z.discriminatedUnion('space_type', [
  UpdateUnitSchema,
  UpdateCommonAreaSchema,
]);

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

  const parsed = await parseBody(req, UpdateSpaceSchema);
  if (!parsed.success) {
    return err('VALIDATION_ERROR', parsed.message);
  }

  const { id, ...updateFields } = parsed.data;

  try {
    const { data: space, error: updateErr } = await userClient
      .from('spaces')
      .update({
        space_type: updateFields.space_type,
        unit_number: updateFields.unit_number ?? null,
        common_area_type: updateFields.common_area_type ?? null,
        floor: updateFields.floor ?? null,
        bedrooms: updateFields.bedrooms ?? null,
        bathrooms: updateFields.bathrooms ?? null,
      })
      .eq('id', id)
      .select()
      .single();

    if (updateErr) {
      if (updateErr.message?.includes('row-level security')) {
        return err('FORBIDDEN', 'You do not have permission to update this space', 403);
      }
      if (updateErr.code === 'PGRST116') {
        return notFound('Space not found or you do not have access');
      }
      if (updateErr.message?.includes('check constraint')) {
        return err('CONSTRAINT_VIOLATION', 'Units require unit_number; common areas require common_area_type', 400);
      }
      console.error('[update-space] Update failed:', updateErr.message);
      return serverError('Failed to update space');
    }

    console.log('[update-space] Updated: space=%s, user=%s', id, userId);
    return ok(space);
  } catch (e) {
    console.error('[update-space] Unexpected error:', e);
    return serverError('Unexpected error during space update');
  }
});
