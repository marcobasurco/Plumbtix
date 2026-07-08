// =============================================================================
// PlumbTix — Edge Function: toggle-public-sharing
// =============================================================================
// Route:  POST /functions/v1/toggle-public-sharing
// Auth:   JWT required — proroto_admin or pm_admin only
//
// Access model (migration 00022):
//   • READ via the caller's JWT — existing tickets RLS proves the caller can
//     access this ticket (pm_admin is company-scoped, proroto_admin sees all).
//   • WRITE via the service role — a BEFORE trigger on tickets blocks ALL
//     changes to public_token/public_enabled from end-user JWTs, so this
//     function is the only path that can modify sharing settings.
//
// Body:
//   { ticket_id: UUID, enabled: boolean, regenerate?: boolean }
//
// Behavior:
//   enabled=true  → generates public_token if NULL (or if regenerate=true,
//                   rotates it — invalidating all previously shared links),
//                   sets public_enabled=true
//   enabled=false → sets public_enabled=false. Token is KEPT so re-enabling
//                   restores previously printed QR codes. Use regenerate to
//                   burn old links.
// =============================================================================

import { handleCors } from '../_shared/cors.ts';
import { createUserClient, createServiceClient, getAuthenticatedUserId } from '../_shared/supabase.ts';
import { ok, err, unauthorized, forbidden, notFound, serverError } from '../_shared/response.ts';
import { z, parseBody, UUID_REGEX } from '../_shared/validation.ts';
import { getCallerRole } from '../_shared/auth.ts';

const ToggleSchema = z.object({
  ticket_id: z.string().regex(UUID_REGEX, 'Invalid ticket_id'),
  enabled: z.boolean(),
  regenerate: z.boolean().optional(),
});

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCors();
  if (req.method !== 'POST') {
    return err('METHOD_NOT_ALLOWED', 'POST required', 405);
  }

  // ─── 1. Authenticate ───
  let userClient;
  try {
    userClient = createUserClient(req);
    await getAuthenticatedUserId(userClient);
  } catch {
    return unauthorized();
  }

  // ─── 2. Role gate: proroto_admin or pm_admin ───
  const role = await getCallerRole(userClient);
  if (!role) return unauthorized('User profile not found');
  if (role !== 'proroto_admin' && role !== 'pm_admin') {
    return forbidden('Only admin roles can manage public sharing');
  }

  // ─── 3. Validate body ───
  const parsed = await parseBody(req, ToggleSchema);
  if (!parsed.success) {
    return err('VALIDATION_ERROR', parsed.message);
  }
  const { ticket_id, enabled, regenerate } = parsed.data;

  try {
    // ─── 4. Load ticket via caller JWT (RLS scopes access) ───
    // If the caller's RLS can't see this ticket, they can't toggle it.
    const { data: ticket, error: fetchErr } = await userClient
      .from('tickets')
      .select('id, public_token, public_enabled')
      .eq('id', ticket_id)
      .maybeSingle();

    if (fetchErr) {
      console.error('[toggle-public-sharing] Fetch error:', fetchErr.message);
      return serverError('Failed to load ticket');
    }
    if (!ticket) {
      return notFound('Ticket not found or access denied');
    }

    // ─── 5. Build update payload ───
    const updatePayload: Record<string, unknown> = { public_enabled: enabled };

    if (enabled && (!ticket.public_token || regenerate)) {
      updatePayload.public_token = crypto.randomUUID();
    } else if (!enabled && regenerate) {
      // Disable AND burn the old token in one call
      updatePayload.public_token = crypto.randomUUID();
    }

    // ─── 6. Write via SERVICE role ───
    // Migration 00022's trigger blocks these columns for authenticated JWTs;
    // access was already proven in step 4, role in step 2.
    const svc = createServiceClient();
    const { data: updated, error: updateErr } = await svc
      .from('tickets')
      .update(updatePayload)
      .eq('id', ticket_id)
      .select('id, public_token, public_enabled')
      .single();

    if (updateErr || !updated) {
      console.error('[toggle-public-sharing] Update error:', updateErr?.message);
      return serverError('Failed to update sharing settings');
    }

    console.log(
      '[toggle-public-sharing] ticket=%s enabled=%s regenerated=%s by role=%s',
      ticket_id, enabled, !!updatePayload.public_token, role,
    );

    return ok({
      ticket_id: updated.id,
      public_enabled: updated.public_enabled,
      // Only expose the token while sharing is enabled
      public_token: updated.public_enabled ? updated.public_token : null,
    });
  } catch (e) {
    console.error('[toggle-public-sharing] Unexpected error:', e);
    return serverError('Unexpected error updating sharing settings');
  }
});