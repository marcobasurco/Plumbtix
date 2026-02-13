// =============================================================================
// Work Orders — Edge Function: resend-invitation
// =============================================================================
// Route:  POST /functions/v1/resend-invitation
// Auth:   JWT required (proroto_admin or pm_admin only)
//
// Updates email/name if provided, generates a new token, resets expiry,
// and resends the invitation email.
// =============================================================================

import { handleCors } from '../_shared/cors.ts';
import {
  createUserClient,
  createServiceClient,
  getAuthenticatedUserId,
} from '../_shared/supabase.ts';
import { ok, err, unauthorized, forbidden, serverError } from '../_shared/response.ts';
import { z, parseBody, UUID_REGEX } from '../_shared/validation.ts';
import { getCallerRole, getCallerCompanyId } from '../_shared/auth.ts';

const EXPIRY_DAYS = 7;

const ResendInvitationSchema = z.object({
  invitation_id: z.string().regex(UUID_REGEX, 'Invalid invitation_id'),
  email: z.string().email('Invalid email').optional(),
  name: z.string().min(1).max(255).optional(),
});

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCors();
  if (req.method !== 'POST') return err('METHOD_NOT_ALLOWED', 'POST required', 405);

  let userClient;
  let userId: string;
  try {
    userClient = createUserClient(req);
    userId = await getAuthenticatedUserId(userClient);
  } catch {
    return unauthorized();
  }

  const role = await getCallerRole(userClient);
  if (!role || (role !== 'proroto_admin' && role !== 'pm_admin')) {
    return forbidden('Only admins can resend invitations');
  }

  const parsed = await parseBody(req, ResendInvitationSchema);
  if (!parsed.success) return err('VALIDATION_ERROR', parsed.message);

  const { invitation_id, email, name } = parsed.data;

  try {
    const svc = createServiceClient();

    // Fetch existing invitation
    const { data: existing, error: fetchErr } = await svc
      .from('invitations')
      .select('id, company_id, email, name, role, accepted_at')
      .eq('id', invitation_id)
      .single();

    if (fetchErr || !existing) {
      return err('NOT_FOUND', 'Invitation not found', 404);
    }

    if (existing.accepted_at) {
      return err('ALREADY_ACCEPTED', 'This invitation has already been accepted', 400);
    }

    // pm_admin: can only manage invitations for own company
    if (role === 'pm_admin') {
      const callerCompanyId = await getCallerCompanyId(userClient);
      if (callerCompanyId !== existing.company_id) {
        return forbidden('You can only manage invitations for your own company');
      }
    }

    const newEmail = email?.trim().toLowerCase() || existing.email;
    const newName = name?.trim() || existing.name;

    // If email changed, check for conflicts
    if (newEmail !== existing.email) {
      const { data: existingUser } = await svc
        .from('users')
        .select('id')
        .eq('email', newEmail)
        .maybeSingle();
      if (existingUser) {
        return err('CONFLICT', 'A user with this email already exists', 409);
      }
    }

    // Generate new token and expiry
    const newToken = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + EXPIRY_DAYS);

    const { data: updated, error: updateErr } = await svc
      .from('invitations')
      .update({
        email: newEmail,
        name: newName,
        token: newToken,
        expires_at: expiresAt.toISOString(),
      })
      .eq('id', invitation_id)
      .select(`
        id, company_id, email, name, role, token, expires_at, accepted_at, created_at,
        company:companies(id, name),
        invited_by:users!invitations_invited_by_user_id_fkey(id, full_name)
      `)
      .single();

    if (updateErr) {
      console.error('[resend-invitation] Update failed:', updateErr.message);
      return serverError('Failed to update invitation');
    }

    console.log(
      '[resend-invitation] Resent: invitation=%s, email=%s→%s, by=%s',
      invitation_id, existing.email, newEmail, userId,
    );

    // Audit log
    const { logAuditAction } = await import('../_shared/email.ts');
    await logAuditAction(svc, userId, 'resend_invitation', {
      invitation_id,
      company_id: existing.company_id,
      old_email: existing.email,
      new_email: newEmail,
      old_name: existing.name,
      new_name: newName,
    }, 1);

    // Send invitation email (fire-and-forget)
    (async () => {
      try {
        const { data: inviter } = await svc
          .from('users')
          .select('full_name')
          .eq('id', userId)
          .single();

        const { data: company } = await svc
          .from('companies')
          .select('name')
          .eq('id', existing.company_id)
          .single();

        const ROLE_LABELS: Record<string, string> = {
          pm_admin: 'Property Manager Admin',
          pm_user: 'Property Manager User',
        };

        const { notifyInvitation } = await import('../_shared/notifications.ts');
        await notifyInvitation({
          recipientName: newName,
          recipientEmail: newEmail,
          companyName: company?.name || 'your company',
          role: ROLE_LABELS[existing.role] || existing.role,
          invitedByName: inviter?.full_name || 'Your administrator',
          token: newToken,
        });
      } catch (emailErr) {
        console.error('[resend-invitation] Email error (non-blocking):', emailErr);
      }
    })();

    return ok({ invitation: updated });
  } catch (e) {
    console.error('[resend-invitation] Unexpected error:', e);
    return serverError('Unexpected error');
  }
});
