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
