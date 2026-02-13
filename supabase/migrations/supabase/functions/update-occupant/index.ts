// =============================================================================
// Work Orders — Edge Function: update-occupant
// =============================================================================
// Route:  PUT /functions/v1/update-occupant
// Auth:   JWT required (proroto_admin, pm_admin, pm_user with entitlement)
//
// Updates occupant details (name, email, phone, type).
// If resend_invite=true or email changed, regenerates invite_token and
// resends the claim email.
// =============================================================================

import { handleCors } from '../_shared/cors.ts';
import { createUserClient, createServiceClient, getAuthenticatedUserId } from '../_shared/supabase.ts';
import { ok, err, unauthorized, serverError } from '../_shared/response.ts';
import { z, parseBody, UUID_REGEX } from '../_shared/validation.ts';

const UpdateOccupantSchema = z.object({
  occupant_id: z.string().regex(UUID_REGEX, 'Invalid occupant_id'),
  name: z.string().min(1).max(255).optional(),
  email: z.string().email('Invalid email').optional(),
  phone: z.string().max(20).nullable().optional(),
  occupant_type: z.enum(['homeowner', 'tenant']).optional(),
  resend_invite: z.boolean().optional().default(false),
});

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCors();
  if (req.method !== 'PUT' && req.method !== 'POST')
    return err('METHOD_NOT_ALLOWED', 'PUT or POST required', 405);

  let userClient;
  let userId: string;
  try {
    userClient = createUserClient(req);
    userId = await getAuthenticatedUserId(userClient);
  } catch {
    return unauthorized();
  }

  const parsed = await parseBody(req, UpdateOccupantSchema);
  if (!parsed.success) return err('VALIDATION_ERROR', parsed.message);

  const { occupant_id, name, email, phone, occupant_type, resend_invite } = parsed.data;

  try {
    const svc = createServiceClient();

    // Fetch existing occupant
    const { data: existing, error: fetchErr } = await svc
      .from('occupants')
      .select('id, space_id, name, email, phone, occupant_type, invite_token, claimed_at')
      .eq('id', occupant_id)
      .single();

    if (fetchErr || !existing) {
      return err('NOT_FOUND', 'Occupant not found', 404);
    }

    // Build update payload
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name.trim();
    if (email !== undefined) updates.email = email.trim().toLowerCase();
    if (phone !== undefined) updates.phone = phone?.trim() || null;
    if (occupant_type !== undefined) updates.occupant_type = occupant_type;

    const emailChanged = email !== undefined && email.trim().toLowerCase() !== existing.email;
    const shouldResendInvite = (resend_invite || emailChanged) && !existing.claimed_at;

    if (shouldResendInvite) {
      updates.invite_token = crypto.randomUUID();
      updates.invite_sent_at = new Date().toISOString();
      // If the occupant was linked to a user via the old email, don't change user_id here
    }

    if (Object.keys(updates).length === 0 && !shouldResendInvite) {
      return ok({ occupant: existing, message: 'No changes' });
    }

    // Update via user client (RLS enforces permissions)
    const { data: updated, error: updateErr } = await userClient
      .from('occupants')
      .update(updates)
      .eq('id', occupant_id)
      .select()
      .single();

    if (updateErr) {
      if (updateErr.message?.includes('row-level security')) {
        return err('FORBIDDEN', 'You do not have permission to update this occupant', 403);
      }
      console.error('[update-occupant] Update failed:', updateErr.message);
      return serverError('Failed to update occupant');
    }

    console.log(
      '[update-occupant] Updated: occupant=%s email=%s→%s resend=%s by=%s',
      occupant_id, existing.email, updates.email ?? existing.email, shouldResendInvite, userId,
    );

    // Send claim email if needed (fire-and-forget)
    if (shouldResendInvite && updated.invite_token) {
      (async () => {
        try {
          const { data: space } = await svc
            .from('spaces')
            .select('unit_number, building_id, buildings(name, address_line1)')
            .eq('id', existing.space_id)
            .single();

          if (space) {
            const building = (space as any).buildings;
            const { notifyResidentClaim } = await import('../_shared/notifications.ts');
            await notifyResidentClaim({
              occupantName: updated.name,
              occupantEmail: updated.email,
              buildingName: building?.name || building?.address_line1 || 'Your Building',
              unitNumber: space.unit_number || 'N/A',
              inviteToken: updated.invite_token,
            });
          }
        } catch (emailErr) {
          console.error('[update-occupant] Email error (non-blocking):', emailErr);
        }
      })();
    }

    return ok({ occupant: updated });
  } catch (e) {
    console.error('[update-occupant] Unexpected error:', e);
    return serverError('Unexpected error');
  }
});
