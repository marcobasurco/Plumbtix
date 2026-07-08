// =============================================================================
// Work Orders — Ticket Audit Trail Data Access (migration 00024)
// =============================================================================
// Reads the trigger-written field-change history for one ticket.
// RLS restricts SELECT to proroto_admin; other roles get empty results.
// =============================================================================

import { supabase } from './supabaseClient';

export interface TicketAuditRow {
  id: string;
  ticket_id: string;
  changed_by: string | null;   // NULL = service-role write → "System"
  changed_at: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  /** Resolved client-side from public.users */
  changed_by_name: string | null;
}

export async function fetchTicketAudit(ticketId: string): Promise<TicketAuditRow[]> {
  const { data, error } = await supabase
    .from('ticket_audit_log')
    .select('id, ticket_id, changed_by, changed_at, field, old_value, new_value')
    .eq('ticket_id', ticketId)
    .order('changed_at', { ascending: false })
    .limit(200);

  if (error) {
    console.error('[audit] Fetch failed:', error.message);
    throw new Error(error.message);
  }

  const rows = data ?? [];
  if (rows.length === 0) return [];

  // Resolve actor names (proroto_admin can read all users via RLS)
  const actorIds = [...new Set(rows.map((r) => r.changed_by).filter(Boolean))] as string[];
  const nameMap = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: users } = await supabase
      .from('users')
      .select('id, full_name')
      .in('id', actorIds);
    for (const u of users ?? []) nameMap.set(u.id, u.full_name);
  }

  return rows.map((r) => ({
    ...r,
    changed_by_name: r.changed_by ? (nameMap.get(r.changed_by) ?? 'Unknown user') : null,
  }));
}
