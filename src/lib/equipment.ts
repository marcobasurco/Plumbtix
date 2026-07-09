import { supabase } from './supabaseClient';

export interface EquipmentRow {
  id: string; category: string; name: string;
  manufacturer: string | null; model: string | null; serial_number: string | null;
  spec: string | null; notes: string | null;
  space: { id: string; label: string | null; common_area_type: string | null; unit_number: string | null };
}

export async function fetchBuildingEquipment(buildingId: string): Promise<EquipmentRow[]> {
  const { data, error } = await supabase
    .from('equipment')
    .select('id, category, name, manufacturer, model, serial_number, spec, notes, space:spaces!inner(id, building_id, label, common_area_type, unit_number)')
    .eq('space.building_id', buildingId)
    .order('category');
  if (error) { console.error('[equipment]', error.message); return []; }
  return (data ?? []) as unknown as EquipmentRow[];
}


// ─────────────────────────────────────────────────────────────────────────
// Import support: fetch all equipment for a set of buildings (for sync dedup)
// ─────────────────────────────────────────────────────────────────────────
export interface EquipmentSyncRow {
  id: string; space_id: string; category: string; name: string;
  manufacturer: string | null; model: string | null; serial_number: string | null;
  spec: string | null; notes: string | null;
}

export async function fetchAllEquipment(): Promise<EquipmentSyncRow[]> {
  const PAGE = 1000;
  const out: EquipmentSyncRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('equipment')
      .select('id, space_id, category, name, manufacturer, model, serial_number, spec, notes')
      .order('id').range(from, from + PAGE - 1);
    if (error) { console.error('[equipment] fetchAll:', error.message); break; }
    out.push(...(data ?? []));
    if ((data ?? []).length < PAGE) break;
  }
  return out;
}

export interface EquipmentFormData {
  space_id: string; category: string; name: string;
  manufacturer?: string; model?: string; serial_number?: string; spec?: string; notes?: string;
}

export async function createEquipment(form: EquipmentFormData) {
  const { error } = await supabase.from('equipment').insert({
    space_id: form.space_id, category: form.category.trim(), name: form.name.trim(),
    manufacturer: form.manufacturer?.trim() || null, model: form.model?.trim() || null,
    serial_number: form.serial_number?.trim() || null, spec: form.spec?.trim() || null,
    notes: form.notes?.trim() || null,
  });
  if (error) throw new Error(error.message);
}

export async function updateEquipment(id: string, patch: Partial<EquipmentFormData>) {
  const body: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.category !== undefined) body.category = patch.category.trim();
  if (patch.name !== undefined) body.name = patch.name.trim();
  if (patch.manufacturer !== undefined) body.manufacturer = patch.manufacturer.trim() || null;
  if (patch.model !== undefined) body.model = patch.model.trim() || null;
  if (patch.serial_number !== undefined) body.serial_number = patch.serial_number.trim() || null;
  if (patch.spec !== undefined) body.spec = patch.spec.trim() || null;
  if (patch.notes !== undefined) body.notes = patch.notes.trim() || null;
  const { error } = await supabase.from('equipment').update(body).eq('id', id);
  if (error) throw new Error(error.message);
}

// Equipment belonging to a single space (common-area asset list)
export async function fetchSpaceEquipment(spaceId: string): Promise<EquipmentSyncRow[]> {
  const { data, error } = await supabase
    .from('equipment')
    .select('id, space_id, category, name, manufacturer, model, serial_number, spec, notes')
    .eq('space_id', spaceId)
    .order('name');
  if (error) { console.error('[equipment] fetchSpace:', error.message); return []; }
  return (data ?? []) as EquipmentSyncRow[];
}
