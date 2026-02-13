// =============================================================================
// PlumbTix — Edge Function: delete-invitation
// =============================================================================
// Route:  POST /functions/v1/delete-invitation
// Auth:   proroto_admin or pm_admin (same company)
//
// Deletes an invitation AND cleans up any orphaned auth.users entry
// that was created by a failed registration attempt.
//
// Flow:
//   1. Validate request (invitation_id)
//   2. Look up invitation
//   3. Check if invitation email exists in auth.users but NOT in public.users
//   4. If orphaned auth user exists → delete it
//   5. Delete the invitation record
// =============================================================================

import { handleCors } from '../_shared/cors.ts';
import { createServiceClient, createUserClient, getAuthenticatedUserId } from '../_shared/supabase.ts';
import { ok, err, notFound, serverError } from '../_shared/response.ts';
import { z, parseBody, UUID_REGEX } from '../_shared/validation.ts';

const DeleteInvitationSchema = z.object({
  invitation_id: z.string().regex(UUID_REGEX, 'Invalid invitation ID'),
});

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCors();
  if (req.method !== 'POST') return err('METHOD_NOT_ALLOWED', 'POST required', 405);

  const parsed = await parseBody(req, DeleteInvitationSchema);
  if (!parsed.success) return err('VALIDATION_ERROR', parsed.message);
  const { invitation_id } = parsed.data;

  try {
    const userClient = createUserClient(req);
    const userId = await getAuthenticatedUserId(userClient);
    if (!userId) return err('UNAUTHORIZED', 'Not authenticated', 401);

    const svc = createServiceClient();

    // ─── 1. Get caller's role ───
    const { data: caller } = await svc
      .from('users')
      .select('role, company_id')
      .eq('id', userId)
      .single();

    if (!caller) return err('UNAUTHORIZED', 'User not found', 401);

    // ─── 2. Look up invitation ───
    const { data: invitation, error: invErr } = await svc
      .from('invitations')
      .select('id, email, company_id, accepted_at')
      .eq('id', invitation_id)
      .single();

    if (invErr || !invitation) {
      return notFound('Invitation not found');
    }

    // ─── 3. Authorization check ───
    if (caller.role === 'pm_admin' && caller.company_id !== invitation.company_id) {
      return err('FORBIDDEN', 'Cannot delete invitations from other companies', 403);
    }
    if (caller.role !== 'proroto_admin' && caller.role !== 'pm_admin') {
      return err('FORBIDDEN', 'Only admins can delete invitations', 403);
    }

    // ─── 4. Clean up orphaned auth user ───
    // Check if this email exists in auth.users but NOT in public.users
    // This happens when a previous accept-invitation created the auth user
    // but failed to create the public.users record (or user never completed setup)
    const invEmail = invitation.email.toLowerCase();

    // Check if this email exists in public.users
    const { data: publicUser } = await svc
      .from('users')
      .select('id')
      .eq('email', invEmail)
      .maybeSingle();

    if (!publicUser) {
      // No public.users record — check if there's an orphaned auth.users entry
      // We can find it by trying to look up via GoTrue admin API
      const { data: { users: authUsers } } = await svc.auth.admin.listUsers();
      const orphanedAuth = authUsers?.find(
        (u: { email?: string }) => u.email?.toLowerCase() === invEmail
      );

      if (orphanedAuth) {
        console.log('[delete-invitation] Cleaning up orphaned auth user: %s (%s)',
          orphanedAuth.id, invEmail);
        const { error: deleteAuthErr } = await svc.auth.admin.deleteUser(orphanedAuth.id);
        if (deleteAuthErr) {
          console.error('[delete-invitation] Failed to delete orphaned auth user:', deleteAuthErr.message);
          // Continue anyway — the invitation delete is more important
        } else {
          console.log('[delete-invitation] Orphaned auth user deleted successfully');
        }
      }
    } else {
      // User exists in public.users — this is a real registered user
      // Don't delete the auth user, just the invitation
      console.log('[delete-invitation] Email %s has a registered account — only deleting invitation', invEmail);
    }

    // ─── 5. Delete the invitation ───
    const { error: delErr } = await svc
      .from('invitations')
      .delete()
      .eq('id', invitation_id);

    if (delErr) {
      console.error('[delete-invitation] Delete failed:', delErr.message);
      return serverError('Failed to delete invitation');
    }

    console.log('[delete-invitation] Deleted invitation %s for %s', invitation_id, invEmail);
    return ok({ deleted: true });
  } catch (e) {
    console.error('[delete-invitation] Unexpected error:', e);
    return serverError('Unexpected error');
  }
});
