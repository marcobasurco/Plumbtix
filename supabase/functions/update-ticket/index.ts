// =============================================================================
// Work Orders — Edge Function: update-ticket
// =============================================================================
// Route:  PATCH /functions/v1/update-ticket
// Auth:   JWT required
// Client: User JWT for all ticket operations. Service role ONLY for
//         optional decline_reason comment (ticket_comments REVOKE from 00006).
//
// Auth strategy:
//   1. User JWT → auth.getUser() to identify caller
//   2. User JWT → RPC get_user_role() for role (SECURITY DEFINER, no service role)
//   3. User JWT → SELECT ticket (RLS scopes access)
//   4. User JWT → UPDATE ticket (RLS scopes access, trigger 00005 = DB seatbelt)
//
// Restricted fields (proroto_admin ONLY):
//   - assigned_technician, scheduled_date, scheduled_time_window,
//     quote_amount, invoice_number
//
// Transition matrix enforcement:
//   - Edge Function validates FIRST (returns friendly error message)
//   - Trigger 00005 is the seatbelt (rejects at DB level if function has a bug)
//   - Matrix logic MUST match shared/types/transitions.ts and migration 00005
// =============================================================================

import { handleCors } from '../_shared/cors.ts';
import {
  createUserClient,
  createServiceClient,
  getAuthenticatedUserId,
} from '../_shared/supabase.ts';
import { ok, err, unauthorized, forbidden, notFound, serverError } from '../_shared/response.ts';
import { z, parseBody, UUID_REGEX } from '../_shared/validation.ts';
import { getCallerRole, isProRotoAdmin } from '../_shared/auth.ts';
import type { UserRole } from '../_shared/auth.ts';
import { notifyStatusChange } from '../_shared/notifications.ts';

// ─── Transition matrix (MUST match transitions.ts and migration 00005) ───

const TICKET_STATUSES = [
  'new', 'needs_info', 'scheduled', 'dispatched', 'on_site',
  'in_progress', 'waiting_approval', 'completed', 'invoiced', 'cancelled',
] as const;
type TicketStatus = typeof TICKET_STATUSES[number];

const TRANSITION_MATRIX: Record<string, Partial<Record<UserRole, readonly string[]>>> = {
  new:              { proroto_admin: ['needs_info', 'scheduled', 'cancelled'], pm_admin: ['cancelled'], pm_user: ['cancelled'] },
  needs_info:       { proroto_admin: ['new', 'scheduled', 'cancelled'], pm_admin: ['new', 'cancelled'], pm_user: ['new', 'cancelled'] },
  scheduled:        { proroto_admin: ['dispatched', 'needs_info', 'cancelled'] },
  dispatched:       { proroto_admin: ['on_site', 'scheduled', 'cancelled'] },
  on_site:          { proroto_admin: ['in_progress', 'cancelled'] },
  in_progress:      { proroto_admin: ['waiting_approval', 'completed', 'cancelled'] },
  waiting_approval: { proroto_admin: ['scheduled', 'in_progress', 'cancelled'], pm_admin: ['scheduled', 'cancelled'], pm_user: ['scheduled', 'cancelled'] },
  completed:        { proroto_admin: ['invoiced'] },
  invoiced:         {},
  cancelled:        {},
};

function isTransitionAllowed(current: string, target: string, role: UserRole): boolean {
  const allowed = TRANSITION_MATRIX[current]?.[role];
  return !!allowed && allowed.includes(target);
}

function getAllowedTransitions(current: string, role: UserRole): readonly string[] {
  return TRANSITION_MATRIX[current]?.[role] ?? [];
}

// ─── Validation schema ───

