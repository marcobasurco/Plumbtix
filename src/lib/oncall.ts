// =============================================================================
// On-call roster — who gets paged, in what order, while an emergency is
// unacknowledged (migration 00030). Pro Roto admins only (RLS).
// =============================================================================

import { supabase } from './supabaseClient';

export interface OnCallRow {
  id: string;
  user_id: string;
  position: number;
  wait_minutes: number;
  active: boolean;
  user: { id: string; full_name: string; email: string; phone: string | null } | null;
}

export async function fetchOnCallRoster(): Promise<OnCallRow[]> {
  const { data, error } = await supabase
    .from('on_call_roster')
    .select('id, user_id, position, wait_minutes, active, user:users(id, full_name, email, phone)')
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as OnCallRow[];
}

export async function addToOnCall(userId: string, position: number): Promise<void> {
  const { error } = await supabase.from('on_call_roster').insert({ user_id: userId, position });
  if (error) throw new Error(error.message);
}

export async function updateOnCall(id: string, patch: Partial<Pick<OnCallRow, 'position' | 'wait_minutes' | 'active'>>): Promise<void> {
  const { error } = await supabase.from('on_call_roster').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function removeFromOnCall(id: string): Promise<void> {
  const { error } = await supabase.from('on_call_roster').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** Pro Roto admins who could be on call. */
export async function fetchProRotoAdmins(): Promise<Array<{ id: string; full_name: string; email: string; phone: string | null }>> {
  const { data, error } = await supabase
    .from('users')
    .select('id, full_name, email, phone')
    .eq('role', 'proroto_admin')
    .order('full_name');
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Emergencies currently unacknowledged — for the on-call page header. */
export async function fetchUnacknowledgedEmergencies(): Promise<Array<{ id: string; ticket_number: number; created_at: string; escalation_step: number; escalation_exhausted_at: string | null; building: { name: string | null; address_line1: string } | null }>> {
  const { data, error } = await supabase
    .from('tickets')
    .select('id, ticket_number, created_at, escalation_step, escalation_exhausted_at, building:buildings(name, address_line1)')
    .eq('severity', 'emergency')
    .is('acknowledged_at', null)
    .not('status', 'in', '("completed","invoiced","cancelled")')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Array<{ id: string; ticket_number: number; created_at: string; escalation_step: number; escalation_exhausted_at: string | null; building: { name: string | null; address_line1: string } | null }>;
}
