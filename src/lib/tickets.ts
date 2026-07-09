// =============================================================================
// Work Orders — Ticket Data Access (PostgREST via Supabase Client)
// =============================================================================
// All reads use the user JWT → RLS scopes results per role.
//
// NEVER query ticket_comments here — migration 00006 revoked access.
// Comments go through Edge Functions only (see api.ts).
// =============================================================================

import { supabase } from './supabaseClient';
import type { TicketStatus, TicketSeverity } from '@shared/types/enums';

// ---------------------------------------------------------------------------
// Ticket list
// ---------------------------------------------------------------------------

export interface TicketListFilters {
  status?: TicketStatus | 'all' | 'open';
  severity?: TicketSeverity | 'all';
  building_id?: string;
  search?: string;
  date_from?: string;
  date_to?: string;
  priority?: string;
}

export interface TicketListRow {
  id: string;
  ticket_number: number;
  status: TicketStatus;
  severity: TicketSeverity;
  issue_type: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  building: {
    id: string;
    name: string | null;
    address_line1: string;
    city: string;
  };
  space: {
    id: string;
    space_type: string;
    unit_number: string | null;
    common_area_type: string | null;
    label: string | null;
  };
  created_by: {
    id: string;
    full_name: string;
  };
}

/** Default page size for the ticket list window */
export const TICKET_PAGE_SIZE = 50;

export interface TicketListPage {
  rows: TicketListRow[];
  /** Total matching tickets (before the limit) — from PostgREST exact count */
  count: number;
}

/**
 * Fetch tickets newest-first, limited to a window of `limit` rows.
 *
 * Pagination model: a GROWING WINDOW rather than discrete pages — callers
 * refetch rows 0..limit-1 with a larger limit to "load more". This keeps
 * realtime refreshes trivially correct (refetch same window) at the cost of
 * refetching earlier rows, which is fine at this data size.
 *
 * Why this exists: PostgREST caps responses at 1,000 rows (max_rows in
 * supabase config). Without an explicit limit, tickets beyond the cap
 * silently vanish from the list.
 */
