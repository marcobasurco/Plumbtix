// =============================================================================
// Work Orders — Edge Function Shared: Resend Email Client
// =============================================================================
// Wraps the Resend REST API (https://api.resend.com/emails).
//
// Config:
//   RESEND_API_KEY      — Supabase secret (set via `supabase secrets set`)
//   RESEND_FROM         — Sender address
//   RESEND_SANDBOX      — "true" to redirect all emails to test address
//   RESEND_SANDBOX_TO   — Override recipient in sandbox (default: marco+test@proroto.com)
//
// Features:
//   - Sandbox/testing mode: redirects all emails to a single test address
//   - Quota checking before batch sends
//   - Chunked batch sends: max 50 per chunk with 1-second delays
//   - Audit logging helper for invite/resend actions
// =============================================================================

const RESEND_API_URL = 'https://api.resend.com/emails';
const RESEND_BATCH_URL = 'https://api.resend.com/emails/batch';
const CHUNK_SIZE = 50;
const CHUNK_DELAY_MS = 1000;

export interface EmailPayload {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  bcc?: string | string[];
  cc?: string | string[];
  idempotencyKey?: string;
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

function isSandboxMode(): boolean {
  const sandbox = Deno.env.get('RESEND_SANDBOX');
  return sandbox === 'true' || sandbox === '1';
}

function getSandboxAddress(): string {
  return Deno.env.get('RESEND_SANDBOX_TO') || 'marco+test@proroto.com';
}

function applySandbox(payload: EmailPayload): EmailPayload {
  if (!isSandboxMode()) return payload;

  const originalTo = Array.isArray(payload.to) ? payload.to.join(', ') : payload.to;
  const sandboxTo = getSandboxAddress();

  console.log('[email][SANDBOX] Redirecting email from [%s] to [%s]', originalTo, sandboxTo);

  return {
    ...payload,
    to: sandboxTo,
    subject: `[SANDBOX] ${payload.subject} (original: ${originalTo})`,
    bcc: undefined,
    cc: undefined,
  };
}

/**
 * Check Resend rate limits. Returns remaining daily sends.
 */
export async function checkResendQuota(): Promise<{
  remaining: number | null;
  limit: number | null;
  canSend: boolean;
}> {
  try {
    const apiKey = getApiKey();
    const res = await fetch('https://api.resend.com/domains', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    const remaining = res.headers.get('x-ratelimit-remaining');
    const limit = res.headers.get('x-ratelimit-limit');

    return {
      remaining: remaining ? parseInt(remaining, 10) : null,
      limit: limit ? parseInt(limit, 10) : null,
      canSend: remaining === null || parseInt(remaining, 10) > 0,
    };
  } catch (e) {
    console.error('[email] Quota check failed:', e);
    return { remaining: null, limit: null, canSend: true };
  }
}

/**
 * Validate that a batch won't exceed quota.
 */
export async function validateBatchQuota(
  batchSize: number,
): Promise<{ safe: boolean; error?: string }> {
  const quota = await checkResendQuota();

  if (quota.remaining !== null && batchSize > quota.remaining) {
    const msg = `Batch of ${batchSize} emails would exceed Resend rate limit. Remaining: ${quota.remaining}/${quota.limit}`;
    console.error('[email] Quota exceeded:', msg);
    return { safe: false, error: msg };
  }

  return { safe: true };
}

/**
 * Send a single email via Resend.
 */
export async function sendEmail(payload: EmailPayload): Promise<EmailResult> {
  const finalPayload = applySandbox(payload);

  try {
    const apiKey = getApiKey();

    const body: Record<string, unknown> = {
      from: finalPayload.from || getFromAddress(),
      to: Array.isArray(finalPayload.to) ? finalPayload.to : [finalPayload.to],
      subject: finalPayload.subject,
      html: finalPayload.html,
    };

    if (finalPayload.text) body.text = finalPayload.text;
    if (finalPayload.replyTo) body.reply_to = finalPayload.replyTo;
    if (finalPayload.bcc) body.bcc = Array.isArray(finalPayload.bcc) ? finalPayload.bcc : [finalPayload.bcc];
    if (finalPayload.cc) body.cc = Array.isArray(finalPayload.cc) ? finalPayload.cc : [finalPayload.cc];
    if (finalPayload.tags) body.tags = finalPayload.tags;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    };
    if (finalPayload.idempotencyKey) {
      headers['Idempotency-Key'] = finalPayload.idempotencyKey;
    }

    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = await res.json();
      console.log('[email] Sent:', data.id, 'to:', finalPayload.to, 'subject:', finalPayload.subject);
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
 * Send multiple emails in chunks of 50 with 1-second delays.
 * Validates quota before sending.
 */
export async function sendEmailBatch(
  payloads: EmailPayload[],
): Promise<EmailResult[]> {
  if (payloads.length === 0) return [];

  const quotaCheck = await validateBatchQuota(payloads.length);
  if (!quotaCheck.safe) {
    console.error('[email] Batch aborted:', quotaCheck.error);
    return payloads.map(() => ({ ok: false, error: quotaCheck.error }));
  }

  const finalPayloads = payloads.map(applySandbox);
  const results: EmailResult[] = [];

  for (let i = 0; i < finalPayloads.length; i += CHUNK_SIZE) {
    const chunk = finalPayloads.slice(i, i + CHUNK_SIZE);

    if (i > 0) {
      console.log('[email] Waiting %dms before next chunk...', CHUNK_DELAY_MS);
      await new Promise((resolve) => setTimeout(resolve, CHUNK_DELAY_MS));
    }

    console.log('[email] Sending chunk %d-%d of %d', i + 1, i + chunk.length, finalPayloads.length);

    try {
      const apiKey = getApiKey();
      const fromAddr = getFromAddress();

      const emails = chunk.map((p) => ({
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
        console.log('[email] Chunk sent:', data.data?.length ?? 0, 'emails');
        results.push(...(data.data ?? []).map((d: { id: string }) => ({ ok: true, id: d.id })));
      } else {
        const errBody = await res.text();
        console.error('[email] Batch chunk error:', res.status, errBody);
        results.push(...chunk.map(() => ({ ok: false, error: `Resend batch ${res.status}` })));
      }
    } catch (e) {
      console.error('[email] Batch chunk failed:', e);
      results.push(...chunk.map(() => ({ ok: false, error: 'Batch send failed' })));
    }
  }

  return results;
}

/**
 * Fire-and-forget: sends email without awaiting result.
 */
export function sendEmailAsync(payload: EmailPayload): void {
  sendEmail(payload).catch((e) => {
    console.error('[email] Async send error:', e);
  });
}

/**
 * Log an invite/email action to the audit_log table.
 */
export async function logAuditAction(
  svc: { from: (table: string) => { insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }> } },
  userId: string | null,
  action: string,
  details: Record<string, unknown>,
  count: number,
): Promise<void> {
  try {
    const { error } = await svc
      .from('audit_log')
      .insert({
        user_id: userId,
        action,
        details,
        count,
      });

    if (error) {
      console.error('[audit] Failed to log action:', error.message);
    } else {
      console.log('[audit] Logged: action=%s count=%d user=%s', action, count, userId);
    }
  } catch (e) {
    console.error('[audit] Unexpected error:', e);
  }
}
