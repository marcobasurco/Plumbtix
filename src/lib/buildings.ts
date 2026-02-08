// =============================================================================
// PlumbTix — Building & Space Data Access (PostgREST via User JWT + RLS)
// =============================================================================
// All operations use the anon client with the user's JWT.
// RLS policies handle authorization:
//   proroto_admin: ALL on buildings/spaces
//   pm_admin:      ALL on own company buildings/spaces
//   pm_user:       SELECT only on entitled buildings/spaces
//   resident:      SELECT only on own building/space
// =============================================================================

import { supabase } from './supabaseClient';
import type { CommonAreaType } from '@shared/types/enums';

// ---------------------------------------------------------------------------
// Building types
// ---------------------------------------------------------------------------

export interface BuildingListRow {
  id: string;
  company_id: string;
  name: string | null;
  address_line1: string;
  city: string;
  state: string;
  zip: string;
  created_at: string;
  ticket_count: number;
  space_count: number;
}

export interface BuildingDetailRow {
  id: string;
  company_id: string;
  name: string | null;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  zip: string;
  gate_code: string | null;
  water_shutoff_location: string | null;
  gas_shutoff_location: string | null;
  onsite_contact_name: string | null;
  onsite_contact_phone: string | null;
  access_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface BuildingFormData {
  name: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  zip: string;
  gate_code: string;
  water_shutoff_location: string;
  gas_shutoff_location: string;
  onsite_contact_name: string;
  onsite_contact_phone: string;
  access_notes: string;
}

// ---------------------------------------------------------------------------
// Building CRUD
// ---------------------------------------------------------------------------

export async function fetchBuildingList(): Promise<BuildingListRow[]> {
  // Fetch buildings with aggregated counts via separate queries
  // (Supabase PostgREST doesn't support COUNT on related tables directly)
  const { data, error } = await supabase
    .from('buildings')
    .select('id, company_id, name, address_line1, city, state, zip, created_at')
    .order('address_line1');

  if (error) throw new Error(error.message);

  const buildings = (data ?? []) as Array<{
    id: string; company_id: string; name: string | null;
    address_line1: string; city: string; state: string; zip: string;
    created_at: string;
  }>;

  // Fetch space counts
  const { data: spaceCounts } = await supabase
    .from('spaces')
    .select('building_id');

  // Fetch ticket counts
  const { data: ticketCounts } = await supabase
    .from('tickets')
    .select('building_id');

  const spaceMap = new Map<string, number>();
  for (const s of spaceCounts ?? []) {
    spaceMap.set(s.building_id, (spaceMap.get(s.building_id) ?? 0) + 1);
  }

  const ticketMap = new Map<string, number>();
  for (const t of ticketCounts ?? []) {
    ticketMap.set(t.building_id, (ticketMap.get(t.building_id) ?? 0) + 1);
  }

  return buildings.map((b) => ({
    ...b,
    space_count: spaceMap.get(b.id) ?? 0,
    ticket_count: ticketMap.get(b.id) ?? 0,
  }));
}

export async function fetchBuildingDetail(id: string): Promise<BuildingDetailRow> {
  const { data, error } = await supabase
    .from('buildings')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);
  return data as BuildingDetailRow;
}

export async function createBuilding(companyId: string, form: BuildingFormData) {
  const { data, error } = await supabase
    .from('buildings')
    .insert({
      company_id: companyId,
      name: form.name.trim() || null,
      address_line1: form.address_line1.trim(),
      address_line2: form.address_line2.trim() || null,
      city: form.city.trim(),
      state: form.state.trim().toUpperCase(),
      zip: form.zip.trim(),
      gate_code: form.gate_code.trim() || null,
      water_shutoff_location: form.water_shutoff_location.trim() || null,
      gas_shutoff_location: form.gas_shutoff_location.trim() || null,
      onsite_contact_name: form.onsite_contact_name.trim() || null,
      onsite_contact_phone: form.onsite_contact_phone.trim() || null,
      access_notes: form.access_notes.trim() || null,
    })
    .select()
    .single();

  if (error) throw parseRLSError(error);
  return data as BuildingDetailRow;
}

