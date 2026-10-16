// =============================================================================
// PlumbTix — Edge Function: escalate-emergencies
// =============================================================================
// Route:  POST /functions/v1/escalate-emergencies
// Auth:   Bearer ESCALATION_CRON_SECRET (called by pg_cron every minute via
//         pg_net — see migration 00030). Not a user endpoint.
//
// For every emergency work order that is unacknowledged and whose
// next_escalation_at has passed:
//   1. pick the next person on the on-call roster (wrapping around; two full
//      rounds max),
//   2. text AND call them,
//   3. log each page, bump escalation_step, set next_escalation_at,
//   4. after two rounds with no acknowledgement: mark exhausted and email
//      everyone at Pro Roto.
//
// Idempotent per minute: a ticket is only touched when next_escalation_at is
// due, and that is pushed forward before the next sweep.
// =============================================================================

import { handleCors } from '../_shared/cors.ts';
import { createServiceClient, type SupabaseClient } from '../_shared/supabase.ts';
import { ok, err, unauthorized, serverError } from '../_shared/response.ts';
import { sendSMSAndLog, placeCall, normalizePhone } from '../_shared/sms.ts';
import { sendEmail } from '../_shared/email.ts';
import { escalationEmail } from '../_shared/email-templates.ts';
import { formatLocation } from '../_shared/notifications.ts';

const MAX_ROUNDS = 2;

interface DueTicket {
  id: string;
  ticket_number: number;
  description: string | null;
  location_note: string | null;
  created_at: string;
  escalation_step: number;
  building: { name: string | null; address_line1: string } | null;
  space: { space_type: string; unit_number: string | null; common_area_type: string | null; label: string | null } | null;
  created_by: { full_name: string } | null;
}

interface RosterEntry {
  user_id: string;
  wait_minutes: number;
  user: { full_name: string; phone: string | null; email: string } | null;
}

function appUrl(): string {
  return Deno.env.get('APP_URL') || 'https://workorders.proroto.com';
}

function proRotoEmails(): string[] {
  const override = Deno.env.get('PROROTO_EMERGENCY_EMAILS') || Deno.env.get('PROROTO_NOTIFY_EMAILS');
  if (override) return override.split(',').map((e) => e.trim()).filter(Boolean);
  return ['dispatch@proroto.com'];
}

