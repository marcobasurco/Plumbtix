// =============================================================================
// Work Orders — Edge Function Shared: Twilio SMS Client
// =============================================================================
// Sends SMS via Twilio REST API (no SDK needed — plain fetch).
//
// Config (Supabase dashboard → Edge Function Secrets):
//   TWILIO_ACCOUNT_SID   — Twilio Account SID
//   TWILIO_AUTH_TOKEN     — Twilio Auth Token
//   TWILIO_FROM_NUMBER    — Verified Twilio phone in E.164 (e.g. +16505551234)
//   TWILIO_SANDBOX        — "true" to log instead of sending (dev/staging)
//
// Features:
//   - E.164 validation
//   - Sandbox mode (logs but does not send)
//   - Audit logging to sms_log table
//   - Fire-and-forget safe (catches all errors)
// =============================================================================

import type { SupabaseClient } from './supabase.ts';

/** E.164 phone number regex: + followed by 1–15 digits */
const E164_REGEX = /^\+[1-9]\d{1,14}$/;

export interface SMSResult {
  ok: boolean;
  sid?: string;
  error?: string;
}

function getTwilioConfig() {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  const fromNumber = Deno.env.get('TWILIO_FROM_NUMBER');

  if (!accountSid || !authToken || !fromNumber) {
    return null;
  }

  return { accountSid, authToken, fromNumber };
}

function isSandboxMode(): boolean {
  const sandbox = Deno.env.get('TWILIO_SANDBOX');
  return sandbox === 'true' || sandbox === '1';
}

/**
 * Validate that a phone number is in E.164 format.
 */
export function isE164(phone: string): boolean {
  return E164_REGEX.test(phone);
}

/**
 * Normalize a phone string to E.164. Handles common cases:
 * - Already E.164 → pass through
 * - 10-digit US number → prepend +1
 * - 11-digit starting with 1 → prepend +
 * Returns null if cannot normalize.
 */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');

  // Already E.164
  if (isE164(phone)) return phone;

  // 10-digit US number
  if (digits.length === 10) return `+1${digits}`;

  // 11-digit starting with 1 (US with country code)
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;

  return null;
}

/**
 * Send an SMS via Twilio REST API.
 *
 * Uses basic auth (accountSid:authToken) against the Messages resource.
 * In sandbox mode, logs the message without sending.
 */
export async function sendSMS(to: string, body: string): Promise<SMSResult> {
  // Validate E.164
  if (!isE164(to)) {
    const masked = to.length > 4 ? to.slice(0, 3) + '***' + to.slice(-2) : '***';
    const error = `Invalid phone number (not E.164): ${masked}`;
    console.error('[sms]', error);
    return { ok: false, error };
  }

  // Sandbox mode — log but don't send
  if (isSandboxMode()) {
    const masked = to.slice(0, 5) + '***' + to.slice(-2);
    const preview = body.length > 60 ? body.slice(0, 60) + '…' : body;
    console.log('[sms][SANDBOX] Would send to %s: %s', masked, preview);
    return { ok: true, sid: `SANDBOX_${Date.now()}` };
  }

  // Check Twilio config
  const config = getTwilioConfig();
  if (!config) {
    const error = 'Twilio not configured (missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_FROM_NUMBER)';
    console.error('[sms]', error);
    return { ok: false, error };
  }

  const { accountSid, authToken, fromNumber } = config;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${btoa(`${accountSid}:${authToken}`)}`,
      },
      body: new URLSearchParams({
        To: to,
        From: fromNumber,
        Body: body,
      }),
    });

    const data = await res.json();

    if (res.ok && data.sid) {
      const masked = to.slice(0, 5) + '***' + to.slice(-2);
      console.log('[sms] Sent: sid=%s to=%s', data.sid, masked);
      return { ok: true, sid: data.sid };
    }

    const error = data.message || `Twilio error ${res.status}`;
    console.error('[sms] Twilio API error:', res.status, error);
    return { ok: false, error };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'SMS send failed';
    console.error('[sms] Network error:', error);
    return { ok: false, error };
  }
}

/**
 * Send SMS and log to sms_log table.
 * Fire-and-forget safe — never throws.
 */
export async function sendSMSAndLog(
  svc: SupabaseClient,
  opts: {
    to: string;
    body: string;
    userId?: string;
    ticketId?: string;
  },
): Promise<SMSResult> {
  let result: SMSResult;

  try {
    result = await sendSMS(opts.to, opts.body);
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Unexpected SMS error';
    console.error('[sms] sendSMS threw unexpectedly:', error);
    result = { ok: false, error };
  }

  // Log to sms_log (service client bypasses RLS)
  try {
    await svc.from('sms_log').insert({
      user_id: opts.userId ?? null,
      ticket_id: opts.ticketId ?? null,
      phone_number: opts.to,
      message_body: opts.body,
      twilio_sid: result.sid ?? null,
      status: result.ok ? (isSandboxMode() ? 'sandbox' : 'sent') : 'failed',
      error_message: result.error ?? null,
    });
  } catch (logErr) {
    console.error('[sms] Failed to write sms_log:', logErr);
  }

  return result;
}
