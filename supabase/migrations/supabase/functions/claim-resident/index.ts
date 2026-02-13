// =============================================================================
// Work Orders — Edge Function: claim-resident
// =============================================================================
// Route:  POST /functions/v1/claim-resident
// Auth:   NONE (public — invite_token is the credential)
// Client: Service role (must create auth.users + public.users + update occupant)
//
// Flow:
//   1. Validate request body (invite_token, email, password)
//   2. Look up occupant by invite_token
//   3. Verify: not already claimed, email matches
//   4. Create auth.users record via Admin API
//   5. Insert public.users with role = 'resident', company_id = NULL
//   6. Update occupant: link user_id, set claimed_at
//   7. Sign in to generate session tokens
//   8. Return user + session
//
// Security:
//   - Token is single-use (claimed_at is set after use)
//   - Email must match the occupant's email
//   - Residents have company_id = NULL (access via occupant→space chain)
//   - Password is never logged
// =============================================================================

import { handleCors } from '../_shared/cors.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { ok, err, conflict, notFound, serverError } from '../_shared/response.ts';
import { z, parseBody, UUID_REGEX } from '../_shared/validation.ts';

const ClaimResidentSchema = z.object({
  invite_token: z.string().regex(UUID_REGEX, 'Invalid token format'),
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCors();

  if (req.method !== 'POST') {
    return err('METHOD_NOT_ALLOWED', 'POST required', 405);
  }

  const parsed = await parseBody(req, ClaimResidentSchema);
  if (!parsed.success) {
    return err('VALIDATION_ERROR', parsed.message);
  }
  const { invite_token, email, password } = parsed.data;

  try {
    const svc = createServiceClient();

    // ─── 1. Look up occupant by invite_token ───
    const { data: occupant, error: occErr } = await svc
      .from('occupants')
      .select('id, space_id, user_id, name, email, phone, claimed_at')
      .eq('invite_token', invite_token)
      .single();

    if (occErr || !occupant) {
      console.warn('[claim-resident] Token not found');
      return notFound('Invalid or expired invitation');
    }

    // ─── 2. Already claimed? ───
    if (occupant.claimed_at || occupant.user_id) {
      return conflict('This account has already been claimed');
    }

    // ─── 3. Email must match occupant record ───
    if (occupant.email.toLowerCase() !== email.toLowerCase()) {
      return err('EMAIL_MISMATCH', 'Email does not match the invitation', 400);
    }

    // ─── 4. Create auth user ───
    const { data: authData, error: authErr } =
      await svc.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (authErr) {
      const msg = (authErr.message ?? '').toLowerCase();
      if (msg.includes('already') || msg.includes('registered') || msg.includes('exists') || msg.includes('duplicate')) {
        return conflict('An account with this email already exists. Try signing in instead.');
      }
      console.error('[claim-resident] Auth create failed:', authErr.message);
      return serverError('Failed to create user account');
    }

    if (!authData?.user?.id) {
      console.error('[claim-resident] Auth create returned no user');
      return serverError('Failed to create user account');
    }

    const authUserId = authData.user.id;

    // ─── 5. Insert public.users (resident, no company) ───
    const { error: userErr } = await svc
      .from('users')
      .insert({
        id: authUserId,
        email,
        full_name: occupant.name,   // Use the name from the occupant record
        phone: occupant.phone ?? null,
        role: 'resident',
        company_id: null,           // Residents access via occupant→space chain
        sms_notifications_enabled: false,
      });

    if (userErr) {
      console.error('[claim-resident] Users insert failed:', userErr.message);
      await svc.auth.admin.deleteUser(authUserId);
      return serverError('Failed to create user profile');
    }

    // ─── 6. Link occupant to new user ───
    const { error: linkErr } = await svc
      .from('occupants')
      .update({
        user_id: authUserId,
        claimed_at: new Date().toISOString(),
      })
      .eq('id', occupant.id);

    if (linkErr) {
      // Non-fatal: user is created but occupant link failed.
      // The proroto_admin can fix this manually.
      console.error('[claim-resident] Occupant link failed:', linkErr.message);
    }

    // ─── 7. Sign in to get session ───
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
      console.warn('[claim-resident] Auto sign-in failed:', sessErr?.message);
    }

    // ─── 8. Return success ───
    const userRecord = {
      id: authUserId,
      email,
      full_name: occupant.name,
      phone: occupant.phone ?? null,
      role: 'resident' as const,
      company_id: null,
      avatar_url: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    console.log('[claim-resident] Success: user=%s, occupant=%s, space=%s',
      authUserId, occupant.id, occupant.space_id);

    return ok({ user: userRecord, session }, 201);
  } catch (e) {
    console.error('[claim-resident] Unexpected error:', e);
    return serverError('Unexpected error during account claim');
  }
});
