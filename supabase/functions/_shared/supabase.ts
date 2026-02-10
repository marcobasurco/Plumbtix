// =============================================================================
// Work Orders — Edge Function Shared: Supabase Client Factories
// =============================================================================
// Two client patterns:
//   1. Service role — bypasses ALL RLS. Use ONLY for onboarding flows
//      (accept-invitation, claim-resident) or when reading user role.
//   2. User JWT pass-through — caller's JWT is forwarded to Postgres,
//      so RLS policies enforce access control.
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

export type { SupabaseClient };

/**
 * Service role client — bypasses ALL RLS.
 * ONLY use when:
 *   - No authenticated user exists yet (onboarding token flows)
 *   - Reading user role for authorization decisions
 * NEVER expose the service role key to the client.
 */
export function createServiceClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * User JWT client — RLS enforced using caller's JWT.
 * Use for all authenticated operations (tickets, comments, attachments).
 *
 * @throws Error if Authorization header is missing
 */
export function createUserClient(req: Request): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !anonKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    throw new Error('Missing Authorization header');
  }

  return createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Extract the user ID from the JWT in the request.
 * Uses the user JWT client to call auth.getUser(), which validates the JWT
 * with Supabase Auth and returns the user's UUID.
 *
 * @returns { userId: string } on success
 * @throws Error with descriptive message on failure
 */
export async function getAuthenticatedUserId(
  userClient: SupabaseClient,
): Promise<string> {
  const {
    data: { user },
    error,
  } = await userClient.auth.getUser();

  if (error || !user) {
    throw new Error('Invalid or expired JWT');
  }

  return user.id;
}
