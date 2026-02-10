// =============================================================================
// PlumbTix — Edge Function: send-invitation
// =============================================================================
// Route:  POST /functions/v1/send-invitation
// Auth:   JWT required (proroto_admin or pm_admin only)
//
// Auth strategy:
//   1. User JWT  → auth.getUser() to identify caller
//   2. User JWT  → RPC get_user_role() + get_user_company_id() (no service role)
//   3. User JWT  → INSERT into invitations (RLS enforces company access)
//   4. Service role → duplicate checks only (cross-company email uniqueness)
//
// Flow:
//   1. Authenticate + verify role (proroto_admin or pm_admin)
//   2. pm_admin: can only invite into own company
//   3. Check for existing pending invitation (same email + company)
//   4. Check for existing user with this email (cross-company)
//   5. INSERT invitation via user JWT (RLS validates company access)
//   6. Return invitation record
//
// Email delivery: Sent via Resend (fire-and-forget, non-blocking).
// Expiry: 7 days from creation.
// =============================================================================

import { handleCors } from '../_shared/cors.ts';
import {
  createUserClient,
  createServiceClient,
  getAuthenticatedUserId,
} from '../_shared/supabase.ts';
import { ok, err, unauthorized, forbidden, conflict, serverError } from '../_shared/response.ts';
import { z, parseBody, UUID_REGEX } from '../_shared/validation.ts';
import { getCallerRole, getCallerCompanyId } from '../_shared/auth.ts';
import { notifyInvitation } from '../_shared/notifications.ts';

const INVITATION_ROLES = ['pm_admin', 'pm_user'] as const;
const EXPIRY_DAYS = 7;

const SendInvitationSchema = z.object({
  company_id: z.string().regex(UUID_REGEX, 'Invalid company_id'),
  email: z.string().email('Invalid email'),
  name: z.string().min(1, 'Name is required').max(255),
  role: z.enum(INVITATION_ROLES),
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

  // ─── 2. Read caller role + company via RPC (no service role) ───
  const role = await getCallerRole(userClient);
  if (!role) {
    return unauthorized('User profile not found');
  }

  if (role !== 'proroto_admin' && role !== 'pm_admin') {
    return forbidden('Only Pro Roto admins and Property Manager admins can send invitations');
  }

  // ─── 3. Validate body ───
  const parsed = await parseBody(req, SendInvitationSchema);
  if (!parsed.success) {
    return err('VALIDATION_ERROR', parsed.message);
  }

  const { company_id, email, name, role: inviteRole } = parsed.data;

  // ─── 4. pm_admin: can only invite into own company ───
  if (role === 'pm_admin') {
    const callerCompanyId = await getCallerCompanyId(userClient);
    if (callerCompanyId !== company_id) {
      return forbidden('You can only send invitations for your own company');
    }
  }

  try {
    // ─── 5. Service role for cross-company duplicate checks ───
    const svc = createServiceClient();

    // Check for existing pending invitation (same email + company)
    const { data: existing } = await svc
      .from('invitations')
      .select('id')
      .eq('company_id', company_id)
      .eq('email', email)
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (existing) {
      return conflict('A pending invitation already exists for this email and company');
    }

    // Check for existing user with this email (cross-company visibility needed)
    const { data: existingUser } = await svc
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existingUser) {
      return conflict('A user with this email already exists');
    }

    // ─── 6. Calculate expiry ───
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + EXPIRY_DAYS);

    // ─── 7. INSERT via user JWT (RLS enforces company access) ───
    const { data: invitation, error: insertErr } = await userClient
      .from('invitations')
      .insert({
        company_id,
        email,
        name,
        role: inviteRole,
        invited_by_user_id: userId,
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single();

    if (insertErr) {
      if (insertErr.message?.includes('row-level security')) {
        return forbidden('You do not have access to invite users for this company');
      }
      if (insertErr.message?.includes('foreign key')) {
        return err('INVALID_REFERENCE', 'Company not found', 400);
      }
      console.error('[send-invitation] Insert failed:', insertErr.message);
      return serverError('Failed to create invitation');
    }

    console.log(
      '[send-invitation] Created: invitation=%s, company=%s, email=%s, role=%s, by=%s',
      invitation.id, company_id, email, inviteRole, userId,
    );

    // ─── 8. Send invitation email via Resend (fire-and-forget) ───
    // Look up inviter name + company name for the email template
    const { data: inviter } = await svc
      .from('users')
      .select('full_name')
      .eq('id', userId)
      .single();

    const { data: company } = await svc
      .from('companies')
      .select('name')
      .eq('id', company_id)
      .single();

    const ROLE_LABELS: Record<string, string> = {
      pm_admin: 'Property Manager Admin',
      pm_user: 'Property Manager User',
    };

    // Don't await — email failure shouldn't block the response
    notifyInvitation({
      recipientName: name,
      recipientEmail: email,
      companyName: company?.name || 'your company',
      role: ROLE_LABELS[inviteRole] || inviteRole,
      invitedByName: inviter?.full_name || 'Your administrator',
      token: invitation.token,
    });

    return ok({ invitation }, 201);
  } catch (e) {
    console.error('[send-invitation] Unexpected error:', e);
    return serverError('Unexpected error creating invitation');
  }
});
