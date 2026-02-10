// =============================================================================
// Work Orders — Edge Function: accept-invitation
// =============================================================================
// Route:  POST /functions/v1/accept-invitation
// Auth:   NONE (public — token is the credential)
// Client: Service role (must create auth.users + public.users)
//
// Flow:
//   1. Validate request body (token, email, password, full_name)
//   2. Look up invitation by token
//   3. Verify: not expired, not already accepted, email matches
//   4. Create auth.users record via Admin API
//   5. Insert public.users with role + company from invitation
//   6. Mark invitation as accepted
//   7. Sign in to generate session tokens
//   8. Return user + session
//
// Security:
//   - Token is single-use (accepted_at is set after use)
//   - Email must match the invitation email exactly
//   - Password is never logged
//   - Service role key is used server-side only
// =============================================================================

import { handleCors } from '../_shared/cors.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { ok, err, conflict, notFound, serverError } from '../_shared/response.ts';
import { z, parseBody, UUID_REGEX } from '../_shared/validation.ts';

const AcceptInvitationSchema = z.object({
  token: z.string().regex(UUID_REGEX, 'Invalid token format'),
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  full_name: z.string().min(1, 'Name is required').max(255),
  phone: z.string().max(20).optional(),
});

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') return handleCors();

  // Method guard
  if (req.method !== 'POST') {
    return err('METHOD_NOT_ALLOWED', 'POST required', 405);
  }

  // Parse + validate body
  const parsed = await parseBody(req, AcceptInvitationSchema);
  if (!parsed.success) {
    return err('VALIDATION_ERROR', parsed.message);
  }
  const { token, email, password, full_name, phone } = parsed.data;

  try {
    const svc = createServiceClient();

    // ─── 1. Look up invitation by token ───
    const { data: invitation, error: invErr } = await svc
      .from('invitations')
      .select('id, company_id, email, name, role, token, expires_at, accepted_at')
      .eq('token', token)
      .single();

    if (invErr || !invitation) {
      console.warn('[accept-invitation] Token not found');
      return notFound('Invalid or expired invitation');
    }

    // ─── 2. Already accepted? ───
    if (invitation.accepted_at) {
      return conflict('This invitation has already been used');
    }

    // ─── 3. Expired? ───
    if (new Date(invitation.expires_at) < new Date()) {
      return err('EXPIRED', 'This invitation has expired', 410);
    }

    // ─── 4. Email must match ───
    if (invitation.email.toLowerCase() !== email.toLowerCase()) {
      return err('EMAIL_MISMATCH', 'Email does not match the invitation', 400);
    }

    // ─── 5. Create auth user ───
    const { data: authData, error: authErr } =
      await svc.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // Skip email confirmation for invited users
      });

    if (authErr) {
      // Duplicate email in auth.users
      if (authErr.message?.includes('already been registered')) {
        return conflict('An account with this email already exists');
      }
      console.error('[accept-invitation] Auth create failed:', authErr.message);
      return serverError('Failed to create user account');
    }

    const authUserId = authData.user.id;

    // ─── 6. Insert public.users ───
    const { error: userErr } = await svc
      .from('users')
      .insert({
        id: authUserId,
        email,
        full_name,
        phone: phone ?? null,
        role: invitation.role,           // pm_admin or pm_user
        company_id: invitation.company_id,
      });

    if (userErr) {
      // Rollback: delete the auth user we just created
      console.error('[accept-invitation] Users insert failed:', userErr.message);
      await svc.auth.admin.deleteUser(authUserId);
      return serverError('Failed to create user profile');
    }

    // ─── 7. Mark invitation as accepted ───
    const { error: acceptErr } = await svc
      .from('invitations')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', invitation.id);

    if (acceptErr) {
      // Non-fatal: user is created but invitation isn't marked.
      // Log and continue — the user can still log in.
      console.error('[accept-invitation] Failed to mark accepted:', acceptErr.message);
    }

    // ─── 8. Sign in to get session tokens ───
    // admin.createUser with email_confirm: true creates a verified user,
    // so signInWithPassword works immediately.
    let session = null;

    const url = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.49.1');
    const anonClient = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: sessData, error: sessErr } =
      await anonClient.auth.signInWithPassword({ email, password });

    if (!sessErr && sessData?.session) {
      session = {
        access_token: sessData.session.access_token,
        refresh_token: sessData.session.refresh_token,
      };
    } else {
      // Non-fatal: user was created but we couldn't auto-sign-in.
      // They can log in manually.
      console.warn('[accept-invitation] Auto sign-in failed:', sessErr?.message);
    }

    // ─── 9. Return success ───
    const userRecord = {
      id: authUserId,
      email,
      full_name,
      phone: phone ?? null,
      role: invitation.role,
      company_id: invitation.company_id,
      avatar_url: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    console.log('[accept-invitation] Success: user=%s, role=%s, company=%s',
      authUserId, invitation.role, invitation.company_id);

    return ok({ user: userRecord, session }, 201);
  } catch (e) {
    console.error('[accept-invitation] Unexpected error:', e);
    return serverError('Unexpected error during invitation acceptance');
  }
});
