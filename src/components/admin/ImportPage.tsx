// =============================================================================
// Work Orders — Excel Sync Import (Pro Roto Admin Only)
// =============================================================================
// Upload an Excel file to bulk-import OR sync data.
// SYNC: matches existing records by natural keys,
//   updates changed fields, creates new records, never duplicates.
// Uses SheetJS (xlsx) for client-side parsing.
// =============================================================================

import { useState, useRef, useCallback, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabaseClient';
import { createCompany, updateCompany, fetchCompanyList, type CompanyListRow } from '@/lib/admin';
import { createBuilding, updateBuilding, createSpace, updateSpace, fetchBuildingOccupants, createOccupant } from '@/lib/buildings';
import type { BuildingFormData, SpaceFormData, OccupantFormData } from '@/lib/buildings';
import { sendInvitation } from '@/lib/api';
import { PageTransition } from '@/components/PageTransition';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Upload, FileSpreadsheet, Download, ChevronLeft, Loader2,
  CheckCircle2, XCircle, AlertTriangle, Building2, Users2,
  Briefcase, Home, RefreshCw, UserRound,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ImportType = 'companies' | 'buildings' | 'units' | 'occupants' | 'users';

interface ImportTab {
  key: ImportType;
  label: string;
  icon: React.ReactNode;
  description: string;
  matchKey: string;
  requiredColumns: string[];
  optionalColumns: string[];
}

interface RowResult {
  row: number;
  status: 'created' | 'updated' | 'unchanged' | 'error' | 'skipped';
  message: string;
}

const TABS: ImportTab[] = [
  {
    key: 'companies',
    label: 'Companies',
    icon: <Briefcase className="h-4 w-4" />,
    description: 'Sync property management companies',
    matchKey: 'Matched by name',
    requiredColumns: ['name'],
    optionalColumns: ['slug'],
  },
  {
    key: 'buildings',
    label: 'Buildings',
    icon: <Building2 className="h-4 w-4" />,
    description: 'Sync buildings with addresses',
    matchKey: 'Matched by company + address',
    requiredColumns: ['company_name', 'address', 'city', 'state', 'zip'],
    optionalColumns: ['building_name', 'gate_code', 'onsite_contact_name', 'onsite_contact_phone', 'water_shutoff', 'gas_shutoff', 'access_notes'],
  },
  {
    key: 'units',
    label: 'Units',
    icon: <Home className="h-4 w-4" />,
    description: 'Sync units for existing buildings',
    matchKey: 'Matched by building + unit number',
    requiredColumns: ['building_address', 'unit_number'],
    optionalColumns: ['floor', 'bedrooms', 'bathrooms'],
  },
  {
    key: 'occupants',
    label: 'Occupants',
    icon: <UserRound className="h-4 w-4" />,
    description: 'Sync tenants & homeowners (name, phone, etc.)',
    matchKey: 'Matched by building + unit + email',
    requiredColumns: ['building_address', 'unit_number', 'name', 'email'],
    optionalColumns: ['phone', 'type'],
  },
  {
    key: 'users',
    label: 'Users',
    icon: <Users2 className="h-4 w-4" />,
    description: 'Sync PM staff (invites new, updates existing)',
    matchKey: 'Matched by email',
    requiredColumns: ['company_name', 'name', 'email', 'role'],
    optionalColumns: ['phone'],
  },
];

const STATUS_ICON: Record<RowResult['status'], React.ReactNode> = {
  created: <CheckCircle2 className="h-3 w-3 text-green-500" />,
  updated: <RefreshCw className="h-3 w-3 text-blue-500" />,
  unchanged: <CheckCircle2 className="h-3 w-3 text-muted-foreground" />,
  error: <XCircle className="h-3 w-3 text-destructive" />,
  skipped: <AlertTriangle className="h-3 w-3 text-amber-500" />,
};

const STATUS_COLOR: Record<RowResult['status'], string> = {
  created: 'text-green-600',
  updated: 'text-blue-600',
  unchanged: 'text-muted-foreground',
  error: 'text-destructive',
  skipped: 'text-amber-600',
};

// ---------------------------------------------------------------------------
// Template generation
// ---------------------------------------------------------------------------

function generateTemplate(type: ImportType) {
  const wb = XLSX.utils.book_new();
  const tab = TABS.find((t) => t.key === type)!;
  const headers = [...tab.requiredColumns, ...tab.optionalColumns];

  const examples: Record<ImportType, Record<string, string>[]> = {
    companies: [
      { name: 'Acme Property Management', slug: 'acme-property' },
      { name: 'Bay Area Realty', slug: 'bay-area-realty' },
    ],
    buildings: [
      { company_name: 'Acme Property Management', address: '123 Main St', city: 'San Francisco', state: 'CA', zip: '94102', building_name: 'Main Tower', gate_code: '1234', onsite_contact_name: 'John Doe', onsite_contact_phone: '415-555-0100', water_shutoff: 'Basement left wall', gas_shutoff: 'Utility room', access_notes: 'Key under mat' },
      { company_name: 'Acme Property Management', address: '456 Oak Ave', city: 'Oakland', state: 'CA', zip: '94612', building_name: 'Oak Residences' },
    ],
    units: [
      { building_address: '123 Main St', unit_number: '101', floor: '1', bedrooms: '2', bathrooms: '1' },
      { building_address: '123 Main St', unit_number: '102', floor: '1', bedrooms: '1', bathrooms: '1' },
      { building_address: '123 Main St', unit_number: '201', floor: '2', bedrooms: '3', bathrooms: '2' },
    ],
    occupants: [
      { building_address: '123 Main St', unit_number: '101', name: 'Alice Johnson', email: 'alice@email.com', phone: '415-555-1010', type: 'tenant' },
      { building_address: '123 Main St', unit_number: '102', name: 'Bob Williams', email: 'bob@email.com', phone: '415-555-1020', type: 'homeowner' },
    ],
    users: [
      { company_name: 'Acme Property Management', name: 'Jane Smith', email: 'jane@acme.com', role: 'pm_admin', phone: '415-555-2000' },
      { company_name: 'Acme Property Management', name: 'Bob Jones', email: 'bob@acme.com', role: 'pm_user', phone: '' },
    ],
  };

  const ws = XLSX.utils.json_to_sheet(examples[type], { header: headers });
  ws['!cols'] = headers.map((h) => ({ wch: Math.max(h.length + 4, 18) }));
  XLSX.utils.book_append_sheet(wb, ws, type.charAt(0).toUpperCase() + type.slice(1));
  XLSX.writeFile(wb, `work-orders-${type}-template.xlsx`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeHeader(h: string): string {
  return h.toLowerCase().trim().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function looseMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? '').toLowerCase().trim() === (b ?? '').toLowerCase().trim();
}

/** Compare selected fields — returns list of field names that differ. */
function changedFields(existing: Record<string, unknown>, incoming: Record<string, unknown>, keys: string[]): string[] {
  const out: string[] = [];
  for (const k of keys) {
    const ev = String(existing[k] ?? '').trim();
    const iv = String(incoming[k] ?? '').trim();
    // Only flag a change when the incoming value is non-empty and different
    if (iv !== '' && ev !== iv) out.push(k);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Lookup types
// ---------------------------------------------------------------------------

type BuildingFull = {
  id: string; company_id: string; name: string | null;
  address_line1: string; address_line2: string | null;
  city: string; state: string; zip: string;
  gate_code: string | null; onsite_contact_name: string | null;
  onsite_contact_phone: string | null;
  water_shutoff_location: string | null; gas_shutoff_location: string | null;
  access_notes: string | null;
};

type SpaceFull = {
  id: string; building_id: string; space_type: string;
  unit_number: string | null; floor: number | null;
  bedrooms: number | null; bathrooms: number | null;
};

type UserFull = {
  id: string; email: string; full_name: string;
  phone: string | null; role: string; company_id: string | null;
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ImportPage() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<ImportType>('companies');
  const [fileName, setFileName] = useState<string | null>(null);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [headerMap, setHeaderMap] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<RowResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const tab = TABS.find((t) => t.key === activeTab)!;

  // ── File parsing ──
  const handleFile = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null); setResults(null); setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
        if (json.length === 0) { setError('Spreadsheet is empty'); return; }

        const rawHeaders = Object.keys(json[0]);
        const hMap: Record<string, string> = {};
        for (const h of rawHeaders) hMap[normalizeHeader(h)] = h;
        setHeaderMap(hMap);

        setRawRows(json.map((row) => {
          const clean: Record<string, string> = {};
          for (const [key, val] of Object.entries(row))
            clean[normalizeHeader(key)] = String(val ?? '').trim();
          return clean;
        }));
      } catch { setError('Failed to parse file. Upload a valid .xlsx or .csv.'); }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const normalizedHeaders = Object.keys(headerMap);
  const missingRequired = tab.requiredColumns.filter((c) => !normalizedHeaders.includes(c));
  const matchedRequired = tab.requiredColumns.filter((c) => normalizedHeaders.includes(c));
  const matchedOptional = tab.optionalColumns.filter((c) => normalizedHeaders.includes(c));
  const isReady = rawRows.length > 0 && missingRequired.length === 0;

  // ══════════════════════════════════════════════════════════════════════════
  // SYNC — the core logic
  // ══════════════════════════════════════════════════════════════════════════
  const handleSync = async () => {
    if (!isReady) return;
    setImporting(true); setResults(null); setError(null); setProgress(0);

    const rowResults: RowResult[] = [];

    try {
      // ─── Pre-fetch all lookups once ───
      const companies: CompanyListRow[] = await fetchCompanyList();

      let allBuildings: BuildingFull[] = [];
      if (['buildings', 'units', 'occupants'].includes(activeTab)) {
        const { data } = await supabase.from('buildings')
          .select('id, company_id, name, address_line1, address_line2, city, state, zip, gate_code, onsite_contact_name, onsite_contact_phone, water_shutoff_location, gas_shutoff_location, access_notes')
          .order('address_line1');
        allBuildings = (data ?? []) as BuildingFull[];
      }

      let allSpaces: SpaceFull[] = [];
      if (['units', 'occupants'].includes(activeTab)) {
        const { data } = await supabase.from('spaces')
          .select('id, building_id, space_type, unit_number, floor, bedrooms, bathrooms')
          .eq('space_type', 'unit').order('unit_number');
        allSpaces = (data ?? []) as SpaceFull[];
      }

      let allUsers: UserFull[] = [];
      if (activeTab === 'users') {
        const { data } = await supabase.from('users')
          .select('id, email, full_name, phone, role, company_id');
        allUsers = (data ?? []) as UserFull[];
      }

      // Cache occupants per building to avoid refetching
      const occupantCache = new Map<string, Awaited<ReturnType<typeof fetchBuildingOccupants>>>();

      // ─── Row-by-row sync ───
      for (let i = 0; i < rawRows.length; i++) {
        const row = rawRows[i];
        const rowNum = i + 2;
        setProgress(Math.round(((i + 1) / rawRows.length) * 100));

        try {
          switch (activeTab) {

            // ─── COMPANIES: match by name ───
            case 'companies': {
              if (!row.name) { rowResults.push({ row: rowNum, status: 'skipped', message: 'Empty name' }); break; }
              const existing = companies.find((c) => looseMatch(c.name, row.name));
              if (existing) {
                const newSlug = row.slug || toSlug(row.name);
                if (looseMatch(existing.slug, newSlug)) {
                  rowResults.push({ row: rowNum, status: 'unchanged', message: `"${row.name}" — no changes` });
                } else {
                  await updateCompany(existing.id, { slug: newSlug });
                  rowResults.push({ row: rowNum, status: 'updated', message: `Updated slug → ${newSlug}` });
                }
              } else {
                const slug = row.slug || toSlug(row.name);
                const created = await createCompany(row.name, slug);
                companies.push(created);
                rowResults.push({ row: rowNum, status: 'created', message: `Created "${row.name}"` });
              }
              break;
            }

            // ─── BUILDINGS: match by company + address ───
            case 'buildings': {
              const company = companies.find((c) => looseMatch(c.name, row.company_name));
              if (!company) { rowResults.push({ row: rowNum, status: 'error', message: `Company "${row.company_name}" not found` }); break; }
              if (!row.address || !row.city || !row.state || !row.zip) {
                rowResults.push({ row: rowNum, status: 'skipped', message: 'Missing address fields' }); break;
              }

              const existing = allBuildings.find((b) =>
                b.company_id === company.id && looseMatch(b.address_line1, row.address)
              );

              const form: BuildingFormData = {
                name: row.building_name || '',
                address_line1: row.address,
                address_line2: '',
                city: row.city,
                state: row.state,
                zip: row.zip,
                gate_code: row.gate_code || '',
                onsite_contact_name: row.onsite_contact_name || '',
                onsite_contact_phone: row.onsite_contact_phone || '',
                water_shutoff_location: row.water_shutoff || '',
                gas_shutoff_location: row.gas_shutoff || '',
                access_notes: row.access_notes || '',
              };

              if (existing) {
                const diff = changedFields(existing as unknown as Record<string, unknown>, {
                  name: form.name || null,
                  city: form.city, state: form.state.toUpperCase(), zip: form.zip,
                  gate_code: form.gate_code || null,
                  onsite_contact_name: form.onsite_contact_name || null,
                  onsite_contact_phone: form.onsite_contact_phone || null,
                  water_shutoff_location: form.water_shutoff_location || null,
                  gas_shutoff_location: form.gas_shutoff_location || null,
                  access_notes: form.access_notes || null,
                }, ['name', 'city', 'state', 'zip', 'gate_code', 'onsite_contact_name', 'onsite_contact_phone', 'water_shutoff_location', 'gas_shutoff_location', 'access_notes']);

                if (diff.length === 0) {
                  rowResults.push({ row: rowNum, status: 'unchanged', message: `${row.address} — no changes` });
                } else {
                  await updateBuilding(existing.id, form);
                  rowResults.push({ row: rowNum, status: 'updated', message: `Updated ${diff.join(', ')}` });
                }
              } else {
                const created = await createBuilding(company.id, form);
                allBuildings.push(created as unknown as BuildingFull);
                rowResults.push({ row: rowNum, status: 'created', message: `Created at ${row.address}` });
              }
              break;
            }

            // ─── UNITS: match by building + unit_number ───
            case 'units': {
              const building = allBuildings.find((b) =>
                looseMatch(b.address_line1, row.building_address) || looseMatch(b.name, row.building_address)
              );
              if (!building) { rowResults.push({ row: rowNum, status: 'error', message: `Building "${row.building_address}" not found` }); break; }
              if (!row.unit_number) { rowResults.push({ row: rowNum, status: 'skipped', message: 'Empty unit number' }); break; }

              const existing = allSpaces.find((s) =>
                s.building_id === building.id && looseMatch(s.unit_number, row.unit_number)
              );

              const form: SpaceFormData = {
                space_type: 'unit', unit_number: row.unit_number,
                common_area_type: '',
                floor: row.floor || '', bedrooms: row.bedrooms || '', bathrooms: row.bathrooms || '',
              };

              if (existing) {
                const diff = changedFields(
                  { floor: String(existing.floor ?? ''), bedrooms: String(existing.bedrooms ?? ''), bathrooms: String(existing.bathrooms ?? '') },
                  { floor: form.floor, bedrooms: form.bedrooms, bathrooms: form.bathrooms },
                  ['floor', 'bedrooms', 'bathrooms'],
                );
                if (diff.length === 0) {
                  rowResults.push({ row: rowNum, status: 'unchanged', message: `Unit ${row.unit_number} — no changes` });
                } else {
                  await updateSpace(existing.id, form);
                  rowResults.push({ row: rowNum, status: 'updated', message: `Unit ${row.unit_number}: updated ${diff.join(', ')}` });
                }
              } else {
                const created = await createSpace(building.id, form);
                allSpaces.push(created as unknown as SpaceFull);
                rowResults.push({ row: rowNum, status: 'created', message: `Created unit ${row.unit_number}` });
              }
              break;
            }

            // ─── OCCUPANTS: match by building + unit + email ───
            case 'occupants': {
              const building = allBuildings.find((b) =>
                looseMatch(b.address_line1, row.building_address) || looseMatch(b.name, row.building_address)
              );
              if (!building) { rowResults.push({ row: rowNum, status: 'error', message: `Building "${row.building_address}" not found` }); break; }

              const space = allSpaces.find((s) =>
                s.building_id === building.id && looseMatch(s.unit_number, row.unit_number)
              );
              if (!space) { rowResults.push({ row: rowNum, status: 'error', message: `Unit "${row.unit_number}" not found in ${row.building_address}` }); break; }
              if (!row.email || !row.name) { rowResults.push({ row: rowNum, status: 'skipped', message: 'Missing name or email' }); break; }

              // Fetch + cache occupants per building
              if (!occupantCache.has(building.id)) {
                occupantCache.set(building.id, await fetchBuildingOccupants(building.id));
              }
              const occupants = occupantCache.get(building.id)!;

              const existing = occupants.find((o) =>
                looseMatch(o.email, row.email) && o.space_id === space.id
              );

              if (existing) {
                const diff = changedFields(
                  existing as unknown as Record<string, unknown>,
                  { name: row.name, phone: row.phone || null, occupant_type: (row.type === 'homeowner' ? 'homeowner' : 'tenant') } as unknown as Record<string, unknown>,
                  ['name', 'phone', 'occupant_type'],
                );
                if (diff.length === 0) {
                  rowResults.push({ row: rowNum, status: 'unchanged', message: `${row.name} — no changes` });
                } else {
                  const { error: upErr } = await supabase.from('occupants').update({
                    name: row.name,
                    phone: row.phone || null,
                    occupant_type: row.type === 'homeowner' ? 'homeowner' : 'tenant',
                  }).eq('id', existing.id);
                  if (upErr) throw new Error(upErr.message);
                  // Update cache
                  existing.name = row.name;
                  existing.phone = row.phone || null;
                  (existing as unknown as Record<string, unknown>).occupant_type = row.type === 'homeowner' ? 'homeowner' : 'tenant';
                  rowResults.push({ row: rowNum, status: 'updated', message: `${row.name}: updated ${diff.join(', ')}` });
                }
              } else {
                const form: OccupantFormData = {
                  occupant_type: row.type === 'homeowner' ? 'homeowner' : 'tenant',
                  name: row.name, email: row.email, phone: row.phone || '',
                };
                const created = await createOccupant(space.id, form);
                occupants.push(created); // update cache
                rowResults.push({ row: rowNum, status: 'created', message: `Added ${row.name} to unit ${row.unit_number}` });
              }
              break;
            }

            // ─── USERS: match by email ───
            case 'users': {
              const company = companies.find((c) => looseMatch(c.name, row.company_name));
              if (!company) { rowResults.push({ row: rowNum, status: 'error', message: `Company "${row.company_name}" not found` }); break; }
              if (!row.email || !row.name) { rowResults.push({ row: rowNum, status: 'skipped', message: 'Missing name or email' }); break; }

              const existing = allUsers.find((u) => looseMatch(u.email, row.email));
              const role = row.role?.toLowerCase() === 'pm_admin' ? 'pm_admin' : 'pm_user';

              if (existing) {
                const diff = changedFields(
                  { full_name: existing.full_name, phone: existing.phone ?? '', role: existing.role },
                  { full_name: row.name, phone: row.phone || '', role },
                  ['full_name', 'phone', 'role'],
                );
                if (diff.length === 0) {
                  rowResults.push({ row: rowNum, status: 'unchanged', message: `${row.email} — no changes` });
                } else {
                  const { error: upErr } = await supabase.from('users')
                    .update({ full_name: row.name, phone: row.phone || null, role })
                    .eq('id', existing.id);
                  if (upErr) throw new Error(upErr.message);
                  existing.full_name = row.name;
                  existing.phone = row.phone || null;
                  existing.role = role;
                  rowResults.push({ row: rowNum, status: 'updated', message: `${row.email}: updated ${diff.join(', ')}` });
                }
              } else {
                const result = await sendInvitation({
                  company_id: company.id, email: row.email, name: row.name, role,
                });
                if (!result.ok) {
                  rowResults.push({ row: rowNum, status: 'error', message: result.error.message });
                } else {
                  rowResults.push({ row: rowNum, status: 'created', message: `Invitation sent to ${row.email}` });
                }
              }
              break;
            }
          }
        } catch (e) {
          rowResults.push({ row: rowNum, status: 'error', message: e instanceof Error ? e.message : 'Unknown error' });
        }

        // Live update
        setResults([...rowResults]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data');
    }

    setImporting(false);
    const cr = rowResults.filter((r) => r.status === 'created').length;
    const up = rowResults.filter((r) => r.status === 'updated').length;
    const er = rowResults.filter((r) => r.status === 'error').length;
    if (er === 0) toast.success(`Sync complete: ${cr} created, ${up} updated`);
    else toast.warning(`${cr} created, ${up} updated, ${er} failed`);
  };

  // ── Reset ──
  const handleReset = () => {
    setFileName(null); setRawRows([]); setHeaderMap({});
    setResults(null); setError(null); setProgress(0);
    if (fileRef.current) fileRef.current.value = '';
  };

  const counts = {
    created: results?.filter((r) => r.status === 'created').length ?? 0,
    updated: results?.filter((r) => r.status === 'updated').length ?? 0,
    unchanged: results?.filter((r) => r.status === 'unchanged').length ?? 0,
    error: results?.filter((r) => r.status === 'error').length ?? 0,
    skipped: results?.filter((r) => r.status === 'skipped').length ?? 0,
  };

  return (
    <PageTransition>
      <Button variant="ghost" size="sm" className="mb-4 -ml-2 gap-1" onClick={() => navigate('..', { relative: 'path' })}>
        <ChevronLeft className="h-3.5 w-3.5" /> Back
      </Button>

      <div className="mb-5">
        <h2 className="text-lg sm:text-xl font-bold tracking-tight flex items-center gap-2">
          <RefreshCw className="h-5 w-5 text-primary" /> Sync from Excel
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Upload a spreadsheet to sync. Existing records update, new ones are created — never duplicates.
        </p>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {/* Type tabs */}
      <div className="company-tabs mb-5">
        {TABS.map((t) => (
          <button key={t.key} className={`company-tab ${activeTab === t.key ? 'active' : ''}`}
            onClick={() => { setActiveTab(t.key); handleReset(); }}>
            {t.icon}
            <span className="hidden sm:inline">{t.label}</span>
            <span className="sm:hidden">{t.label.slice(0, 5)}</span>
          </button>
        ))}
      </div>

      {/* Instructions + template download */}
      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="text-sm font-semibold mb-1">{tab.description}</div>
              <div className="text-xs text-muted-foreground mb-1.5">
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 text-[10px] font-semibold">
                  <RefreshCw className="h-2.5 w-2.5" /> {tab.matchKey}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                <span className="font-medium">Required:</span>{' '}
                {tab.requiredColumns.map((c, i) => (
                  <span key={c}><code className="bg-muted px-1 py-0.5 rounded text-[11px]">{c}</code>{i < tab.requiredColumns.length - 1 ? ', ' : ''}</span>
                ))}
              </div>
              {tab.optionalColumns.length > 0 && (
                <div className="text-xs text-muted-foreground mt-1">
                  <span className="font-medium">Optional:</span> {tab.optionalColumns.join(', ')}
                </div>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={() => generateTemplate(activeTab)} className="shrink-0">
              <Download className="h-3.5 w-3.5" /> Template
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* File upload zone */}
      {!fileName ? (
        <label className="import-dropzone">
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="sr-only" />
          <Upload className="h-8 w-8 text-muted-foreground/40 mb-2" />
          <div className="text-sm font-semibold">Upload spreadsheet</div>
          <div className="text-xs text-muted-foreground">.xlsx, .xls, or .csv</div>
        </label>
      ) : (
        <>
          {/* File info */}
          <div className="flex items-center justify-between gap-3 mb-4 p-3 rounded-lg bg-muted/50 border border-border">
            <div className="flex items-center gap-2 min-w-0">
              <FileSpreadsheet className="h-5 w-5 text-green-600 shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">{fileName}</div>
                <div className="text-xs text-muted-foreground">{rawRows.length} row{rawRows.length !== 1 ? 's' : ''}</div>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={handleReset}>Change</Button>
          </div>

          {/* Column mapping badges */}
          <div className="flex flex-wrap gap-1.5 mb-4">
            {tab.requiredColumns.map((c) => (
              <Badge key={c} variant={normalizedHeaders.includes(c) ? 'success' : 'destructive'} className="text-xs">
                {normalizedHeaders.includes(c) ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}{c}
              </Badge>
            ))}
            {matchedOptional.map((c) => (
              <Badge key={c} variant="secondary" className="text-xs"><CheckCircle2 className="h-3 w-3 mr-1" /> {c}</Badge>
            ))}
          </div>

          {missingRequired.length > 0 && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm mb-4">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>Missing column{missingRequired.length > 1 ? 's' : ''}: <strong>{missingRequired.join(', ')}</strong></div>
            </div>
          )}

          {/* Progress */}
          {importing && (
            <div className="mb-4">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Syncing…</span><span>{progress}%</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {/* Data table */}
          {rawRows.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-border mb-4">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-muted-foreground">#</th>
                    {[...matchedRequired, ...matchedOptional].map((c) => (
                      <th key={c} className="px-3 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap">{c}</th>
                    ))}
                    <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rawRows.slice(0, 100).map((row, i) => {
                    const r = results?.[i];
                    const bg = r?.status === 'error' ? 'bg-red-50/60' : r?.status === 'created' ? 'bg-green-50/60' : r?.status === 'updated' ? 'bg-blue-50/60' : '';
                    return (
                      <tr key={i} className={bg}>
                        <td className="px-3 py-2 border-t border-border text-muted-foreground">{i + 2}</td>
                        {[...matchedRequired, ...matchedOptional].map((c) => (
                          <td key={c} className="px-3 py-2 border-t border-border max-w-[140px] truncate">{row[c] ?? ''}</td>
                        ))}
                        <td className="px-3 py-2 border-t border-border whitespace-nowrap">
                          {r ? (
                            <span className={`inline-flex items-center gap-1 text-xs ${STATUS_COLOR[r.status]}`}>
                              {STATUS_ICON[r.status]}
                              <span className="truncate max-w-[160px]">{r.message}</span>
                            </span>
                          ) : importing ? (
                            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {rawRows.length > 100 && (
                <div className="px-3 py-2 text-xs text-muted-foreground text-center bg-muted/30 border-t border-border">
                  Showing first 100 of {rawRows.length} rows
                </div>
              )}
            </div>
          )}

          {/* Summary bar */}
          {results && !importing && (
            <div className="flex flex-wrap gap-3 mb-4 p-3 rounded-lg bg-muted/30 border border-border">
              {counts.created > 0 && <div className="flex items-center gap-1.5 text-sm"><CheckCircle2 className="h-4 w-4 text-green-500" /><span className="font-semibold">{counts.created}</span> created</div>}
              {counts.updated > 0 && <div className="flex items-center gap-1.5 text-sm"><RefreshCw className="h-4 w-4 text-blue-500" /><span className="font-semibold">{counts.updated}</span> updated</div>}
              {counts.unchanged > 0 && <div className="flex items-center gap-1.5 text-sm"><CheckCircle2 className="h-4 w-4 text-muted-foreground" /><span className="font-semibold">{counts.unchanged}</span> unchanged</div>}
              {counts.error > 0 && <div className="flex items-center gap-1.5 text-sm"><XCircle className="h-4 w-4 text-destructive" /><span className="font-semibold">{counts.error}</span> failed</div>}
              {counts.skipped > 0 && <div className="flex items-center gap-1.5 text-sm"><AlertTriangle className="h-4 w-4 text-amber-500" /><span className="font-semibold">{counts.skipped}</span> skipped</div>}
            </div>
          )}

          {/* Action */}
          <div className="flex gap-3">
            {!results ? (
              <Button onClick={handleSync} disabled={!isReady || importing} className="flex-1 sm:flex-none">
                {importing
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Syncing…</>
                  : <><RefreshCw className="h-4 w-4" /> Sync {rawRows.length} Row{rawRows.length !== 1 ? 's' : ''}</>
                }
              </Button>
            ) : (
              <Button onClick={handleReset} variant="outline"><Upload className="h-4 w-4" /> Upload Another File</Button>
            )}
          </div>
        </>
      )}
    </PageTransition>
  );
}