export async function fetchTicketList(
  filters: TicketListFilters = {},
  limit: number = TICKET_PAGE_SIZE,
): Promise<TicketListPage> {
  let query = supabase
    .from('tickets')
    .select(`
      id,
      ticket_number,
      status,
      severity,
      issue_type,
      description,
      created_at,
      updated_at,
      building:buildings!inner(id, name, address_line1, city),
      space:spaces!inner(id, space_type, unit_number, common_area_type, label),
      created_by:users!tickets_created_by_user_id_fkey(id, full_name)
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false }) // tiebreaker: stable order for equal timestamps
    .range(0, limit - 1);

  if (filters.status && filters.status !== 'all') {
    if (filters.status === 'open') {
      query = query.not('status', 'in', '("completed","invoiced","cancelled")');
    } else {
      query = query.eq('status', filters.status);
    }
  }
  if (filters.severity && filters.severity !== 'all') {
    query = query.eq('severity', filters.severity);
  }
  if (filters.building_id) {
    query = query.eq('building_id', filters.building_id);
  }
  if (filters.search) {
    const searchTerm = filters.search.trim();
    const ticketNum = parseInt(searchTerm);
    if (ticketNum && ticketNum.toString() === searchTerm) {
      // Exact ticket number match
      query = query.eq('ticket_number', ticketNum);
    } else {
      // Full-text search using tsvector
      const tsQuery = searchTerm.split(/\s+/).filter(Boolean).join(' & ');
      query = query.or(
        `search_vector.fts.${tsQuery},description.ilike.%${searchTerm}%`,
      );
    }
  }
  if (filters.date_from) {
    query = query.gte('created_at', filters.date_from);
  }
  if (filters.date_to) {
    query = query.lte('created_at', filters.date_to + 'T23:59:59Z');
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('[tickets] List fetch failed:', error.message);
    throw new Error(error.message);
  }

  return {
    rows: (data ?? []) as unknown as TicketListRow[],
    count: count ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Ticket detail
// ---------------------------------------------------------------------------

export interface TicketDetailRow {
  id: string;
  ticket_number: number;
  status: TicketStatus;
  severity: TicketSeverity;
  issue_type: string;
  description: string | null;
  access_instructions: string | null;
  scheduling_preference: Record<string, unknown> | null;
  assigned_technician: string | null;
  scheduled_date: string | null;
  scheduled_time_window: string | null;
  quote_amount: number | null;
  invoice_number: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  public_token: string | null;   // migration 00021 — random share token
  public_enabled: boolean;       // migration 00021 — public view on/off
  technician_id: string | null;  // migration 00023 — roster FK
  building: {
    id: string;
    name: string | null;
    address_line1: string;
    address_line2: string | null;
    city: string;
    state: string;
    zip: string;
    gate_code: string | null;
    onsite_contact_name: string | null;
    onsite_contact_phone: string | null;
    company: {
      id: string;
      name: string;
      logo_url: string | null;
    } | null;
  };
  space: {
    id: string;
    space_type: string;
    unit_number: string | null;
    common_area_type: string | null;
    label: string | null;
    floor: number | null;
  };
  created_by: {
    id: string;
    full_name: string;
    email: string;
    phone: string | null;
  };
}

export async function fetchTicketDetail(ticketId: string) {
  const { data, error } = await supabase
    .from('tickets')
    .select(`
      *,
      building:buildings!inner(
        id, name, address_line1, address_line2, city, state, zip,
        gate_code, onsite_contact_name, onsite_contact_phone,
        company:companies(id, name, logo_url)
      ),
      space:spaces!inner(id, space_type, unit_number, common_area_type, label, floor),
      created_by:users!tickets_created_by_user_id_fkey(id, full_name, email, phone)
    `)
    .eq('id', ticketId)
    .single();

  if (error) {
    console.error('[tickets] Detail fetch failed:', error.message);
    throw new Error(error.message);
  }

  return data as unknown as TicketDetailRow;
}

// ---------------------------------------------------------------------------
// Status log
// ---------------------------------------------------------------------------

export interface StatusLogRow {
  id: string;
  old_status: TicketStatus | null;
  new_status: TicketStatus;
  notes: string | null;
  created_at: string;
  changed_by: {
    id: string;
    full_name: string;
  } | null;
}

export async function fetchStatusLog(ticketId: string) {
  const { data, error } = await supabase
    .from('ticket_status_log')
    .select(`
      id,
      old_status,
      new_status,
      notes,
      created_at,
      changed_by:users!ticket_status_log_changed_by_user_id_fkey(id, full_name)
    `)
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[tickets] Status log fetch failed:', error.message);
    throw new Error(error.message);
  }

  return (data ?? []) as unknown as StatusLogRow[];
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

export interface AttachmentRow {
  id: string;
  file_path: string;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
  created_at: string;
  uploaded_by: {
    id: string;
    full_name: string;
  } | null;
}

export async function fetchAttachments(ticketId: string) {
  // NOTE: We intentionally omit the uploaded_by JOIN here.
  // Residents can only SELECT their own row from `users`, so a JOIN to
  // users!ticket_attachments_uploaded_by_user_id_fkey will fail or return
  // null for attachments uploaded by other roles. Fetching uploader info
  // separately (if needed) avoids breaking the entire query.
  const { data, error } = await supabase
    .from('ticket_attachments')
    .select(`
      id,
      file_path,
      file_name,
      file_type,
      file_size,
      created_at
    `)
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[tickets] Attachments fetch failed:', error.message);
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => ({
    ...row,
    uploaded_by: null,
  })) as AttachmentRow[];
}

/**
 * Get a signed download URL for an attachment in the ticket-attachments bucket.
 * Expires in 5 minutes.
 */
export async function getAttachmentUrl(filePath: string): Promise<string | null> {
  const { data, error } = await supabase
    .storage
    .from('ticket-attachments')
    .createSignedUrl(filePath, 300); // 5 min

  if (error) {
    console.error('[tickets] Signed URL failed:', error.message);
    return null;
  }

  return data.signedUrl;
}

// ---------------------------------------------------------------------------
// Buildings list (for filter dropdowns)
// ---------------------------------------------------------------------------

export interface BuildingOption {
  id: string;
  name: string | null;
  address_line1: string;
  city: string;
}

export async function fetchBuildingOptions() {
  const { data, error } = await supabase
    .from('buildings')
    .select('id, name, address_line1, city')
    .order('address_line1');

  if (error) {
    console.error('[tickets] Buildings fetch failed:', error.message);
    return [];
  }

  return (data ?? []) as BuildingOption[];
}

// ---------------------------------------------------------------------------
// Spaces for a building (wizard step 2)
// ---------------------------------------------------------------------------

export interface SpaceOption {
  id: string;
  space_type: string;
  unit_number: string | null;
  common_area_type: string | null;
  label: string | null;
  floor: number | null;
}

export async function fetchSpacesForBuilding(buildingId: string) {
  const { data, error } = await supabase
    .from('spaces')
    .select('id, space_type, unit_number, common_area_type, label, floor')
    .eq('building_id', buildingId)
    .order('unit_number', { ascending: true, nullsFirst: false });

  if (error) {
    console.error('[tickets] Spaces fetch failed:', error.message);
    return [];
  }

  return (data ?? []) as SpaceOption[];
}

// ---------------------------------------------------------------------------
// File upload constants (must match Section 6 storage bucket limits)
// ---------------------------------------------------------------------------

export const ALLOWED_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif',
  'application/pdf',
  'video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo', 'video/x-matroska',
] as const;
