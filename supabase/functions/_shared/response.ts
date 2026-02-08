// =============================================================================
// PlumbTix — Edge Function Shared: Response Helpers
// =============================================================================
// All responses follow the ApiResponse<T> shape from shared/types/api.ts:
//   Success: { ok: true,  data: T }
//   Error:   { ok: false, error: { code: string, message: string } }
// =============================================================================

import { corsHeaders } from './cors.ts';

/**
 * Return a success response (200 by default).
 */
export function ok<T>(data: T, status = 200): Response {
  return new Response(
    JSON.stringify({ ok: true, data }),
    {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    },
  );
}

/**
 * Return an error response.
 *
 * @param code   Machine-readable error code (e.g. "INVALID_TOKEN", "FORBIDDEN")
 * @param message Human-readable message (safe for display)
 * @param status  HTTP status code (default 400)
 */
export function err(code: string, message: string, status = 400): Response {
  return new Response(
    JSON.stringify({ ok: false, error: { code, message } }),
    {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    },
  );
}

/**
 * Return a 401 Unauthorized.
 */
export function unauthorized(message = 'Authentication required'): Response {
  return err('UNAUTHORIZED', message, 401);
}

/**
 * Return a 403 Forbidden.
 */
export function forbidden(message = 'Insufficient permissions'): Response {
  return err('FORBIDDEN', message, 403);
}

/**
 * Return a 404 Not Found.
 */
export function notFound(message = 'Resource not found'): Response {
  return err('NOT_FOUND', message, 404);
}

/**
 * Return a 500 Internal Server Error.
 * Never leak internal error details to the client.
 */
export function serverError(internalMessage?: string): Response {
  if (internalMessage) {
    console.error('[SERVER_ERROR]', internalMessage);
  }
  return err('INTERNAL_ERROR', 'An unexpected error occurred', 500);
}

/**
 * Return a 409 Conflict.
 */
export function conflict(message: string): Response {
  return err('CONFLICT', message, 409);
}
