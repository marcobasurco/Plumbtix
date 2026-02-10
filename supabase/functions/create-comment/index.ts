// =============================================================================
// PlumbTix — Edge Function: create-comment
// =============================================================================
// Route:  POST /functions/v1/create-comment
// Auth:   JWT required
//
// Migration 00006 revokes ALL privileges on ticket_comments from
// anon/authenticated. This function uses service role for the INSERT.
//
// Auth strategy:
//   1. User JWT  → auth.getUser() to identify caller
//   2. User JWT  → RPC get_user_role() for role (SECURITY DEFINER)
//   3. User JWT  → SELECT on tickets to verify access (RLS gate)
//   4. Service role → INSERT into ticket_comments (bypasses REVOKE)
//
// is_internal enforcement:
//   - proroto_admin: may set is_internal=true
//   - pm_admin/pm_user/resident: is_internal=true → 403 REJECTED
//   - is_internal omitted → defaults to false
//   - Residents/PMs can ONLY create public comments
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
import { notifyComment } from '../_shared/notifications.ts';

const CreateCommentSchema = z.object({
  ticket_id: z.string().regex(UUID_REGEX, 'Invalid ticket_id'),
  comment_text: z.string().min(1, 'Comment text is required').max(10000),
  is_internal: z.boolean().optional().default(false),
});

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCors();
  if (req.method !== 'POST') return err('METHOD_NOT_ALLOWED', 'POST required', 405);

  // ─── 1. Authenticate ───
  let userClient;
  let userId: string;
  try {
    userClient = createUserClient(req);
    userId = await getAuthenticatedUserId(userClient);
  } catch {
    return unauthorized();
  }

  // ─── 2. Validate body ───
  const parsed = await parseBody(req, CreateCommentSchema);
  if (!parsed.success) {
    return err('VALIDATION_ERROR', parsed.message);
  }

  const { ticket_id, comment_text, is_internal } = parsed.data;

  // ─── 3. Read caller role via RPC (SECURITY DEFINER, no service role) ───
  const role = await getCallerRole(userClient);
  if (!role) {
    return unauthorized('User profile not found');
  }

  // ─── 4. REJECT is_internal=true for non-proroto_admin ───
  if (is_internal === true && !isProRotoAdmin(role)) {
    return forbidden(
      'Only Pro Roto admins can create internal comments. ' +
      'Remove the is_internal flag or set it to false.',
    );
  }

  try {
    // ─── 5. Verify caller can access this ticket (user JWT + RLS) ───
    const { data: ticket, error: ticketErr } = await userClient
      .from('tickets')
      .select('id')
      .eq('id', ticket_id)
      .maybeSingle();

    if (ticketErr || !ticket) {
      return notFound('Ticket not found or access denied');
    }

    // ─── 6. INSERT via SERVICE ROLE (bypasses REVOKE from 00006) ───
    const svc = createServiceClient();
    const { data: comment, error: insertErr } = await svc
      .from('ticket_comments')
      .insert({
        ticket_id,
        user_id: userId,   // Always from JWT — never from request body
        comment_text,
        is_internal,
      })
      .select()
      .single();

    if (insertErr) {
      if (insertErr.message?.includes('foreign key')) {
        return err('INVALID_REFERENCE', 'Ticket not found', 400);
      }
      console.error('[create-comment] Insert failed:', insertErr.message);
      return serverError('Failed to create comment');
    }

    console.log(
      '[create-comment] Created: comment=%s, ticket=%s, user=%s, role=%s, internal=%s',
      comment.id, ticket_id, userId, role, is_internal,
    );

    // ─── 7. Send comment notification (fire-and-forget) ───
    try {
      const [ticketRes, authorRes] = await Promise.all([
        svc.from('tickets').select('ticket_number, building_id, buildings(name, address_line1, company_id)').eq('id', ticket_id).single(),
        svc.from('users').select('full_name, email').eq('id', userId).single(),
      ]);

      if (ticketRes.data && authorRes.data) {
        const building = (ticketRes.data as any).buildings;
        notifyComment(svc, {
          ticketId: ticket_id,
          ticketNumber: ticketRes.data.ticket_number,
          buildingName: building?.name || building?.address_line1 || 'Unknown',
          companyId: building?.company_id || '',
          authorName: authorRes.data.full_name,
          authorRole: role,
          authorEmail: authorRes.data.email,
          commentText: comment_text,
          isInternal: is_internal,
        });
      }
    } catch (emailErr) {
      console.error('[create-comment] Email notification error (non-blocking):', emailErr);
    }

    return ok({ comment }, 201);
  } catch (e) {
    console.error('[create-comment] Unexpected error:', e);
    return serverError('Unexpected error creating comment');
  }
});
