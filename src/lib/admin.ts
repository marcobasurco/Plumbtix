// =============================================================================
// PlumbTix — Admin Data Access (PostgREST via User JWT + RLS)
// =============================================================================
// proroto_admin has FOR ALL policies on companies, users, invitations.
// All queries use the anon client with the admin's JWT.
// =============================================================================

import { supabase } from './supabaseClient';
import type { UserRole } from '@shared/types/enums';

// ---------------------------------------------------------------------------
// Edge function caller (same pattern as buildings.ts)
// ---------------------------------------------------------------------------

const EDGE_BASE = import.meta.env.VITE_EDGE_BASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

async function invokeFunction<T>(
  name: string,
  body: Record<string, unknown>,
): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not logged in');

  const res = await fetch(`${EDGE_BASE}/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  });

  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error(`Edge function "${name}" returned ${res.status}: ${res.statusText}`);
  }

  const json = await res.json();
  if (!res.ok) console.error(`[invokeFunction] ${name} returned ${res.status}:`, json);

  if (json.ok === true) return json.data as T;
  if (json.ok === false && json.error?.message) throw new Error(json.error.message);
  if (json.msg) throw new Error(json.msg);
  if (json.message) throw new Error(json.message);
  throw new Error(`Edge function "${name}" failed (HTTP ${res.status})`);
}

// ---------------------------------------------------------------------------
// Companies
// ---------------------------------------------------------------------------

export interface CompanyListRow {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  building_count: number;
  user_count: number;
}

export async function fetchCompanyList(): Promise<CompanyListRow[]> {
  const { data, error } = await supabase
    .from('companies')
    .select('id, name, slug, created_at')
    .order('name');

  if (error) throw new Error(error.message);

  const companies = data ?? [];

  // Aggregate counts
  const { data: buildings } = await supabase
    .from('buildings')
    .select('company_id');

  const { data: users } = await supabase
    .from('users')
    .select('company_id');

  const bldgMap = new Map<string, number>();
  for (const b of buildings ?? []) {
    bldgMap.set(b.company_id, (bldgMap.get(b.company_id) ?? 0) + 1);
  }

  const userMap = new Map<string, number>();
  for (const u of users ?? []) {
    if (u.company_id) userMap.set(u.company_id, (userMap.get(u.company_id) ?? 0) + 1);
  }

  return companies.map((c) => ({
    ...c,
    building_count: bldgMap.get(c.id) ?? 0,
    user_count: userMap.get(c.id) ?? 0,
  }));
}

export interface CompanyDetailRow {
  id: string;
  name: string;
  slug: string;
  settings: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export async function createCompany(name: string, slug: string): Promise<CompanyListRow> {
  const data = await invokeFunction<CompanyListRow>('create-company', { name, slug });
  return { ...data, building_count: 0, user_count: 0 };
}

export async function updateCompany(id: string, fields: { name?: string; slug?: string }): Promise<CompanyDetailRow> {
  return invokeFunction<CompanyDetailRow>('update-company', { id, ...fields });
}

export async function fetchCompanyDetail(id: string): Promise<CompanyDetailRow> {
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);
  return data as CompanyDetailRow;
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export interface UserListRow {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: UserRole;
  company_id: string | null;
  created_at: string;
  company: { id: string; name: string } | null;
}

export async function fetchUserList(companyFilter?: string): Promise<UserListRow[]> {
  let query = supabase
    .from('users')
    .select('id, email, full_name, phone, role, company_id, created_at, company:companies(id, name)')
    .order('created_at', { ascending: false });

  if (companyFilter) {
    query = query.eq('company_id', companyFilter);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as UserListRow[];
}

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------

export interface InvitationRow {
  id: string;
  company_id: string;
  email: string;
  name: string;
  role: string;
  token: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
  company: { id: string; name: string } | null;
  invited_by: { id: string; full_name: string } | null;
}

export async function fetchInvitations(companyFilter?: string): Promise<InvitationRow[]> {
  let query = supabase
    .from('invitations')
    .select(`
      id, company_id, email, name, role, token, expires_at, accepted_at, created_at,
      company:companies(id, name),
      invited_by:users!invitations_invited_by_user_id_fkey(id, full_name)
    `)
    .order('created_at', { ascending: false });

  if (companyFilter) {
    query = query.eq('company_id', companyFilter);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as InvitationRow[];
}

// ---------------------------------------------------------------------------
// Company buildings (for company detail)
// ---------------------------------------------------------------------------

export interface CompanyBuildingRow {
  id: string;
  name: string | null;
  address_line1: string;
  city: string;
  state: string;
}

export async function fetchCompanyBuildings(companyId: string): Promise<CompanyBuildingRow[]> {
  const { data, error } = await supabase
    .from('buildings')
    .select('id, name, address_line1, city, state')
    .eq('company_id', companyId)
    .order('address_line1');

  if (error) throw new Error(error.message);
  return (data ?? []) as CompanyBuildingRow[];
}

// ---------------------------------------------------------------------------
// Company options (for dropdowns)
// ---------------------------------------------------------------------------

export interface CompanyOption {
  id: string;
  name: string;
}

export async function fetchCompanyOptions(): Promise<CompanyOption[]> {
  const { data, error } = await supabase
    .from('companies')
    .select('id, name')
    .order('name');

  if (error) return [];
  return (data ?? []) as CompanyOption[];
}
