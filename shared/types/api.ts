// =============================================================================
// PlumbTix — API Request & Response Types
// =============================================================================
// Contracts for all Edge Function endpoints.
// Edge Functions validate with Zod; frontend uses for type-safe calls.
// =============================================================================

import type {
  IssueType,
  TicketSeverity,
  TicketStatus,
  InvitationRole,
} from './enums';
import type {
  Ticket,
  TicketComment,
  TicketCommentWithAuthor,
  TicketAttachment,
  User,
  Invitation,
  SchedulingPreference,
} from './database';

// --- POST /functions/v1/accept-invitation ---
export interface AcceptInvitationRequest {
  token: string;
  email: string;
  password: string;
  full_name: string;
  phone?: string;
}
export interface AcceptInvitationResponse {
  user: User;
  session: { access_token: string; refresh_token: string };
}

// --- POST /functions/v1/claim-resident ---
export interface ClaimResidentRequest {
  invite_token: string;
  email: string;
  password: string;
}
export interface ClaimResidentResponse {
  user: User;
  session: { access_token: string; refresh_token: string };
}

// --- POST /functions/v1/create-ticket ---
export interface CreateTicketRequest {
  building_id: string;
  space_id: string;
  issue_type: IssueType;
  severity: TicketSeverity;
  description: string;
  access_instructions?: string;
  scheduling_preference?: SchedulingPreference;
}
export interface CreateTicketResponse {
  ticket: Ticket;
  severity_escalated: boolean;
}

// --- PATCH /functions/v1/update-ticket ---
export interface UpdateTicketRequest {
  ticket_id: string;
  status?: TicketStatus;
  assigned_technician?: string;
  scheduled_date?: string;
  scheduled_time_window?: string;
  quote_amount?: number;
  invoice_number?: string;
  decline_reason?: string;  // required when PM declines waiting_approval → cancelled
}
export interface UpdateTicketResponse {
  ticket: Ticket;
}

// --- GET /functions/v1/get-ticket-comments?ticket_id=UUID ---
export interface GetTicketCommentsRequest {
  ticket_id: string;
}
export interface GetTicketCommentsResponse {
  comments: TicketCommentWithAuthor[];
}

// --- POST /functions/v1/create-comment ---
export interface CreateCommentRequest {
  ticket_id: string;
  comment_text: string;
  is_internal?: boolean;  // only proroto_admin may set true; 403 if non-admin sends true
}
export interface CreateCommentResponse {
  comment: TicketComment;
}

// --- POST /functions/v1/register-attachment ---
export interface RegisterAttachmentRequest {
  ticket_id: string;
  file_path: string;
  file_name: string;
  file_type: string;
  file_size: number;
}
export interface RegisterAttachmentResponse {
  attachment: TicketAttachment;
}

// --- POST /functions/v1/send-invitation ---
export interface SendInvitationRequest {
  company_id: string;
  email: string;
  name: string;
  role: InvitationRole;
}
export interface SendInvitationResponse {
  invitation: Invitation;
}

// =============================================================================
// Generic wrapper
// =============================================================================

export interface ApiSuccessResponse<T> {
  ok: true;
  data: T;
}
export interface ApiErrorResponse {
  ok: false;
  error: { code: string; message: string; details?: Record<string, unknown> };
}
export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;
