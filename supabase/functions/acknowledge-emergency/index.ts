// =============================================================================
// PlumbTix — Edge Function: acknowledge-emergency
// =============================================================================
// Route:  POST /functions/v1/acknowledge-emergency
// Auth:   proroto_admin only
//
// "I'm on it." Marks an emergency work order acknowledged, which stops the
// on-call paging (trigger clears next_escalation_at), and tells the reporter
// who is on it (in-app + SMS).
//
// Flow:
//   1. Authenticate; caller must be proroto_admin
//   2. Load the ticket; must be an emergency, open, not already acknowledged
//      (acknowledging twice is a no-op, not an error)
//   3. Update acknowledged_at / acknowledged_by_user_id through the USER
//      client so RLS and the column-protection trigger apply
//   4. Notify the reporter in the background
// =============================================================================

import { handleCors } from '../_shared/cors.ts';
import { createServiceClient, createUserClient, getAuthenticatedUserId } from '../_shared/supabase.ts';
import { getCallerRole, isProRotoAdmin } from '../_shared/auth.ts';
import { ok, err, forbidden, notFound, serverError } from '../_shared/response.ts';
import { z, parseBody, UUID_REGEX } from '../_shared/validation.ts';
import { runInBackground } from '../_shared/background.ts';

const Schema = z.object({
  ticket_id: z.string().regex(UUID_REGEX, 'Invalid ticket_id'),
});

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCors();
  if (req.method !== 'POST') return err('METHOD_NOT_ALLOWED', 'POST required', 405);

  const parsed = await parseBody(req, Schema);
  if (!parsed.success) return err('VALIDATION_ERROR', parsed.message);
  const { ticket_id } = parsed.data;

  try {
    const userClient = createUserClient(req);
    const userId = await getAuthenticatedUserId(userClient);
    if (!userId) return err('UNAUTHORIZED', 'Not authenticated', 401);

    const role = await getCallerRole(userClient);
    if (!role || !isProRotoAdmin(role)) return forbidden('Only Pro Roto can acknowledge an emergency');

    const { data: ticket, error: loadErr } = await userClient
      .from('tickets')
      .select('id, ticket_number, severity, status, acknowledged_at, acknowledged_by_user_id, created_by_user_id, building_id, space_id, location_note')
      .eq('id', ticket_id)
      .single();
    if (loadErr || !ticket) return notFound('Work order not found');

    if (ticket.severity !== 'emergency') return err('NOT_EMERGENCY', 'Only emergencies are acknowledged', 400);
    if (['completed', 'invoiced', 'cancelled'].includes(ticket.status)) return err('CLOSED', 'This work order is closed', 400);

    if (ticket.acknowledged_at) {
      // Someone already has it — tell the caller who, don't overwrite.
      const svc = createServiceClient();
      const { data: who } = await svc.from('users').select('full_name').eq('id', ticket.acknowledged_by_user_id).maybeSingle();
      return ok({ ticket_id, already: true, acknowledged_at: ticket.acknowledged_at, acknowledged_by: who?.full_name ?? null });
    }

    const nowIso = new Date().toISOString();
    const { data: updated, error: updErr } = await userClient
      .from('tickets')
      .update({ acknowledged_at: nowIso, acknowledged_by_user_id: userId })
      .eq('id', ticket_id)
      .is('acknowledged_at', null)
      .select('id, acknowledged_at, acknowledged_by_user_id')
      .maybeSingle();
    if (updErr) {
      console.error('[acknowledge-emergency] update failed:', updErr.message);
      return serverError('Could not acknowledge');
    }
    if (!updated) {
      // Lost a race with another admin — report who won.
      const svc = createServiceClient();
      const { data: t2 } = await svc.from('tickets').select('acknowledged_at, acknowledged_by_user_id').eq('id', ticket_id).single();
      const { data: who } = await svc.from('users').select('full_name').eq('id', t2?.acknowledged_by_user_id).maybeSingle();
      return ok({ ticket_id, already: true, acknowledged_at: t2?.acknowledged_at ?? null, acknowledged_by: who?.full_name ?? null });
    }

    // Tell the reporter — kept alive after the response
    runInBackground((async () => {
      try {
        const svc = createServiceClient();
        const [me, b, s] = await Promise.all([
          svc.from('users').select('full_name').eq('id', userId).single(),
          svc.from('buildings').select('name, address_line1').eq('id', ticket.building_id).single(),
          svc.from('spaces').select('space_type, unit_number, common_area_type, label').eq('id', ticket.space_id).single(),
        ]);
        if (b.data && s.data) {
          const { notifyAcknowledged } = await import('../_shared/notifications.ts');
          await notifyAcknowledged(svc, {
            id: ticket.id,
            ticket_number: ticket.ticket_number,
            created_by_user_id: ticket.created_by_user_id,
            building: b.data,
            space: s.data,
            location_note: ticket.location_note,
          }, me.data?.full_name ?? 'Pro Roto');
        }
      } catch (e) {
        console.error('[acknowledge-emergency] notify error (non-blocking):', e);
      }
    })());

    return ok({ ticket_id, already: false, acknowledged_at: updated.acknowledged_at, acknowledged_by_user_id: userId });
  } catch (e) {
    console.error('[acknowledge-emergency] Unexpected:', e);
    return serverError('Could not acknowledge');
  }
});
