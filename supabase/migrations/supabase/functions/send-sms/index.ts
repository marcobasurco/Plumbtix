// =============================================================================
// Work Orders — Edge Function: send-sms
// =============================================================================
// Direct SMS sending endpoint. Called internally by other functions or
// from Supabase database webhooks/triggers.
//
// Auth: Requires valid JWT from proroto_admin user.
// Body: { to: string (E.164), body: string, user_id?: string, ticket_id?: string }
// =============================================================================

import { handleCors } from '../_shared/cors.ts';
import { createServiceClient, createUserClient, getAuthenticatedUserId } from '../_shared/supabase.ts';
import { ok, err, unauthorized, serverError } from '../_shared/response.ts';
import { z, parseBody, UUID_REGEX } from '../_shared/validation.ts';
import { sendSMSAndLog, isE164 } from '../_shared/sms.ts';
import { getCallerRole } from '../_shared/auth.ts';

const SendSMSSchema = z.object({
  to: z.string().min(1, 'Phone number required'),
  body: z.string().min(1, 'Message body required').max(1600, 'SMS body too long'),
  user_id: z.string().regex(UUID_REGEX, 'Invalid user_id').optional(),
  ticket_id: z.string().regex(UUID_REGEX, 'Invalid ticket_id').optional(),
});

Deno.serve(async (req: Request) => {
  console.log('[send-sms] Handler invoked:', req.method);
  if (req.method === 'OPTIONS') return handleCors();
  if (req.method !== 'POST') return err('METHOD_NOT_ALLOWED', 'POST required', 405);

  // Auth check: must be proroto_admin
  let userClient;
  try {
    userClient = createUserClient(req);
    await getAuthenticatedUserId(userClient);
  } catch {
    return unauthorized();
  }

  const role = await getCallerRole(userClient);
  if (role !== 'proroto_admin') {
    return err('FORBIDDEN', 'Only Pro Roto admin can send SMS directly', 403);
  }

  const parsed = await parseBody(req, SendSMSSchema);
  if (!parsed.success) {
    return err('VALIDATION_ERROR', parsed.message);
  }

  const { to, body, user_id, ticket_id } = parsed.data;

  if (!isE164(to)) {
    return err('INVALID_PHONE', 'Phone number must be in E.164 format (e.g. +16505551234)');
  }

  try {
    const svc = createServiceClient();
    const result = await sendSMSAndLog(svc, { to, body, userId: user_id, ticketId: ticket_id });

    if (result.ok) {
      const isSandbox = result.sid?.startsWith('SANDBOX_');
      return ok({ sid: result.sid, status: isSandbox ? 'sandbox' : 'sent' });
    }

    return err('SMS_FAILED', result.error ?? 'Failed to send SMS', 502);
  } catch (e) {
    console.error('[send-sms] Unexpected error:', e);
    return serverError('Unexpected error during SMS send');
  }
});
