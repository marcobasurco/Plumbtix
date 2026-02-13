// =============================================================================
// Work Orders — Edge Function API Client (Frontend)
// =============================================================================
// Typed wrapper for all Edge Function calls.
// - Attaches Authorization: Bearer <access_token> from current session
// - Returns consistent { ok, data } | { ok, error } shape
// - Never calls ticket_comments via PostgREST (migration 00006 blocks it)
// =============================================================================

import { supabase } from './supabaseClient';
import type {
  AcceptInvitationRequest,
  AcceptInvitationResponse,
  ClaimResidentRequest,
  ClaimResidentResponse,
  CreateTicketRequest,
  CreateTicketResponse,
  UpdateTicketRequest,
  UpdateTicketResponse,
  GetTicketCommentsResponse,
  CreateCommentRequest,
  CreateCommentResponse,
  RegisterAttachmentRequest,
  RegisterAttachmentResponse,
  DeleteAttachmentRequest,
  DeleteAttachmentResponse,
  SendInvitationRequest,
  SendInvitationResponse,
  ResendInvitationRequest,
  ResendInvitationResponse,
  UpdateOccupantRequest,
  UpdateOccupantResponse,
} from '@shared/types/api';

const EDGE_BASE = import.meta.env.VITE_EDGE_BASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

if (!EDGE_BASE) {
  throw new Error('Missing VITE_EDGE_BASE_URL in environment');
}

// ---------------------------------------------------------------------------
// Startup: detect EDGE_BASE / SUPABASE_URL mismatch (common cause of
// persistent "Invalid JWT" — JWT signed by Project A, sent to Project B)
// ---------------------------------------------------------------------------
if (SUPABASE_URL && EDGE_BASE && !EDGE_BASE.startsWith(SUPABASE_URL)) {
  console.error(
    '[api] ⚠️ VITE_EDGE_BASE_URL does not start with VITE_SUPABASE_URL!\n' +
    '  SUPABASE_URL: %s\n  EDGE_BASE:    %s\n' +
    '  This causes persistent "Invalid JWT" because the JWT is signed\n' +
    '  by one project but validated by another.',
    SUPABASE_URL, EDGE_BASE,
  );
}

// ---------------------------------------------------------------------------
// Core fetch helper
// ---------------------------------------------------------------------------

export interface ApiError {
  code: string;
  message: string;
  status: number;
}

type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError };

/**
 * Call an Edge Function. Automatically attaches the current session JWT.
 *
 * @param path     Function name (e.g. "create-ticket")
 * @param options  method, body, query params
 */
