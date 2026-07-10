// =============================================================================
// Equipment Register — professional service document (report spec compliant).
// Data: paginated equipment query (space → building → company joins).
// Output: on-screen preview mirroring Chrome print-to-PDF; CSV export.
// =============================================================================
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/auth';
import { Loader2 } from 'lucide-react';
import { ReportHeader } from '@/components/reports/ReportHeader';
import { PropertySummary } from '@/components/reports/PropertySummary';
import { ReportSection } from '@/components/reports/ReportSection';
import { EquipmentItem } from '@/components/reports/EquipmentItem';
import { PrintActions } from '@/components/reports/PrintActions';
import { makeReportId } from '@/components/reports/format';

interface Row {
  id: string; category: string; name: string;
  manufacturer: string | null; model: string | null;
  serial_number: string | null; spec: string | null; notes: string | null;
  space: {
    id: string; space_type: string; unit_number: string | null;
    common_area_type: string | null; label: string | null;
    building: {
      id: string; name: string | null; address_line1: string;
      city: string | null; state: string | null;
      onsite_contact_name: string | null;
      company: { id: string; name: string } | null;
    };
  };
}

function spaceName(s: Row['space']) {
  if (s.space_type === 'unit') return `Unit ${s.unit_number}`;
  return s.label || (s.common_area_type ?? 'Common Area').replace(/_/g, ' ');
}

function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const esc = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`;
  const csv = [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function EquipmentRegister() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState('');
  const [buildingId, setBuildingId] = useState('');
  const [reportId, setReportId] = useState(() => makeReportId('ER'));

  const load = async () => {
    setRows(null); setError(null);
    const PAGE = 1000; const out: Row[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error: err } = await supabase
        .from('equipment')
        .select(`id, category, name, manufacturer, model, serial_number, spec, notes,
          space:spaces!inner(id, space_type, unit_number, common_area_type, label,
            building:buildings!inner(id, name, address_line1, city, state, onsite_contact_name,
              company:companies(id, name)))`)
        .order('id').range(from, from + PAGE - 1);
      if (err) { setError(err.message); return; }
      out.push(...((data ?? []) as unknown as Row[]));
      if ((data ?? []).length < PAGE) break;
    }
    setRows(out);
    setReportId(makeReportId('ER'));
  };
  useEffect(() => { void load(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const companies = useMemo(() => {
    const m = new Map<string, string>();
    (rows ?? []).forEach(r => { const c = r.space.building.company; if (c) m.set(c.id, c.name); });
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const buildings = useMemo(() => {
    const m = new Map<string, string>();
    (rows ?? []).forEach(r => {
      const b = r.space.building;
      if (companyId && b.company?.id !== companyId) return;
      m.set(b.id, b.name || b.address_line1);
    });
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows, companyId]);

  const filtered = useMemo(() => (rows ?? []).filter(r =>
    (!companyId || r.space.building.company?.id === companyId) &&
    (!buildingId || r.space.building.id === buildingId)), [rows, companyId, buildingId]);

  const grouped = useMemo(() => {
    const byB = new Map<string, { b: Row['space']['building'];
      spaces: Map<string, { label: string; items: Row[] }> }>();
    for (const r of filtered) {
      const b = r.space.building;
      if (!byB.has(b.id)) byB.set(b.id, { b, spaces: new Map() });
      const g = byB.get(b.id)!;
      if (!g.spaces.has(r.space.id)) g.spaces.set(r.space.id, { label: spaceName(r.space), items: [] });
      g.spaces.get(r.space.id)!.items.push(r);
    }
    return [...byB.values()].sort((a, z) =>
      (a.b.name || a.b.address_line1).localeCompare(z.b.name || z.b.address_line1));
  }, [filtered]);

  const totalLocations = useMemo(
    () => grouped.reduce((n, g) => n + g.spaces.size, 0), [grouped]);

  const exportCsv = () => downloadCsv('equipment-register.csv',
    ['Company','Building','Address','Space','Name','Category','Manufacturer','Model','Serial','Spec','Notes'],
    filtered.map(r => [r.space.building.company?.name ?? '', r.space.building.name ?? '',
      r.space.building.address_line1, spaceName(r.space), r.name, r.category,
      r.manufacturer ?? '', r.model ?? '', r.serial_number ?? '', r.spec ?? '', r.notes ?? '']));

  if (error) return <div className="text-destructive text-sm p-4">Failed to load: {error}</div>;
  if (rows === null) return (
    <div className="flex items-center gap-2 text-muted-foreground p-6">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading equipment register…
    </div>);

  return (
    <div className="space-y-4">
      {/* Screen-only controls */}
      <PrintActions onRegenerate={() => void load()} />
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <select value={companyId} onChange={e => { setCompanyId(e.target.value); setBuildingId(''); }}
          className="h-9 rounded-md border border-border bg-background px-3 text-sm">
          <option value="">All companies</option>
          {companies.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
        </select>
        <select value={buildingId} onChange={e => setBuildingId(e.target.value)}
          className="h-9 rounded-md border border-border bg-background px-3 text-sm">
          <option value="">All buildings</option>
          {buildings.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
        </select>
        <button onClick={exportCsv}
          className="ml-auto h-9 rounded-md border border-border bg-background px-3 text-sm hover:bg-muted/60">
          Export CSV
        </button>
      </div>

      {/* The document */}
      <div className="rpt-doc">
        <ReportHeader title="Equipment Register" reportId={reportId}
          generatedBy={profile?.full_name ?? null} />

        <div className="rpt-summary">
          <div><b>{grouped.length}</b> Properties</div>
          <div><b>{totalLocations}</b> Locations</div>
          <div><b>{filtered.length}</b> Equipment Items</div>
        </div>

        {grouped.length === 0 && (
          <p className="rpt-empty">No equipment matches the current filters.</p>
        )}

        {grouped.map((g, gi) => (
          <div key={g.b.id} className={gi > 0 ? 'rpt-property-break' : undefined}>
            <PropertySummary
              name={g.b.name || g.b.address_line1}
              address={[g.b.address_line1, g.b.city, g.b.state].filter(Boolean).join(', ')}
              company={g.b.company?.name}
              contact={g.b.onsite_contact_name} />
            {[...g.spaces.values()].sort((a, z) => a.label.localeCompare(z.label)).map(sp => (
              <ReportSection key={sp.label} title={sp.label}>
                {sp.items.map(e => <EquipmentItem key={e.id} e={e} />)}
              </ReportSection>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
