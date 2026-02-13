// =============================================================================
// Work Orders — Edge Function: create-space
// =============================================================================
// Route:  POST /functions/v1/create-space
// Auth:   JWT required
// Client: User JWT pass-through (RLS enforces building access)
//
// Validates the discriminated space_type constraint:
//   unit        → unit_number required, common_area_type must be null
//   common_area → common_area_type required, unit_number must be null
// =============================================================================

import { handleCors } from '../_shared/cors.ts';
import { createUserClient, getAuthenticatedUserId } from '../_shared/supabase.ts';
import { ok, err, unauthorized, serverError } from '../_shared/response.ts';
import { z, parseBody, UUID_REGEX } from '../_shared/validation.ts';

const COMMON_AREA_TYPES = [
  'boiler_room', 'pool', 'garage', 'roof',
  'crawlspace', 'laundry', 'water_room', 'other',
] as const;

// Discriminated union: mirrors the DB CHECK constraint exactly
const UnitSchema = z.object({
  building_id: z.string().regex(UUID_REGEX, 'Invalid building_id'),
  space_type: z.literal('unit'),
  unit_number: z.string().min(1, 'Unit number is required for units').max(20).transform((v) => v.trim()),
  common_area_type: z.null().optional().default(null),
  floor: z.number().int().optional().nullable().default(null),
  bedrooms: z.number().int().optional().nullable().default(null),
  bathrooms: z.number().optional().nullable().default(null),
});

const CommonAreaSchema = z.object({
  building_id: z.string().regex(UUID_REGEX, 'Invalid building_id'),
  space_type: z.literal('common_area'),
  unit_number: z.null().optional().default(null),
  common_area_type: z.enum(COMMON_AREA_TYPES, {
    errorMap: () => ({ message: 'Invalid common area type' }),
  }),
  floor: z.number().int().optional().nullable().default(null),
  bedrooms: z.null().optional().default(null),
  bathrooms: z.null().optional().default(null),
});

const CreateSpaceSchema = z.discriminatedUnion('space_type', [UnitSchema, CommonAreaSchema]);

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
  const parsed = await parseBody(req, CreateSpaceSchema);
  if (!parsed.success) {
    return err('VALIDATION_ERROR', parsed.message);
  }

  const spaceData = parsed.data;

  // ─── Insert space (RLS enforces building access) ───
  try {
    const { data: space, error: insertErr } = await userClient
      .from('spaces')
      .insert({
        building_id: spaceData.building_id,
        space_type: spaceData.space_type,
        unit_number: spaceData.unit_number ?? null,
        common_area_type: spaceData.common_area_type ?? null,
        floor: spaceData.floor ?? null,
        bedrooms: spaceData.bedrooms ?? null,
        bathrooms: spaceData.bathrooms ?? null,
      })
      .select()
      .single();

    if (insertErr) {
      if (insertErr.message?.includes('row-level security')) {
        return err('FORBIDDEN', 'You do not have permission to add spaces to this building', 403);
      }
      if (insertErr.message?.includes('foreign key')) {
        return err('INVALID_REFERENCE', 'Invalid building_id', 400);
      }
      if (insertErr.message?.includes('check constraint') || insertErr.message?.includes('spaces_unit_number_check')) {
        return err(
          'CONSTRAINT_VIOLATION',
          'Units require unit_number; common areas require common_area_type',
          400
        );
      }
      if (insertErr.message?.includes('duplicate')) {
        return err('DUPLICATE', 'A space with this identifier already exists in this building', 409);
      }
      console.error('[create-space] Insert failed:', insertErr.message);
      return serverError('Failed to create space');
    }

    console.log(
      '[create-space] Created: space=%s, building=%s, type=%s, user=%s',
      space.id, spaceData.building_id, spaceData.space_type, userId
    );

    return ok(space, 201);
  } catch (e) {
    console.error('[create-space] Unexpected error:', e);
    return serverError('Unexpected error during space creation');
  }
});
