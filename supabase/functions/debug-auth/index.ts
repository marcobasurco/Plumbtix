// =============================================================================
// Work Orders — Edge Function: debug-auth (TEMPORARY DIAGNOSTIC)
// =============================================================================
// Route:  POST /functions/v1/debug-auth
// Auth:   NONE (public — this is deployed with --no-verify-jwt)
//
// Purpose: Diagnose persistent "Invalid JWT" errors.
// If this function runs at all, it proves Kong isn't blocking it.
// It then manually validates the JWT to check auth works end-to-end.
//
// DELETE THIS FUNCTION after the JWT issue is resolved.
// =============================================================================

import { handleCors } from '../_shared/cors.ts';
import { createServiceClient } from '../_shared/supabase.ts';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const results: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    function_reached: true, // If you see this, Kong did NOT block the request
  };

  // ── 1. Check what headers we received ──
  const authHeader = req.headers.get('Authorization');
  const apikeyHeader = req.headers.get('apikey');

  results.headers_received = {
    has_authorization: !!authHeader,
    authorization_prefix: authHeader ? authHeader.substring(0, 15) + '...' : null,
    authorization_length: authHeader?.length ?? 0,
    has_apikey: !!apikeyHeader,
    apikey_prefix: apikeyHeader ? apikeyHeader.substring(0, 10) + '...' : null,
  };

  // ── 2. Decode JWT payload (without verifying signature) ──
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.replace('Bearer ', '');
    try {
      const parts = token.split('.');
      results.jwt_structure = {
        parts_count: parts.length,
        is_valid_structure: parts.length === 3,
      };

      if (parts.length >= 2) {
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
        const now = Math.floor(Date.now() / 1000);

        results.jwt_payload = {
          sub: payload.sub,           // User ID
          aud: payload.aud,           // Audience (should match project)
          role: payload.role,         // 'authenticated' or 'anon'
          iss: payload.iss,           // Issuer URL (should be your Supabase URL + /auth/v1)
          iat: payload.iat,           // Issued at
          exp: payload.exp,           // Expires at
          is_expired: payload.exp ? payload.exp < now : 'no_exp_claim',
          seconds_until_expiry: payload.exp ? payload.exp - now : null,
          email: payload.email,
        };

        // Check if issuer matches the Supabase URL this function is running on
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        results.env_check = {
          function_supabase_url: supabaseUrl,
          jwt_issuer: payload.iss,
          issuer_matches: payload.iss === `${supabaseUrl}/auth/v1`,
        };
      }
    } catch (e) {
      results.jwt_decode_error = e instanceof Error ? e.message : String(e);
    }
  }

  // ── 3. Actually validate the JWT with GoTrue (the real test) ──
  try {
    const svc = createServiceClient();

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');

      // Use the Admin API to get the user from the JWT
      const { data: { user }, error } = await svc.auth.getUser(token);

      results.gotrue_validation = {
        success: !!user && !error,
        user_id: user?.id ?? null,
        user_email: user?.email ?? null,
        error: error?.message ?? null,
      };
    } else {
      results.gotrue_validation = {
        success: false,
        error: 'No Bearer token in Authorization header',
      };
    }
  } catch (e) {
    results.gotrue_validation = {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  // ── 4. Summary diagnosis ──
  const jwtPayload = results.jwt_payload as Record<string, unknown> | undefined;
  const envCheck = results.env_check as Record<string, unknown> | undefined;
  const gotrueResult = results.gotrue_validation as Record<string, unknown> | undefined;

  if (!authHeader) {
    results.diagnosis = 'NO_AUTH_HEADER: Frontend is not sending the Authorization header.';
  } else if (jwtPayload?.is_expired === true) {
    results.diagnosis = 'JWT_EXPIRED: Token has expired. Frontend refresh is not working.';
  } else if (envCheck?.issuer_matches === false) {
    results.diagnosis =
      `ISSUER_MISMATCH: JWT was issued by "${jwtPayload?.iss}" but this Supabase project is "${envCheck?.function_supabase_url}". ` +
      'Check that VITE_SUPABASE_URL and VITE_EDGE_BASE_URL point to the SAME Supabase project.';
  } else if (gotrueResult?.success === true) {
    results.diagnosis =
      'JWT_VALID: The JWT is valid and GoTrue recognizes the user. ' +
      'The "Invalid JWT" error is coming from Kong gateway JWT verification. ' +
      'Disable it in Supabase Dashboard → Edge Functions → [function] → turn OFF "Enforce JWT Verification". ' +
      'Or deploy with: supabase functions deploy create-ticket --no-verify-jwt';
  } else {
    results.diagnosis =
      `GOTRUE_REJECTED: GoTrue rejected the token: ${gotrueResult?.error}. ` +
      'The JWT may be from a different project or corrupted.';
  }

  return new Response(JSON.stringify({ ok: true, data: results }, null, 2), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
