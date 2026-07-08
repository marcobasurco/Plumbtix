// =============================================================================
// Work Orders — Technicians Data Access (PostgREST via Supabase Client)
// =============================================================================
// Pro Roto field crew roster (migration 00023).
// Reads: proroto_admin + pm_admin + pm_user (RLS). Writes: proroto_admin only.
// =============================================================================

import { supabase } from './supabaseClient';
import type { Technician } from '@shared/types/database';

export interface TechnicianFormData {
  name: string;
  phone?: string | null;
  email?: string | null;
}

/** Fetch roster, active-only by default (for assignment dropdowns). */
export async function fetchTechnicians(activeOnly = true): Promise<Technician[]> {
  let query = supabase
    .from('technicians')
    .select('*')
    .order('name', { ascending: true });

  if (activeOnly) query = query.eq('active', true);

  const { data, error } = await query;
  if (error) {
    console.error('[technicians] Fetch failed:', error.message);
    throw new Error(error.message);
  }
  return (data ?? []) as Technician[];
}

/** Create a roster entry (proroto_admin only, enforced by RLS). */
export async function createTechnician(form: TechnicianFormData): Promise<Technician> {
  const { data, error } = await supabase
    .from('technicians')
    .insert({
      name: form.name.trim(),
      phone: form.phone?.trim() || null,
      email: form.email?.trim() || null,
    })
    .select()
    .single();

  if (error) {
    // 23505 = unique violation on lower(trim(name))
    if (error.code === '23505') {
      throw new Error(`A technician named "${form.name.trim()}" already exists.`);
    }
    console.error('[technicians] Create failed:', error.message);
    throw new Error(error.message);
  }
  return data as Technician;
}

/** Update roster entry fields (proroto_admin only, enforced by RLS). */
export async function updateTechnician(
  id: string,
  updates: Partial<TechnicianFormData> & { active?: boolean },
): Promise<Technician> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.name !== undefined) payload.name = updates.name.trim();
  if (updates.phone !== undefined) payload.phone = updates.phone?.trim() || null;
  if (updates.email !== undefined) payload.email = updates.email?.trim() || null;
  if (updates.active !== undefined) payload.active = updates.active;

  const { data, error } = await supabase
    .from('technicians')
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error('A technician with that name already exists.');
    }
    console.error('[technicians] Update failed:', error.message);
    throw new Error(error.message);
  }
  return data as Technician;
}