const UpdateTicketSchema = z.object({
  ticket_id: z.string().regex(UUID_REGEX, 'Invalid ticket_id'),
  status: z.enum(TICKET_STATUSES).optional(),
  assigned_technician: z.string().max(255).nullable().optional(),
  scheduled_date: z.string().optional(),
  scheduled_time_window: z.string().max(100).optional(),
  quote_amount: z.number().min(0).nullable().optional(),
  invoice_number: z.string().max(100).nullable().optional(),
  decline_reason: z.string().max(2000).optional(),
});

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCors();
  if (req.method !== 'PATCH' && req.method !== 'POST') {
    return err('METHOD_NOT_ALLOWED', 'PATCH or POST required', 405);
  }

  // ─── 1. Authenticate ───
  let userClient;
  let userId: string;
  try {
    userClient = createUserClient(req);
    userId = await getAuthenticatedUserId(userClient);
  } catch {
    return unauthorized();
  }

  // ─── 2. Read caller role via RPC (no service role) ───
  const role = await getCallerRole(userClient);
  if (!role) {
    return unauthorized('User profile not found');
  }

  // ─── 3. Validate body ───
  const parsed = await parseBody(req, UpdateTicketSchema);
  if (!parsed.success) {
    return err('VALIDATION_ERROR', parsed.message);
  }

  const {
    ticket_id,
    status: targetStatus,
    assigned_technician,
    scheduled_date,
    scheduled_time_window,
    quote_amount,
    invoice_number,
    decline_reason,
  } = parsed.data;

  try {
    // ─── 4. Load current ticket (RLS scopes access) ───
    const { data: ticket, error: fetchErr } = await userClient
      .from('tickets')
      .select('*')
      .eq('id', ticket_id)
      .single();

    if (fetchErr || !ticket) {
      return notFound('Ticket not found or access denied');
    }

    // ─── 5. Validate status transition ───
    if (targetStatus && targetStatus !== ticket.status) {
      if (!isTransitionAllowed(ticket.status, targetStatus, role)) {
        const allowed = getAllowedTransitions(ticket.status, role);
        return err(
          'INVALID_TRANSITION',
          `Cannot transition from "${ticket.status}" to "${targetStatus}" as ${role}. ` +
          (allowed.length > 0
            ? `Allowed: ${allowed.join(', ')}`
            : 'No transitions available for your role.'),
          403,
        );
      }
    }

    // ─── 6. Check restricted fields ───
    const restrictedAttempts: string[] = [];
    if (assigned_technician !== undefined) restrictedAttempts.push('assigned_technician');
    if (scheduled_date !== undefined) restrictedAttempts.push('scheduled_date');
    if (scheduled_time_window !== undefined) restrictedAttempts.push('scheduled_time_window');
    if (quote_amount !== undefined) restrictedAttempts.push('quote_amount');
    if (invoice_number !== undefined) restrictedAttempts.push('invoice_number');

    if (restrictedAttempts.length > 0 && !isProRotoAdmin(role)) {
      return forbidden(
        `Only Pro Roto admin can modify: ${restrictedAttempts.join(', ')}`,
      );
    }

    // ─── 7. Build update payload ───
    const updatePayload: Record<string, unknown> = {};

    if (targetStatus !== undefined) {
      updatePayload.status = targetStatus;
      if (targetStatus === 'completed') {
        updatePayload.completed_at = new Date().toISOString();
      }
    }

    if (assigned_technician !== undefined) updatePayload.assigned_technician = assigned_technician;
    if (scheduled_date !== undefined) updatePayload.scheduled_date = scheduled_date;
    if (scheduled_time_window !== undefined) updatePayload.scheduled_time_window = scheduled_time_window;
    if (quote_amount !== undefined) updatePayload.quote_amount = quote_amount;
    if (invoice_number !== undefined) updatePayload.invoice_number = invoice_number;

    if (Object.keys(updatePayload).length === 0) {
      return err('NO_CHANGES', 'No fields to update', 400);
    }

    // ─── 8. UPDATE (RLS enforces row access, trigger 00005 = seatbelt) ───
    const { data: updated, error: updateErr } = await userClient
      .from('tickets')
      .update(updatePayload)
      .eq('id', ticket_id)
      .select()
      .single();

    if (updateErr) {
      if (updateErr.message?.includes('Status transition from')) {
        return err('TRANSITION_BLOCKED', updateErr.message, 403);
      }
      if (updateErr.message?.includes('terminal status')) {
        return err('TERMINAL_STATUS', updateErr.message, 403);
      }
      if (updateErr.message?.includes('row-level security')) {
        return forbidden('You do not have permission to update this ticket');
      }
      console.error('[update-ticket] Update failed:', updateErr.message);
      return serverError('Failed to update ticket');
    }

    // ─── 9. If decline_reason + cancellation, create a comment ───
    if (decline_reason && targetStatus === 'cancelled') {
      // Use service role for ticket_comments INSERT (00006 revoked ALL for authenticated)
      const svc = createServiceClient();
      const { error: commentErr } = await svc
        .from('ticket_comments')
        .insert({
          ticket_id,
          user_id: userId,
          comment_text: `Decline reason: ${decline_reason}`,
          is_internal: false,
        });

      if (commentErr) {
        console.warn('[update-ticket] Decline reason comment failed:', commentErr.message);
      }
    }

    console.log(
      '[update-ticket] Updated: ticket=%s, user=%s, role=%s, status=%s→%s',
      ticket_id, userId, role,
      targetStatus ? ticket.status : '(unchanged)',
      targetStatus ?? '(unchanged)',
    );

    // ─── 10. Send status change notification (fire-and-forget) ───
    if (targetStatus && targetStatus !== ticket.status) {
      (async () => {
        try {
          const svc = createServiceClient();
          const [buildingRes, spaceRes, creatorRes] = await Promise.all([
            svc.from('buildings').select('name, address_line1, city, state, company_id').eq('id', ticket.building_id).single(),
            svc.from('spaces').select('space_type, unit_number, common_area_type').eq('id', ticket.space_id).single(),
            svc.from('users').select('full_name, email').eq('id', ticket.created_by_user_id).single(),
          ]);

          if (buildingRes.data && spaceRes.data && creatorRes.data) {
            await notifyStatusChange(svc, {
              ticket_number: updated.ticket_number ?? ticket.ticket_number,
              id: ticket_id,
              issue_type: ticket.issue_type,
              severity: ticket.severity,
              status: targetStatus,
              description: ticket.description,
              assigned_technician: updated.assigned_technician ?? ticket.assigned_technician,
              scheduled_date: updated.scheduled_date ?? ticket.scheduled_date,
              scheduled_time_window: updated.scheduled_time_window ?? ticket.scheduled_time_window,
              quote_amount: updated.quote_amount ?? ticket.quote_amount,
              invoice_number: updated.invoice_number ?? ticket.invoice_number,
              building: buildingRes.data,
              space: spaceRes.data,
              created_by: creatorRes.data,
            }, ticket.status, targetStatus, role);
          }
        } catch (emailErr) {
          console.error('[update-ticket] Email notification error (non-blocking):', emailErr);
        }
      })();
    }

    return ok({ ticket: updated });
  } catch (e) {
    console.error('[update-ticket] Unexpected error:', e);
    return serverError('Unexpected error during ticket update');
  }
});
