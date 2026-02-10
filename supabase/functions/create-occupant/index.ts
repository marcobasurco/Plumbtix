// =============================================================================
// Work Orders — Edge Function: create-occupant
// =============================================================================
// Adds an occupant (tenant/homeowner) to a space.
// Generates invite_token server-side for the claim-resident flow.
// RLS enforces: proroto_admin (all), pm_admin (own company), pm_user (entitled).
// =============================================================================

import { handleCors } from '../_shared/cors.ts';
import { createUserClient, createServiceClient, getAuthenticatedUserId } from '../_shared/supabase.ts';
import { ok, err, unauthorized, serverError } from '../_shared/response.ts';
import { z, parseBody, UUID_REGEX } from '../_shared/validation.ts';
import { notifyResidentClaim } from '../_shared/notifications.ts';

const CreateOccupantSchema = z.object({
  space_id: z.string().regex(UUID_REGEX, 'Invalid space_id'),
  occupant_type: z.enum(['homeowner', 'tenant'], {
    errorMap: () => ({ message: 'occupant_type must be homeowner or tenant' }),
  }),
  name: z.string().min(1, 'Name is required').max(255).transform((v) => v.trim()),
  email: z
    .string()
    .min(1, 'Email is required')
    .max(255)
    .email('Invalid email address')
    .transform((v) => v.trim().toLowerCase()),
  phone: z.string().max(20).nullable().optional().transform((v) => v?.trim() || null),
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

  const parsed = await parseBody(req, CreateOccupantSchema);
  if (!parsed.success) return err('VALIDATION_ERROR', parsed.message);

  const { space_id, occupant_type, name, email, phone } = parsed.data;

  // Generate invite token server-side (more secure than client-side)
  const inviteToken = crypto.randomUUID();

  try {
    const { data: occupant, error: insertErr } = await userClient
      .from('occupants')
      .insert({
        space_id,
        occupant_type,
        name,
        email,
        phone,
        invite_token: inviteToken,
      })
      .select()
      .single();

    if (insertErr) {
      if (insertErr.message?.includes('row-level security')) {
        return err('FORBIDDEN', 'You do not have permission to add occupants to this space', 403);
      }
      if (insertErr.message?.includes('foreign key') && insertErr.message?.includes('space_id')) {
        return err('INVALID_REFERENCE', 'Space not found', 400);
      }
      if (insertErr.message?.includes('duplicate')) {
        return err('DUPLICATE', 'This occupant already exists in this space', 409);
      }
      console.error('[create-occupant] Insert failed:', insertErr.message);
      return serverError('Failed to add occupant');
    }

    console.log('[create-occupant] Created: occupant=%s space=%s user=%s', occupant.id, space_id, userId);

    // ─── Send resident claim email (fire-and-forget) ───
    (async () => {
      try {
        const svc = createServiceClient();
        const { data: space } = await svc
          .from('spaces')
          .select('unit_number, building_id, buildings(name, address_line1)')
          .eq('id', space_id)
          .single();

        if (space && occupant.invite_token) {
          const building = (space as any).buildings;
          await notifyResidentClaim({
            occupantName: name,
            occupantEmail: email,
            buildingName: building?.name || building?.address_line1 || 'Your Building',
            unitNumber: space.unit_number || 'N/A',
            inviteToken: occupant.invite_token,
          });

          // Mark invite as sent
          await svc
            .from('occupants')
            .update({ invite_sent_at: new Date().toISOString() })
            .eq('id', occupant.id);
        }
      } catch (emailErr) {
        console.error('[create-occupant] Email notification error (non-blocking):', emailErr);
      }
    })();

    return ok(occupant, 201);
  } catch (e) {
    console.error('[create-occupant] Unexpected error:', e);
    return serverError('Unexpected error');
  }
});
