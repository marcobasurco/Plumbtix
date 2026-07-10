// =============================================================================
// Ticket Report (Print) — service-document counterpart to the on-screen ticket
// dashboard. Same rpt-* document system as the Equipment Register: letterhead,
// property blocks, per-ticket detail tables, print-safe page breaks.
// =============================================================================
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/auth';
import { Loader2 } from 'lucide-react';
import { ReportHeader } from '@/components/reports/ReportHeader';
import { PropertySummary } from '@/components/reports/PropertySummary';
import { ReportSection } from '@/components/reports/ReportSection';
import { NotesSection } from '@/components/reports/NotesSection';
import { PrintActions } from '@/components/reports/PrintActions';
import { fmtDate, fmtValue, makeReportId } from '@/components/reports/format';

interface TRow {
  id: string; ticket_number: number; issue_type: string | null;
  description: string | null; status: string; severity: string;
  assigned_technician: string | null;
  created_at: string; completed_at: string | null;
  space: { unit_number: string | null; label: string | null;
    common_area_type: string | null; space_type: string } | null;
  building: {
    id: string; name: string | null; address_line1: string;
    city: string | null; state: string | null;
    onsite_contact_name: string | null;
    company: { id: string; name: string } | null;
  };
}

const fmtEnum = (v: string | null | undefined) =>
  (v ?? '').trim().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Not provided';

const spaceName = (s: TRow['space']) => !s ? 'Not provided'
  : s.space_type === 'unit' ? `Unit ${s.unit_number}`
  : (s.label || (s.common_area_type ?? 'Common Area').replace(/_/g, ' '));

function TicketItem({ t }: { t: TRow }) {
  const rows: [string, string][] = [
    ['Status', fmtEnum(t.status)],
    ['Severity', fmtEnum(t.severity)],
    ['Location', spaceName(t.space)],
    ['Reported', fmtDate(t.created_at)],
    ['Completed', t.completed_at ? fmtDate(t.completed_at) : 'Not completed'],
    ['Assigned Technician', fmtValue(t.assigned_technician)],
  ];
  return (
    <article className="rpt-item">
      <h4 className="rpt-item-title">#{t.ticket_number} — {fmtValue(t.issue_type)}</h4>
      <table className="rpt-kv rpt-kv-bordered"><tbody>
        {rows.map(([l, v]) => <tr key={l}><th scope="row">{l}</th><td>{v}</td></tr>)}
      </tbody></table>
      <NotesSection notes={t.description} />
    </article>
  );
}

export function TicketReportDocument() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<TRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState('');
  const [buildingId, setBuildingId] = useState('');
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [reportId, setReportId] = useState(() => makeReportId('TR'));

  const load = async () => {
    setRows(null); setError(null);
    const PAGE = 1000; const out: TRow[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error: err } = await supabase
        .from('tickets')
        .select(`id, ticket_number, issue_type, description, status, severity,
          assigned_technician, created_at, completed_at,
          space:spaces(unit_number, label, common_area_type, space_type),
          building:buildings!inner(id, name, address_line1, city, state, onsite_contact_name,
            company:companies(id, name))`)
        .order('ticket_number').range(from, from + PAGE - 1);
      if (err) { setError(err.message); return; }
      out.push(...((data ?? []) as unknown as TRow[]));
      if ((data ?? []).length < PAGE) break;
    }
    setRows(out);
    setReportId(makeReportId('TR'));
  };
  useEffect(() => { void load(); }, []);

  const companies = useMemo(() => {
    const m = new Map<string, string>();
    (rows ?? []).forEach(r => { const c = r.building.company; if (c) m.set(c.id, c.name); });
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const buildings = useMemo(() => {
    const m = new Map<string, string>();
    (rows ?? []).forEach(r => {
      if (companyId && r.building.company?.id !== companyId) return;
      m.set(r.building.id, r.building.name || r.building.address_line1);
    });
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows, companyId]);

  const filtered = useMemo(() => (rows ?? []).filter(r =>
    (!companyId || r.building.company?.id === companyId) &&
    (!buildingId || r.building.id === buildingId) &&
    (!status || r.status === status) &&
    (!dateFrom || r.created_at.slice(0, 10) >= dateFrom) &&
    (!dateTo || r.created_at.slice(0, 10) <= dateTo)),
    [rows, companyId, buildingId, status, dateFrom, dateTo]);

  const grouped = useMemo(() => {
    const byB = new Map<string, { b: TRow['building']; items: TRow[] }>();
    for (const r of filtered) {
      if (!byB.has(r.building.id)) byB.set(r.building.id, { b: r.building, items: [] });
      byB.get(r.building.id)!.items.push(r);
    }
    return [...byB.values()].sort((a, z) =>
      (a.b.name || a.b.address_line1).localeCompare(z.b.name || z.b.address_line1));
  }, [filtered]);

  const openCount = filtered.filter(t => t.status !== 'completed' && t.status !== 'cancelled').length;
  const emergencies = filtered.filter(t => t.severity === 'emergency').length;
  const statuses = useMemo(() =>
    [...new Set((rows ?? []).map(r => r.status))].sort(), [rows]);

  if (error) return <div className="text-destructive text-sm p-4">Failed to load: {error}</div>;
  if (rows === null) return (
    <div className="flex items-center gap-2 text-muted-foreground p-6">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading ticket report…
    </div>);

  return (
    <div className="space-y-4">
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
        <select value={status} onChange={e => setStatus(e.target.value)}
          className="h-9 rounded-md border border-border bg-background px-3 text-sm">
          <option value="">All statuses</option>
          {statuses.map(s => <option key={s} value={s}>{fmtEnum(s)}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          className="h-9 rounded-md border border-border bg-background px-3 text-sm" />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          className="h-9 rounded-md border border-border bg-background px-3 text-sm" />
      </div>

      <div className="rpt-doc">
        <ReportHeader title="Ticket Report" reportId={reportId}
          generatedBy={profile?.full_name ?? null} />

        <div className="rpt-summary">
          <div><b>{filtered.length}</b> Tickets</div>
          <div><b>{openCount}</b> Open</div>
          <div><b>{emergencies}</b> Emergencies</div>
          <div><b>{grouped.length}</b> Properties</div>
        </div>

        {grouped.length === 0 && (
          <p className="rpt-empty">No tickets match the current filters.</p>
        )}

        {grouped.map((g, gi) => (
          <div key={g.b.id} className={gi > 0 ? 'rpt-property-break' : undefined}>
            <PropertySummary
              name={g.b.name || g.b.address_line1}
              address={[g.b.address_line1, g.b.city, g.b.state].filter(Boolean).join(', ')}
              company={g.b.company?.name}
              contact={g.b.onsite_contact_name} />
            <ReportSection title={`Service Tickets (${g.items.length})`}>
              {g.items.map(t => <TicketItem key={t.id} t={t} />)}
            </ReportSection>
          </div>
        ))}
      </div>
    </div>
  );
}
