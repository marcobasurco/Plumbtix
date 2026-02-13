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

if (!EDGE_BASE) {
  throw new Error('Missing VITE_EDGE_BASE_URL in environment');
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

// ---------------------------------------------------------------------------
// JWT token management
// ---------------------------------------------------------------------------

/** Decode the `exp` claim from a JWT without a library. Returns epoch seconds or null. */
function getJwtExp(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof decoded.exp === 'number' ? decoded.exp : null;
  } catch {
    return null;
  }
}

/** Refresh buffer: refresh if token expires within this many seconds. */
const REFRESH_BUFFER_S = 120; // 2 minutes

/**
 * Get a valid access token, refreshing proactively if the JWT is expired
 * or about to expire. Returns null if no valid session can be obtained.
 */
async function getValidAccessToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();

  if (session?.access_token) {
    const exp = getJwtExp(session.access_token);
    const now = Math.floor(Date.now() / 1000);

    // Token is still fresh — use it
    if (exp && exp - now > REFRESH_BUFFER_S) {
      return session.access_token;
    }

    // Token expired or expiring soon — force refresh
    console.log('[api] JWT expired or expiring in <%ds, refreshing', REFRESH_BUFFER_S);
  }

  // No cached session or token is stale — try refreshing
  const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
  if (refreshErr) {
    console.warn('[api] refreshSession failed:', refreshErr.message);
  }
  return refreshData?.session?.access_token ?? null;
}

// ---------------------------------------------------------------------------
// Core fetch helper
// ---------------------------------------------------------------------------

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
    // Get a valid access token, refreshing proactively if needed.
    // getSession() returns CACHED data — the JWT may already be invalid
    // server-side even if the cache looks fresh. Decode the actual exp claim.
    const token = await getValidAccessToken();
    if (!token) {
      // No recoverable session — redirect to login
      await supabase.auth.signOut().catch(() => {});
      window.location.replace('/login');
      return new Promise<never>(() => {});
    }
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    let res = await fetch(url.toString(), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    // If 401 despite proactive refresh, try one final forced refresh + retry
    if (res.status === 401 && requireAuth) {
      console.warn('[api] Got 401 from server, forcing session refresh');
      const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
      const freshToken = refreshData?.session?.access_token;

      if (!freshToken) {
        // Refresh token is dead — session truly expired, redirect to login
        console.error('[api] refreshSession failed, signing out:', refreshErr?.message);
        await supabase.auth.signOut().catch(() => {});
        window.location.replace('/login');
        return new Promise<never>(() => {});
      }

      // Refresh succeeded — retry with fresh token
      headers['Authorization'] = `Bearer ${freshToken}`;
      res = await fetch(url.toString(), {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      // If STILL 401 after a successful refresh, the session is unrecoverable
      // (user deleted, banned, JWT secret rotated, etc.) — redirect to login
      if (res.status === 401) {
        console.error('[api] Still 401 after refresh, signing out');
        await supabase.auth.signOut().catch(() => {});
        window.location.replace('/login');
        return new Promise<never>(() => {});
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
