// =============================================================================
// Work Orders — Edge Function: get-public-ticket
// =============================================================================
// Route:  GET /functions/v1/get-public-ticket?id=UUID
// Auth:   NONE — this is a public endpoint for QR code / shareable links.
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCors();
  if (req.method !== 'GET') return err('METHOD_NOT_ALLOWED', 'GET required', 405);

  // ─── 1. Validate id param ───
  const url = new URL(req.url);
  const ticketId = url.searchParams.get('id');
  if (!ticketId || !UUID_REGEX.test(ticketId)) {
    return err('VALIDATION_ERROR', 'id query parameter is required (UUID)');
  }

  try {
    const svc = createServiceClient();

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
      .eq('id', ticketId)
      .maybeSingle();

    if (ticketErr) {
      console.error('[get-public-ticket] Query error:', ticketErr.message);
      return serverError('Failed to load ticket');
    }
    if (!ticket) {
      return notFound('Ticket not found');
    }

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

    const photos: { name: string; url: string }[] = [];
    if (attachments) {
      for (const att of attachments) {
        if (att.file_type?.startsWith('image/')) {
          const { data: signed } = await svc.storage
            .from('ticket-attachments')
            .createSignedUrl(att.file_path, 3600); // 1 hour
          if (signed?.signedUrl) {
            photos.push({ name: att.file_name, url: signed.signedUrl });
          }
        }
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
