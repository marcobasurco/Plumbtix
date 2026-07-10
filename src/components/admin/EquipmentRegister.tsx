// =============================================================================
// Equipment Register — assets grouped by company → building → space, with
// counts at every level. Filters, CSV export, and print (window.print; the
// app's @media print CSS hides nav/sidebar so the report prints clean).
// =============================================================================
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Printer, Download, Loader2, Wrench, Building2 } from 'lucide-react';

interface Row {
  id: string; category: string; name: string;
  manufacturer: string | null; model: string | null;
  serial_number: string | null; spec: string | null; notes: string | null;
  space: {
    id: string; space_type: string; unit_number: string | null;
    common_area_type: string | null; label: string | null;
    building: {
      id: string; name: string | null; address_line1: string;
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
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState('');
  const [buildingId, setBuildingId] = useState('');

  useEffect(() => {
    (async () => {
      const PAGE = 1000; const out: Row[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error: err } = await supabase
          .from('equipment')
          .select(`id, category, name, manufacturer, model, serial_number, spec, notes,
            space:spaces!inner(id, space_type, unit_number, common_area_type, label,
              building:buildings!inner(id, name, address_line1,
                company:companies(id, name)))`)
          .order('id').range(from, from + PAGE - 1);
        if (err) { setError(err.message); return; }
        out.push(...((data ?? []) as unknown as Row[]));
        if ((data ?? []).length < PAGE) break;
      }
      setRows(out);
    })();
  }, []);

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

  // group: building → space → items
  const grouped = useMemo(() => {
    const byB = new Map<string, { label: string; addr: string; company: string;
      spaces: Map<string, { label: string; items: Row[] }> }>();
    for (const r of filtered) {
      const b = r.space.building;
      if (!byB.has(b.id)) byB.set(b.id, {
        label: b.name || b.address_line1, addr: b.address_line1,
        company: b.company?.name ?? '—', spaces: new Map() });
      const bg = byB.get(b.id)!;
      const sk = r.space.id;
      if (!bg.spaces.has(sk)) bg.spaces.set(sk, { label: spaceName(r.space), items: [] });
      bg.spaces.get(sk)!.items.push(r);
    }
    return [...byB.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [filtered]);

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
    <div className="space-y-5">
      {/* Controls — hidden when printing */}
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
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCsv}>
            <Download className="h-3.5 w-3.5" /> CSV
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => window.print()}>
            <Printer className="h-3.5 w-3.5" /> Print
          </Button>
        </div>
      </div>

      {/* Print header */}
      <div className="hidden print:block">
        <h1 className="text-xl font-bold">Equipment Register</h1>
        <div className="text-sm text-muted-foreground">
          Generated {new Date().toLocaleDateString()} · {filtered.length} items
        </div>
      </div>

      <div className="text-sm text-muted-foreground print:hidden">
        {filtered.length} items · {grouped.length} buildings
      </div>

      {grouped.map(b => (
        <div key={b.label + b.addr} className="rounded-xl border border-border bg-card overflow-hidden break-inside-avoid">
          <div className="px-4 py-3 bg-muted/50 flex items-baseline justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 font-semibold">
              <Building2 className="h-4 w-4 text-muted-foreground print:hidden" />
              {b.label}
              <span className="text-sm font-normal text-muted-foreground">— {b.addr} · {b.company}</span>
            </div>
            <span className="text-sm text-muted-foreground">
              {[...b.spaces.values()].reduce((n, s) => n + s.items.length, 0)} items
            </span>
          </div>
          {[...b.spaces.values()].sort((a, z) => a.label.localeCompare(z.label)).map(sp => (
            <div key={sp.label} className="px-4 py-3 border-t border-border">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Wrench className="h-3.5 w-3.5 print:hidden" /> {sp.label}
                <span className="normal-case font-normal">· {sp.items.length}</span>
              </div>
              {sp.items.map(e => (
                <div key={e.id} className="py-1.5 text-sm border-t border-border/40 first:border-0">
                  <span className="font-medium">{e.name}</span>
                  <span className="text-muted-foreground"> ({e.category}) — {[e.manufacturer, e.model, e.serial_number && `SN ${e.serial_number}`, e.spec].filter(Boolean).join(' · ') || '—'}</span>
                  {e.notes && <div className="text-xs italic text-muted-foreground">{e.notes}</div>}
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
      {grouped.length === 0 && <div className="text-sm text-muted-foreground p-6">No equipment matches the current filters.</div>}
    </div>
  );
}
