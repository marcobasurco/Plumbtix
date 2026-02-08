// =============================================================================
// PlumbTix — Edge Function Shared: Auth Helpers
// =============================================================================
// Role lookup strategy:
//   PREFERRED: getCallerRole() / getCallerCompanyId() — call Section 5
//   SECURITY DEFINER RPC functions via user JWT. No service role needed.
//
//   FALLBACK: getCallerInfo() — direct table read via service role client.
//   Use ONLY in token-based onboarding flows where no JWT exists.
// =============================================================================

import type { SupabaseClient } from './supabase.ts';

/** User role type matching the Postgres user_role enum */
export type UserRole = 'proroto_admin' | 'pm_admin' | 'pm_user' | 'resident';

/**
 * Get the caller's role via the get_user_role() SECURITY DEFINER RPC.
 * Uses the caller's own JWT — no service role needed.
 *
 * This calls Section 5's get_user_role() function which reads
 * public.users.role WHERE id = auth.uid() with elevated privileges.
 *
 * @param userClient - A user-JWT Supabase client
 * @returns UserRole on success, null if user has no public.users record
 */
export async function getCallerRole(
  userClient: SupabaseClient,
): Promise<UserRole | null> {
  const { data, error } = await userClient.rpc('get_user_role');
  if (error || data === null || data === undefined) {
    return null;
  }
  return data as UserRole;
}

/**
 * Get the caller's company_id via the get_user_company_id() SECURITY DEFINER RPC.
 * Uses the caller's own JWT — no service role needed.
 *
 * @param userClient - A user-JWT Supabase client
 * @returns company UUID on success, null if no company or no user record
 */
export async function getCallerCompanyId(
  userClient: SupabaseClient,
): Promise<string | null> {
  const { data, error } = await userClient.rpc('get_user_company_id');
  if (error || data === null || data === undefined) {
    return null;
  }
  return data as string;
}

/**
 * Full user record lookup via service role (bypasses RLS).
 * Use ONLY when no JWT exists (token-based onboarding flows).
 *
 * @param serviceClient - A service-role Supabase client
 * @param userId - auth.uid() of the target user
 */
export interface CallerInfo {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  company_id: string | null;
}

export async function getCallerInfo(
  serviceClient: SupabaseClient,
  userId: string,
): Promise<CallerInfo | null> {
  const { data, error } = await serviceClient
    .from('users')
    .select('id, email, full_name, role, company_id')
    .eq('id', userId)
    .single();

  if (error || !data) {
    return null;
  }
  return data as CallerInfo;
}

/**
 * Check if a role is proroto_admin.
 */
export function isProRotoAdmin(role: UserRole): boolean {
  return role === 'proroto_admin';
}

/**
 * Check if a role is a PM role (pm_admin or pm_user).
 */
export function isPMRole(role: UserRole): boolean {
  return role === 'pm_admin' || role === 'pm_user';
}
