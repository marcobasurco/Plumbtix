// =============================================================================
// PlumbTix — Building & Space Data Access
// =============================================================================
// READS:  PostgREST via User JWT + RLS (unchanged)
// WRITES: Edge functions for server-side validation + consistent pattern
//
// Edge function responses follow ApiResponse<T> shape:
//   Success: { ok: true,  data: T }
//   Error:   { ok: false, error: { code: string, message: string } }
// =============================================================================

import { supabase } from './supabaseClient';
import type { CommonAreaType } from '@shared/types/enums';

// ---------------------------------------------------------------------------
// Building types (unchanged)
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
// Edge function response types
// ---------------------------------------------------------------------------

interface ApiSuccess<T> {
  ok: true;
  data: T;
}

interface ApiError {
  ok: false;
  error: { code: string; message: string };
}

type ApiResponse<T> = ApiSuccess<T> | ApiError;

const EDGE_BASE = import.meta.env.VITE_EDGE_BASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Invoke an edge function and parse the ApiResponse<T> envelope.
 * Uses the same fetch pattern as api.ts (VITE_EDGE_BASE_URL + apikey header)
 * to match all other working edge function calls.
 */
async function invokeFunction<T>(
  name: string,
  body: Record<string, unknown>,
  method: 'POST' | 'PATCH' | 'DELETE' = 'POST',
): Promise<T> {
  // Get current session JWT
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Not logged in');
  }

  const res = await fetch(`${EDGE_BASE}/${name}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  });

  // Handle non-JSON responses (e.g., 404 HTML from gateway)
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error(`Edge function "${name}" returned ${res.status}: ${res.statusText}`);
  }

  const json = await res.json();

  // Log for debugging (visible in browser DevTools console)
  if (!res.ok) {
    console.error(`[invokeFunction] ${name} returned ${res.status}:`, json);
  }

  // Standard ApiResponse envelope: { ok: true, data } or { ok: false, error: { code, message } }
  if (json.ok === true) {
    return json.data as T;
  }

  // Our edge functions return { ok: false, error: { code, message } }
  if (json.ok === false && json.error?.message) {
    throw new Error(json.error.message);
  }

  // Supabase gateway / Deno boot errors return { msg: "..." } or { message: "..." }
  if (json.msg) {
    throw new Error(json.msg);
  }
  if (json.message) {
    throw new Error(json.message);
  }

  // Completely unexpected shape
  throw new Error(`Edge function "${name}" failed (HTTP ${res.status})`);
}

// ---------------------------------------------------------------------------
// Building READS (PostgREST + RLS — unchanged)
// ---------------------------------------------------------------------------

export async function fetchBuildingList(): Promise<BuildingListRow[]> {
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

// ---------------------------------------------------------------------------
// Building WRITES (via Edge Functions)
// ---------------------------------------------------------------------------

export async function createBuilding(companyId: string, form: BuildingFormData) {
  return invokeFunction<BuildingDetailRow>('create-building', {
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
  });
}

export async function updateBuilding(id: string, form: BuildingFormData) {
  return invokeFunction<BuildingDetailRow>('update-building', {
    id,
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
  });
}

export async function deleteBuilding(id: string) {
  return invokeFunction<{ deleted: true; id: string }>('delete-building', { id });
}

// ---------------------------------------------------------------------------
// Space types (unchanged)
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
// Space READS (PostgREST + RLS — unchanged)
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

// ---------------------------------------------------------------------------
// Space WRITES (via Edge Functions)
// ---------------------------------------------------------------------------

export async function createSpace(buildingId: string, form: SpaceFormData) {
  const body: Record<string, unknown> = {
    building_id: buildingId,
    space_type: form.space_type,
    floor: form.floor ? parseInt(form.floor) : null,
  };

  if (form.space_type === 'unit') {
    body.unit_number = form.unit_number.trim();
    body.common_area_type = null;
    body.bedrooms = form.bedrooms ? parseInt(form.bedrooms) : null;
    body.bathrooms = form.bathrooms ? parseFloat(form.bathrooms) : null;
  } else {
    body.unit_number = null;
    body.common_area_type = form.common_area_type || null;
    body.bedrooms = null;
    body.bathrooms = null;
  }

  return invokeFunction<SpaceRow>('create-space', body);
}

export async function updateSpace(id: string, form: SpaceFormData) {
  const body: Record<string, unknown> = {
    id,
    space_type: form.space_type,
    floor: form.floor ? parseInt(form.floor) : null,
  };

  if (form.space_type === 'unit') {
    body.unit_number = form.unit_number.trim();
    body.common_area_type = null;
    body.bedrooms = form.bedrooms ? parseInt(form.bedrooms) : null;
    body.bathrooms = form.bathrooms ? parseFloat(form.bathrooms) : null;
  } else {
    body.unit_number = null;
    body.common_area_type = form.common_area_type || null;
    body.bedrooms = null;
    body.bathrooms = null;
  }

  return invokeFunction<SpaceRow>('update-space', body);
}

export async function deleteSpace(id: string) {
  return invokeFunction<{ deleted: true; id: string }>('delete-space', { id });
}

// ---------------------------------------------------------------------------
// Occupant types & CRUD (reads via PostgREST, writes unchanged for now)
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
// Building Entitlement types & CRUD (unchanged — direct PostgREST)
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
// Error helper (unchanged)
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
