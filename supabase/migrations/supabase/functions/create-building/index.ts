// =============================================================================
// Work Orders — Edge Function: create-building
// =============================================================================
// Route:  POST /functions/v1/create-building
// Auth:   JWT required
// Client: User JWT pass-through (RLS enforces company scoping)
//
// Flow:
//   1. Authenticate caller via JWT
//   2. Validate request body with Zod schema (mirrors DB constraints)
//   3. INSERT building (RLS enforces access — only proroto_admin + pm_admin)
//   4. Return created building
//
// Security:
//   - RLS (Section 5) enforces:
//     • proroto_admin: can create for any company
//     • pm_admin: can create for own company only
//     • pm_user / resident: blocked by RLS
// =============================================================================

import { handleCors } from '../_shared/cors.ts';
import { createUserClient, getAuthenticatedUserId } from '../_shared/supabase.ts';
import { ok, err, unauthorized, serverError } from '../_shared/response.ts';
import { z, parseBody, UUID_REGEX } from '../_shared/validation.ts';

// ---------------------------------------------------------------------------
// Validation schema — mirrors buildings table constraints exactly
// ---------------------------------------------------------------------------

const CreateBuildingSchema = z.object({
  company_id: z.string().regex(UUID_REGEX, 'Invalid company_id'),
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
  onsite_contact_phone: z
    .string()
    .max(20)
    .nullable()
    .optional()
    .transform((v) => v?.trim() || null),
  access_notes: z.string().nullable().optional().transform((v) => v?.trim() || null),
});

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

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
  const parsed = await parseBody(req, CreateBuildingSchema);
  if (!parsed.success) {
    return err('VALIDATION_ERROR', parsed.message);
  }

  const {
    company_id,
    name,
    address_line1,
    address_line2,
    city,
    state,
    zip,
    gate_code,
    water_shutoff_location,
    gas_shutoff_location,
    onsite_contact_name,
    onsite_contact_phone,
    access_notes,
  } = parsed.data;

  // ─── Insert building (RLS enforces role + company scoping) ───
  try {
    const { data: building, error: insertErr } = await userClient
      .from('buildings')
      .insert({
        company_id,
        name,
        address_line1,
        address_line2,
        city,
        state,
        zip,
        gate_code,
        water_shutoff_location,
        gas_shutoff_location,
        onsite_contact_name,
        onsite_contact_phone,
        access_notes,
      })
      .select()
      .single();

    if (insertErr) {
      if (insertErr.message?.includes('row-level security')) {
        return err(
          'FORBIDDEN',
          'You do not have permission to create buildings for this company',
          403
        );
      }
      if (insertErr.message?.includes('foreign key')) {
        return err('INVALID_REFERENCE', 'Invalid company_id', 400);
      }
      if (insertErr.message?.includes('duplicate')) {
        return err('DUPLICATE', 'A building with this address already exists', 409);
      }
      console.error('[create-building] Insert failed:', insertErr.message);
      return serverError('Failed to create building');
    }

    console.log(
      '[create-building] Created: building=%s, company=%s, user=%s',
      building.id,
      company_id,
      userId
    );

    return ok(building, 201);
  } catch (e) {
    console.error('[create-building] Unexpected error:', e);
    return serverError('Unexpected error during building creation');
  }
});
