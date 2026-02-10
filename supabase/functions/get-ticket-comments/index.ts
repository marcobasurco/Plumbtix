// =============================================================================
// Work Orders — Edge Function: get-ticket-comments
// =============================================================================
// Route:  GET /functions/v1/get-ticket-comments?ticket_id=UUID
// Auth:   JWT required
//
// *** THIS IS THE ONLY AUTHORIZED WAY TO READ COMMENTS. ***
// Migration 00006 revokes ALL privileges on ticket_comments from
// anon/authenticated. PostgREST cannot touch this table.
//
// Auth strategy (3 clients/methods):
//   1. User JWT  → auth.getUser() to identify caller
//   2. User JWT  → RPC get_user_role() to read caller role (SECURITY DEFINER)
//   3. User JWT  → SELECT on tickets to verify ticket access (RLS gate)
//   4. Service role → SELECT on ticket_comments (bypasses REVOKE)
//   5. Service role → SELECT on users for author info
//
// Service role is used ONLY for ticket_comments + author lookup —
// both necessitated by migration 00006.
//
// Filtering:
//   - proroto_admin: sees ALL comments (including is_internal=true)
//   - pm_admin/pm_user/resident: sees only is_internal=false
//   - is_internal field is sanitized to false in response for non-admin
// =============================================================================

import { handleCors } from '../_shared/cors.ts';
import {
  createUserClient,
  createServiceClient,
  getAuthenticatedUserId,
} from '../_shared/supabase.ts';
import { ok, err, unauthorized, notFound, serverError } from '../_shared/response.ts';
import { getCallerRole } from '../_shared/auth.ts';
import { UUID_REGEX } from '../_shared/validation.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCors();
  if (req.method !== 'GET') return err('METHOD_NOT_ALLOWED', 'GET required', 405);

  // ─── 1. Authenticate ───
  let userClient;
  let userId: string;
  try {
    userClient = createUserClient(req);
    userId = await getAuthenticatedUserId(userClient);
  } catch {
    return unauthorized();
  }

  // ─── 2. Validate ticket_id param ───
  const url = new URL(req.url);
  const ticketId = url.searchParams.get('ticket_id');
  if (!ticketId || !UUID_REGEX.test(ticketId)) {
    return err('VALIDATION_ERROR', 'ticket_id query parameter is required (UUID)');
  }

  // ─── 3. Read caller role via RPC (SECURITY DEFINER, no service role) ───
  const role = await getCallerRole(userClient);
  if (!role) {
    return unauthorized('User profile not found');
  }

  try {
    // ─── 4. Verify caller can access this ticket (user JWT + RLS) ───
    // If RLS denies access, maybeSingle() returns null → 404.
    const { data: ticket, error: ticketErr } = await userClient
      .from('tickets')
      .select('id')
      .eq('id', ticketId)
      .maybeSingle();

    if (ticketErr || !ticket) {
      return notFound('Ticket not found or access denied');
    }

    // ─── 5. Read comments via SERVICE ROLE (bypasses REVOKE from 00006) ───
    const svc = createServiceClient();
    const { data: comments, error: fetchErr } = await svc
      .from('ticket_comments')
      .select('id, ticket_id, user_id, comment_text, is_internal, created_at, updated_at')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });

    if (fetchErr) {
      console.error('[get-ticket-comments] Fetch failed:', fetchErr.message);
      return serverError('Failed to load comments');
    }

    if (!comments || comments.length === 0) {
      return ok({ comments: [] });
    }

    // ─── 6. Load author info (service role — users table is fine) ───
    const authorIds = [...new Set(comments.map((c) => c.user_id))];
    const { data: authors } = await svc
      .from('users')
      .select('id, full_name, role')
      .in('id', authorIds);

    const authorMap = new Map(
      (authors ?? []).map((a) => [a.id, a]),
    );

    // ─── 7. CRITICAL: Filter is_internal for non-proroto roles ───
    const isAdmin = role === 'proroto_admin';

    const filtered = comments
      .filter((c) => {
        if (isAdmin) return true;
        return c.is_internal === false;
      })
      .map((c) => {
        const author = authorMap.get(c.user_id);
        return {
          id: c.id,
          ticket_id: c.ticket_id,
          user_id: c.user_id,
          comment_text: c.comment_text,
          is_internal: isAdmin ? c.is_internal : false,
          created_at: c.created_at,
          updated_at: c.updated_at,
          author: author
            ? { id: author.id, full_name: author.full_name, role: author.role }
            : { id: c.user_id, full_name: 'Unknown', role: 'resident' },
        };
      });

    console.log(
      '[get-ticket-comments] ticket=%s, user=%s, role=%s, total=%d, returned=%d (filtered=%d)',
      ticketId, userId, role,
      comments.length, filtered.length, comments.length - filtered.length,
    );

    return ok({ comments: filtered });
  } catch (e) {
    console.error('[get-ticket-comments] Unexpected error:', e);
    return serverError('Unexpected error loading comments');
  }
});