export async function updateBuilding(id: string, form: BuildingFormData) {
  const { data, error } = await supabase
    .from('buildings')
    .update({
      name: form.name.trim() || null,
      address_line1: form.address_line1.trim(),
      address_line2: form.address_line2.trim() || null,
      city: form.city.trim(),
      state: form.state.trim().toUpperCase(),
      zip: form.zip.trim(),
      gate_code: form.gate_code.trim() || null,
      water_shutoff_location: form.water_shutoff_location.trim() || null,
      gas_shutoff_location: form.gas_shutoff_location.trim() || null,
      onsite_contact_name: form.onsite_contact_name.trim() || null,
      onsite_contact_phone: form.onsite_contact_phone.trim() || null,
      access_notes: form.access_notes.trim() || null,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw parseRLSError(error);
  return data as BuildingDetailRow;
}

export async function deleteBuilding(id: string) {
  const { error } = await supabase
    .from('buildings')
    .delete()
    .eq('id', id);

  if (error) throw parseRLSError(error);
}

// ---------------------------------------------------------------------------
// Space types
// ---------------------------------------------------------------------------

export interface SpaceRow {
  id: string;
  building_id: string;
  space_type: 'unit' | 'common_area';
  unit_number: string | null;
  common_area_type: CommonAreaType | null;
  floor: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  created_at: string;
}

export interface SpaceFormData {
  space_type: 'unit' | 'common_area';
  unit_number: string;
  common_area_type: CommonAreaType | '';
  floor: string;
  bedrooms: string;
  bathrooms: string;
}

// ---------------------------------------------------------------------------
// Space CRUD
// ---------------------------------------------------------------------------

export async function fetchSpaces(buildingId: string): Promise<SpaceRow[]> {
  const { data, error } = await supabase
    .from('spaces')
    .select('*')
    .eq('building_id', buildingId)
    .order('space_type')
    .order('unit_number', { ascending: true, nullsFirst: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as SpaceRow[];
}

export async function createSpace(buildingId: string, form: SpaceFormData) {
  const row: Record<string, unknown> = {
    building_id: buildingId,
    space_type: form.space_type,
    floor: form.floor ? parseInt(form.floor) : null,
  };

  if (form.space_type === 'unit') {
    row.unit_number = form.unit_number.trim();
    row.common_area_type = null;
    row.bedrooms = form.bedrooms ? parseInt(form.bedrooms) : null;
    row.bathrooms = form.bathrooms ? parseFloat(form.bathrooms) : null;
  } else {
    row.unit_number = null;
    row.common_area_type = form.common_area_type || null;
    row.bedrooms = null;
    row.bathrooms = null;
  }

  const { data, error } = await supabase
    .from('spaces')
    .insert(row)
    .select()
    .single();

  if (error) throw parseRLSError(error);
  return data as SpaceRow;
}

export async function updateSpace(id: string, form: SpaceFormData) {
  const row: Record<string, unknown> = {
    space_type: form.space_type,
    floor: form.floor ? parseInt(form.floor) : null,
  };

  if (form.space_type === 'unit') {
    row.unit_number = form.unit_number.trim();
    row.common_area_type = null;
    row.bedrooms = form.bedrooms ? parseInt(form.bedrooms) : null;
    row.bathrooms = form.bathrooms ? parseFloat(form.bathrooms) : null;
  } else {
    row.unit_number = null;
    row.common_area_type = form.common_area_type || null;
    row.bedrooms = null;
    row.bathrooms = null;
  }

  const { data, error } = await supabase
    .from('spaces')
    .update(row)
    .eq('id', id)
    .select()
    .single();

  if (error) throw parseRLSError(error);
  return data as SpaceRow;
}

export async function deleteSpace(id: string) {
  const { error } = await supabase
    .from('spaces')
    .delete()
    .eq('id', id);

  if (error) throw parseRLSError(error);
}

// ---------------------------------------------------------------------------
// Error helper
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Occupant types
// ---------------------------------------------------------------------------

export interface OccupantRow {
  id: string;
  space_id: string;
  user_id: string | null;
  occupant_type: 'homeowner' | 'tenant';
  name: string;
  email: string;
  phone: string | null;
  invite_token: string | null;
  invite_sent_at: string | null;
  claimed_at: string | null;
  created_at: string;
}

export interface OccupantFormData {
  occupant_type: 'homeowner' | 'tenant';
  name: string;
  email: string;
  phone: string;
}

// ---------------------------------------------------------------------------
// Occupant CRUD
// ---------------------------------------------------------------------------

export async function fetchOccupants(spaceId: string): Promise<OccupantRow[]> {
  const { data, error } = await supabase
    .from('occupants')
    .select('*')
    .eq('space_id', spaceId)
    .order('name');

  if (error) throw new Error(error.message);
  return (data ?? []) as OccupantRow[];
}

export async function fetchBuildingOccupants(buildingId: string): Promise<OccupantRow[]> {
  // Get all spaces for this building, then get occupants
  const { data: spaceData } = await supabase
    .from('spaces')
    .select('id')
    .eq('building_id', buildingId);

  if (!spaceData || spaceData.length === 0) return [];

  const spaceIds = spaceData.map((s) => s.id);
  const { data, error } = await supabase
    .from('occupants')
    .select('*')
    .in('space_id', spaceIds)
    .order('name');

  if (error) throw new Error(error.message);
  return (data ?? []) as OccupantRow[];
}

export async function createOccupant(spaceId: string, form: OccupantFormData): Promise<OccupantRow> {
  const inviteToken = crypto.randomUUID();

  const { data, error } = await supabase
    .from('occupants')
    .insert({
      space_id: spaceId,
      occupant_type: form.occupant_type,
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      phone: form.phone.trim() || null,
      invite_token: inviteToken,
    })
    .select()
    .single();

  if (error) throw parseRLSError(error);
  return data as OccupantRow;
}

export async function deleteOccupant(id: string): Promise<void> {
  const { error } = await supabase
    .from('occupants')
    .delete()
    .eq('id', id);

  if (error) throw parseRLSError(error);
}

// ---------------------------------------------------------------------------
// Building Entitlement types & CRUD
// ---------------------------------------------------------------------------

export interface EntitlementRow {
  id: string;
  user_id: string;
  building_id: string;
  created_at: string;
}

export async function fetchEntitlements(buildingId: string): Promise<EntitlementRow[]> {
  const { data, error } = await supabase
    .from('building_entitlements')
    .select('*')
    .eq('building_id', buildingId)
    .order('created_at');

  if (error) throw new Error(error.message);
  return (data ?? []) as EntitlementRow[];
}

export async function createEntitlement(buildingId: string, userId: string): Promise<EntitlementRow> {
  const { data, error } = await supabase
    .from('building_entitlements')
    .insert({ building_id: buildingId, user_id: userId })
    .select()
    .single();

  if (error) throw parseRLSError(error);
  return data as EntitlementRow;
}

export async function deleteEntitlement(id: string): Promise<void> {
  const { error } = await supabase
    .from('building_entitlements')
    .delete()
    .eq('id', id);

  if (error) throw parseRLSError(error);
}

// ---------------------------------------------------------------------------
// Error helper
// ---------------------------------------------------------------------------

function parseRLSError(error: { message: string; code?: string }): Error {
  if (error.code === '42501' || error.message.includes('policy')) {
    return new Error("You don't have permission to perform this action.");
  }
  if (error.code === '23503') {
    return new Error('Cannot delete: this record has dependent data (spaces, tickets, etc.).');
  }
  if (error.code === '23505') {
    return new Error('A record with this value already exists (duplicate).');
  }
  if (error.code === '23514') {
    return new Error('Invalid data: check constraint violated. Unit requires unit_number; common area requires type.');
  }
  return new Error(error.message);
}
