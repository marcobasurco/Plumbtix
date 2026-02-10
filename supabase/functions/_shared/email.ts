// =============================================================================
// Work Orders — Edge Function Shared: Resend Email Client
// =============================================================================
// Wraps the Resend REST API (https://api.resend.com/emails).
//
// Config:
//   RESEND_API_KEY  — Supabase secret (set via `supabase secrets set`)
//   RESEND_FROM     — Sender address, e.g. "Work Orders <notifications@proroto.com>"
//
// Usage:
//   import { sendEmail, sendEmailBatch } from '../_shared/email.ts';
//   await sendEmail({ to: 'user@example.com', subject: '...', html: '...' });
//
// All sends are fire-and-forget by default — failures are logged but don't
// block the edge function response. Use `await` if you need confirmation.
// =============================================================================

const RESEND_API_URL = 'https://api.resend.com/emails';
const RESEND_BATCH_URL = 'https://api.resend.com/emails/batch';

export interface EmailPayload {
  to: string | string[];
  subject: string;
  html: string;
  /** Plain text fallback (auto-generated from HTML if omitted) */
  text?: string;
  /** Override the default from address */
  from?: string;
  /** Reply-to address */
  replyTo?: string;
  /** BCC addresses */
  bcc?: string | string[];
  /** CC addresses */
  cc?: string | string[];
  /** Idempotency key to prevent duplicate sends */
  idempotencyKey?: string;
  /** Tags for Resend analytics */
  tags?: Array<{ name: string; value: string }>;
}

export interface EmailResult {
  ok: boolean;
  id?: string;
  error?: string;
}

function getApiKey(): string {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) throw new Error('Missing RESEND_API_KEY secret');
  return key;
}

function getFromAddress(): string {
  return Deno.env.get('RESEND_FROM') || 'Work Orders <notifications@proroto.com>';
}

/**
 * Send a single email via Resend.
 * Returns { ok, id } on success or { ok: false, error } on failure.
 */
export async function sendEmail(payload: EmailPayload): Promise<EmailResult> {
  try {
    const apiKey = getApiKey();

    const body: Record<string, unknown> = {
      from: payload.from || getFromAddress(),
      to: Array.isArray(payload.to) ? payload.to : [payload.to],
      subject: payload.subject,
      html: payload.html,
    };

    if (payload.text) body.text = payload.text;
    if (payload.replyTo) body.reply_to = payload.replyTo;
    if (payload.bcc) body.bcc = Array.isArray(payload.bcc) ? payload.bcc : [payload.bcc];
    if (payload.cc) body.cc = Array.isArray(payload.cc) ? payload.cc : [payload.cc];
    if (payload.tags) body.tags = payload.tags;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    };
    if (payload.idempotencyKey) {
      headers['Idempotency-Key'] = payload.idempotencyKey;
    }

    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = await res.json();
      console.log('[email] Sent:', data.id, 'to:', payload.to, 'subject:', payload.subject);
      return { ok: true, id: data.id };
    }

    const errBody = await res.text();
    console.error('[email] Resend error:', res.status, errBody);
    return { ok: false, error: `Resend ${res.status}: ${errBody}` };
  } catch (e) {
    console.error('[email] Send failed:', e);
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

/**
 * Send multiple emails in a single API call (max 100 per batch).
 * Each item in the array is a full EmailPayload.
 */
export async function sendEmailBatch(
  payloads: EmailPayload[],
): Promise<EmailResult[]> {
  if (payloads.length === 0) return [];
  if (payloads.length > 100) {
    console.warn('[email] Batch exceeds 100 — splitting');
    const results: EmailResult[] = [];
    for (let i = 0; i < payloads.length; i += 100) {
      const chunk = payloads.slice(i, i + 100);
      const chunkResults = await sendEmailBatch(chunk);
      results.push(...chunkResults);
    }
    return results;
  }

  try {
    const apiKey = getApiKey();
    const fromAddr = getFromAddress();

    const emails = payloads.map((p) => ({
      from: p.from || fromAddr,
      to: Array.isArray(p.to) ? p.to : [p.to],
      subject: p.subject,
      html: p.html,
      ...(p.text ? { text: p.text } : {}),
      ...(p.replyTo ? { reply_to: p.replyTo } : {}),
      ...(p.tags ? { tags: p.tags } : {}),
    }));

    const res = await fetch(RESEND_BATCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(emails),
    });

    if (res.ok) {
      const data = await res.json();
      console.log('[email] Batch sent:', data.data?.length ?? 0, 'emails');
      return (data.data ?? []).map((d: { id: string }) => ({ ok: true, id: d.id }));
    }

    const errBody = await res.text();
    console.error('[email] Batch error:', res.status, errBody);
    return payloads.map(() => ({ ok: false, error: `Resend batch ${res.status}` }));
  } catch (e) {
    console.error('[email] Batch failed:', e);
    return payloads.map(() => ({ ok: false, error: 'Batch send failed' }));
  }
}

/**
 * Fire-and-forget: sends email without awaiting result.
 * Logs errors but doesn't block the caller.
 */
export function sendEmailAsync(payload: EmailPayload): void {
  sendEmail(payload).catch((e) => {
    console.error('[email] Async send error:', e);
  });
}