async function callEdge<T>(
  path: string,
  options: {
    method: 'GET' | 'POST' | 'PATCH';
    body?: unknown;
    params?: Record<string, string>;
    requireAuth?: boolean; // default true
  },
): Promise<ApiResult<T>> {
  const { method, body, params, requireAuth = true } = options;

  // Build URL with query params
  const url = new URL(`${EDGE_BASE}/${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  // Build headers — apikey is required by Supabase's API gateway (Kong)
  const headers: Record<string, string> = {
    'apikey': ANON_KEY,
  };

  // Only set Content-Type when sending a body (POST/PATCH)
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (requireAuth) {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.access_token) {
      return {
        ok: false,
        error: { code: 'NO_SESSION', message: 'Not logged in. Please sign in and try again.', status: 401 },
      };
    }

    headers['Authorization'] = `Bearer ${session.access_token}`;
  }

  try {
    let res = await fetch(url.toString(), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    // On 401, try refreshing the session once and retry
    if (res.status === 401 && requireAuth) {
      console.warn('[api] 401 from %s — attempting session refresh', path);

      const { data: refreshData } = await supabase.auth.refreshSession();

      if (refreshData?.session?.access_token) {
        // Retry with the refreshed token
        headers['Authorization'] = `Bearer ${refreshData.session.access_token}`;
        res = await fetch(url.toString(), {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
        });
      }

      // If STILL 401 — log diagnostics for troubleshooting
      if (res.status === 401) {
        console.error(
          '[api] Persistent 401 after session refresh on %s.\n' +
          '  Likely cause: functions deployed without --no-verify-jwt.\n' +
          '  Fix: npm run functions:deploy',
          path,
        );
      }
    }

    // Handle non-JSON responses (e.g., Kong HTML error pages)
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      return {
        ok: false,
        error: {
          code: 'NON_JSON_RESPONSE',
          message: `Server returned ${res.status}: ${res.statusText}`,
          status: res.status,
        },
      };
    }

    const json = await res.json();

    if (!res.ok || !json.ok) {
      // Our edge functions return: { ok: false, error: { code, message } }
      // Supabase gateway errors return: { error: "string" } or { msg: "string" }
      // Handle all shapes:
      const errObj = json?.error;
      let code = 'UNKNOWN';
      let message = `Server error (HTTP ${res.status})`;

      if (errObj && typeof errObj === 'object') {
        // Our standard format: { error: { code, message } }
        code = errObj.code ?? 'UNKNOWN';
        message = errObj.message ?? `Server error (HTTP ${res.status})`;
      } else if (typeof errObj === 'string') {
        // Supabase gateway: { error: "Edge Function returned..." }
        code = 'GATEWAY_ERROR';
        message = errObj;
      } else if (typeof json?.msg === 'string') {
        // Supabase gateway alt format: { msg: "..." }
        code = 'GATEWAY_ERROR';
        message = json.msg;
      } else if (typeof json?.message === 'string') {
        // Generic format: { message: "..." }
        code = 'GATEWAY_ERROR';
        message = json.message;
      } else {
        // Completely unknown shape — log for debugging
        console.warn('[api] Unrecognized error response:', res.status, JSON.stringify(json).slice(0, 200));
      }

      return {
        ok: false,
        error: { code, message, status: res.status },
      };
    }

    return { ok: true, data: json.data };
  } catch (e) {
    return {
      ok: false,
      error: {
        code: 'NETWORK_ERROR',
        message: e instanceof Error ? e.message : 'Network request failed',
        status: 0,
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Public API (token-based, no JWT required)
// ---------------------------------------------------------------------------

export function acceptInvitation(body: AcceptInvitationRequest) {
  return callEdge<AcceptInvitationResponse>('accept-invitation', {
    method: 'POST',
    body,
    requireAuth: false,
  });
}

export function claimResident(body: ClaimResidentRequest) {
  return callEdge<ClaimResidentResponse>('claim-resident', {
    method: 'POST',
    body,
    requireAuth: false,
  });
}

// ---------------------------------------------------------------------------
// Authenticated API (JWT required)
// ---------------------------------------------------------------------------

export function createTicket(body: CreateTicketRequest) {
  return callEdge<CreateTicketResponse>('create-ticket', {
    method: 'POST',
    body,
  });
}

export function updateTicket(body: UpdateTicketRequest) {
  return callEdge<UpdateTicketResponse>('update-ticket', {
    method: 'PATCH',
    body,
  });
}

export function getTicketComments(ticketId: string) {
  return callEdge<GetTicketCommentsResponse>('get-ticket-comments', {
    method: 'GET',
    params: { ticket_id: ticketId },
  });
}

export function createComment(body: CreateCommentRequest) {
  return callEdge<CreateCommentResponse>('create-comment', {
    method: 'POST',
    body,
  });
}

export function registerAttachment(body: RegisterAttachmentRequest) {
  return callEdge<RegisterAttachmentResponse>('register-attachment', {
    method: 'POST',
    body,
  });
}

export function deleteAttachment(body: DeleteAttachmentRequest) {
  return callEdge<DeleteAttachmentResponse>('delete-attachment', {
    method: 'POST',
    body,
  });
}

export function sendInvitation(body: SendInvitationRequest) {
  return callEdge<SendInvitationResponse>('send-invitation', {
    method: 'POST',
    body,
  });
}

export function resendInvitation(body: ResendInvitationRequest) {
  return callEdge<ResendInvitationResponse>('resend-invitation', {
    method: 'POST',
    body,
  });
}

export function updateOccupant(body: UpdateOccupantRequest) {
  return callEdge<UpdateOccupantResponse>('update-occupant', {
    method: 'POST',
    body,
  });
}