async function logPage(svc: SupabaseClient, row: { ticket_id: string; step: number; user_id: string | null; channel: 'sms' | 'call' | 'email'; ok: boolean; detail?: string }) {
  const { error } = await svc.from('ticket_escalation_log').insert(row);
  if (error) console.error('[escalate] log insert failed:', error.message);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCors();
  if (req.method !== 'POST') return err('METHOD_NOT_ALLOWED', 'POST required', 405);

  // ─── Auth: shared secret from the cron job ───
  const secret = Deno.env.get('ESCALATION_CRON_SECRET');
  const auth = req.headers.get('Authorization') ?? '';
  if (!secret || auth !== `Bearer ${secret}`) return unauthorized('Invalid escalation secret');

  try {
    const svc = createServiceClient();
    const nowIso = new Date().toISOString();

    const { data: due, error: dueErr } = await svc
      .from('tickets')
      .select(`
        id, ticket_number, description, location_note, created_at, escalation_step,
        building:buildings(name, address_line1),
        space:spaces(space_type, unit_number, common_area_type, label),
        created_by:users!tickets_created_by_user_id_fkey(full_name)
      `)
      .eq('severity', 'emergency')
      .is('acknowledged_at', null)
      .is('escalation_exhausted_at', null)
      .not('next_escalation_at', 'is', null)
      .lte('next_escalation_at', nowIso)
      .not('status', 'in', '("completed","invoiced","cancelled")')
      .limit(50);

    if (dueErr) {
      console.error('[escalate] query failed:', dueErr.message);
      return serverError('Query failed');
    }
    if (!due || due.length === 0) return ok({ processed: 0 });

    const { data: rosterRows, error: rosterErr } = await svc
      .from('on_call_roster')
      .select('user_id, wait_minutes, user:users(full_name, phone, email)')
      .eq('active', true)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true });
    if (rosterErr) console.error('[escalate] roster query failed:', rosterErr.message);
    const roster = (rosterRows ?? []) as unknown as RosterEntry[];

    let processed = 0;
    for (const t of due as unknown as DueTicket[]) {
      const step = (t.escalation_step ?? 0) + 1;
      const buildingName = t.building?.name || t.building?.address_line1 || 'Unknown building';
      const location = formatLocation({ location_note: t.location_note, space: t.space ?? { space_type: 'common_area', unit_number: null, common_area_type: null, label: null } });
      const desc = (t.description ?? '').replace(/\s+/g, ' ').slice(0, 120);
      const minutesOpen = Math.max(1, Math.round((Date.now() - new Date(t.created_at).getTime()) / 60000));
      const link = `${appUrl()}/t/${t.id}`;

      const exhausted = roster.length === 0 || step > roster.length * MAX_ROUNDS;

      if (exhausted) {
        const { subject, html } = escalationEmail({
          ticketNumber: t.ticket_number, ticketId: t.id, buildingName, location,
          description: t.description ?? '', createdByName: t.created_by?.full_name ?? 'Unknown',
          minutesOpen, step: step - 1, exhausted: true,
        });
        const recipients = Array.from(new Set([...proRotoEmails(), ...roster.map((r) => r.user?.email).filter((e): e is string => !!e)]));
        const res = await sendEmail({ to: recipients, subject, html, tags: [{ name: 'type', value: 'escalation_exhausted' }, { name: 'ticket_id', value: t.id }] });
        await logPage(svc, { ticket_id: t.id, step, user_id: null, channel: 'email', ok: res.ok, detail: res.ok ? `exhausted → ${recipients.length} recipients` : res.error });
        await svc.from('tickets').update({ escalation_exhausted_at: nowIso, next_escalation_at: null, escalation_step: step }).eq('id', t.id);
        console.warn('[escalate] EXHAUSTED ticket #%d after %d pages', t.ticket_number, step - 1);
        processed++;
        continue;
      }

      const target = roster[(step - 1) % roster.length];
      const name = target.user?.full_name ?? 'on-call';
      const phone = target.user?.phone ? normalizePhone(target.user.phone) : null;
      const round = Math.floor((step - 1) / roster.length) + 1;

      if (phone) {
        const sms = await sendSMSAndLog(svc, {
          to: phone,
          body: `[EMERGENCY — UNACKNOWLEDGED ${minutesOpen} min] WO #${t.ticket_number} at ${buildingName}, ${location}: ${desc}. Page ${step}${round > 1 ? ' (round 2)' : ''}. Acknowledge: ${link}`,
          userId: target.user_id,
          ticketId: t.id,
        });
        await logPage(svc, { ticket_id: t.id, step, user_id: target.user_id, channel: 'sms', ok: sms.ok, detail: sms.ok ? sms.sid : sms.error });

        const call = await placeCall(phone,
          `This is Pro Roto dispatch. Emergency work order ${t.ticket_number} at ${buildingName}, ${location}, has been open for ${minutesOpen} minutes with no acknowledgement. Open the app to acknowledge it.`);
        await logPage(svc, { ticket_id: t.id, step, user_id: target.user_id, channel: 'call', ok: call.ok, detail: call.ok ? call.sid : call.error });
      } else {
        await logPage(svc, { ticket_id: t.id, step, user_id: target.user_id, channel: 'sms', ok: false, detail: 'no phone on file' });
      }

      if (target.user?.email) {
        const { subject, html } = escalationEmail({
          ticketNumber: t.ticket_number, ticketId: t.id, buildingName, location,
          description: t.description ?? '', createdByName: t.created_by?.full_name ?? 'Unknown',
          minutesOpen, step, pagedName: name, exhausted: false,
        });
        const res = await sendEmail({ to: [target.user.email], subject, html, tags: [{ name: 'type', value: 'escalation_page' }, { name: 'ticket_id', value: t.id }] });
        await logPage(svc, { ticket_id: t.id, step, user_id: target.user_id, channel: 'email', ok: res.ok, detail: res.ok ? undefined : res.error });
      }

      // In-app notification for the paged person
      await svc.from('notifications').insert({
        user_id: target.user_id,
        type: 'emergency_page',
        title: `Emergency #${t.ticket_number} needs you`,
        body: `${buildingName}, ${location} — unacknowledged for ${minutesOpen} min. Tap to acknowledge.`,
        ticket_id: t.id,
      });

      const nextAt = new Date(Date.now() + target.wait_minutes * 60000).toISOString();
      const { error: updErr } = await svc.from('tickets')
        .update({ escalation_step: step, next_escalation_at: nextAt })
        .eq('id', t.id);
      if (updErr) console.error('[escalate] ticket update failed:', updErr.message);

      console.log('[escalate] ticket #%d page %d → %s (next in %d min)', t.ticket_number, step, name, target.wait_minutes);
      processed++;
    }

    return ok({ processed });
  } catch (e) {
    console.error('[escalate] Unexpected:', e);
    return serverError('Escalation sweep failed');
  }
});
