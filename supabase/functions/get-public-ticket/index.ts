// =============================================================================
// Work Orders — Edge Function: get-public-ticket
// =============================================================================
// Route:  GET /functions/v1/get-public-ticket?token=UUID
// Auth:   NONE — this is a public endpoint for QR code / shareable links.
//
// Security model (migration 00021):
//   • Lookup is by tickets.public_token — a random UUID unrelated to the
//     ticket's primary key. Knowing a ticket id grants NOTHING here.
//   • The ticket must have public_enabled = TRUE. Disabling sharing from
//     the ticket detail page revokes every previously shared link/QR
//     instantly (this endpoint returns 404).
//
// Returns a limited, resident-safe subset of ticket data:
//   ✓ Ticket number, status, severity, issue type, description
//   ✓ Building name + address, space
//   ✓ Reporter name (no email/phone)
//   ✓ External comments only (no internal notes)
//   ✓ Status timeline (no internal notes)
//   ✓ Photo attachment signed URLs
//   ✗ No financials (quote, invoice)
//   ✗ No gate codes, onsite contact
//   ✗ No internal comments
// =============================================================================

import { handleCors } from '../_shared/cors.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { ok, err, notFound, serverError } from '../_shared/response.ts';
import { UUID_REGEX } from '../_shared/validation.ts';

// Rate limit: 30 requests per minute per client IP, enforced via the
// check_rate_limit() DB function (migration 00025). Database-backed because
// Supabase Edge uses a fresh isolate per request — in-memory counters reset
// every call and cannot limit. Fail-open: if the limiter check itself errors,
// the request proceeds (availability > strictness for a read-only endpoint).
const RATE_LIMIT = 30;
const RATE_WINDOW_SECS = 60;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCors();
  if (req.method !== 'GET') return err('METHOD_NOT_ALLOWED', 'GET required', 405);

  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

  // ─── 1. Validate token param ───
  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  if (!token || !UUID_REGEX.test(token)) {
    return err('VALIDATION_ERROR', 'token query parameter is required (UUID)');
  }

  try {
    const svc = createServiceClient();

    // ─── Rate limit (DB-backed, shared across isolates) ───
    try {
      const { data: allowed, error: rlErr } = await svc.rpc('check_rate_limit', {
        p_bucket: `get-public-ticket:${clientIp}`,
        p_limit: RATE_LIMIT,
        p_window_secs: RATE_WINDOW_SECS,
      });
      if (rlErr) {
        // Fail open — never let limiter infrastructure take the endpoint down
        console.error('[get-public-ticket] rate-limit check failed (allowing):', rlErr.message);
      } else if (allowed === false) {
        return err('RATE_LIMITED', 'Too many requests — try again shortly', 429);
      }
    } catch (e) {
      console.error('[get-public-ticket] rate-limit exception (allowing):', e);
    }

    // ─── 2. Fetch ticket with building + space + reporter ───
    const { data: ticket, error: ticketErr } = await svc
      .from('tickets')
      .select(`
        id,
        ticket_number,
        status,
        severity,
        issue_type,
        description,
        assigned_technician,
        scheduled_date,
        scheduled_time_window,
        completed_at,
        created_at,
        updated_at,
        building:buildings!inner(
          id, name, address_line1, address_line2, city, state, zip,
          company:companies(id, name, logo_url)
        ),
        space:spaces!inner(id, space_type, unit_number, common_area_type, floor),
        created_by:users!tickets_created_by_user_id_fkey(id, full_name)
      `)
      .eq('public_token', token)
      .eq('public_enabled', true)
      .maybeSingle();

    if (ticketErr) {
      console.error('[get-public-ticket] Query error:', ticketErr.message);
      return serverError('Failed to load ticket');
    }
    if (!ticket) {
      // Same 404 whether the token never existed or sharing was revoked —
      // don't leak which case it is.
      return notFound('Work order not found or no longer shared');
    }

    const ticketId = ticket.id as string;

    // ─── 3. Fetch external comments only (no internal) ───
    const { data: rawComments } = await svc
      .from('ticket_comments')
      .select('id, user_id, comment_text, created_at')
      .eq('ticket_id', ticketId)
      .eq('is_internal', false)
      .order('created_at', { ascending: true });

    let comments: { id: string; comment_text: string; created_at: string; author_name: string }[] = [];
    if (rawComments && rawComments.length > 0) {
      const authorIds = [...new Set(rawComments.map(c => c.user_id))];
      const { data: authors } = await svc
        .from('users')
        .select('id, full_name')
        .in('id', authorIds);
      const authorMap = new Map((authors ?? []).map(a => [a.id, a.full_name]));

      comments = rawComments.map(c => ({
        id: c.id,
        comment_text: c.comment_text,
        created_at: c.created_at,
        author_name: authorMap.get(c.user_id) ?? 'Unknown',
      }));
    }

    // ─── 4. Fetch status log ───
    const { data: statusLog } = await svc
      .from('ticket_status_log')
      .select('id, old_status, new_status, created_at, changed_by:users(full_name)')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });

    // ─── 5. Fetch photo attachments + signed URLs ───
    const { data: attachments } = await svc
      .from('ticket_attachments')
      .select('id, file_path, file_name, file_type')
      .eq('ticket_id', ticketId);

    // Batch-sign all image paths in ONE storage round-trip (previously a
    // sequential createSignedUrl per photo — 5 photos = 5 waits before the
    // public page could render).
    const photos: { name: string; url: string }[] = [];
    const images = (attachments ?? []).filter((a) => a.file_type?.startsWith('image/'));
    if (images.length > 0) {
      const { data: signed, error: signErr } = await svc.storage
        .from('ticket-attachments')
        .createSignedUrls(images.map((a) => a.file_path), 3600); // 1 hour
      if (signErr) {
        console.error('[get-public-ticket] Batch signing failed:', signErr.message);
      }
      for (let i = 0; i < images.length; i++) {
        const url = signed?.[i]?.signedUrl;
        if (url) photos.push({ name: images[i].file_name, url });
      }
    }

    // ─── 6. Return limited payload ───
    console.log('[get-public-ticket] ticket=%s (#%d) served publicly', ticketId, ticket.ticket_number);

    return ok({
      ticket,
      comments,
      statusLog: (statusLog ?? []).map(s => ({
        id: s.id,
        old_status: s.old_status,
        new_status: s.new_status,
        created_at: s.created_at,
        changed_by_name: (s.changed_by as { full_name: string } | null)?.full_name ?? null,
      })),
      photos,
    });

  } catch (e) {
    console.error('[get-public-ticket] Unexpected error:', e);
    return serverError('Unexpected error loading ticket');
  }
});
