// =============================================================================
// PlumbTix — Reporting Dashboard (Admin Only, v0.8)
// =============================================================================
// Professional reports with:
//   • Date range, building, status, and severity filters
//   • CSV export for any filtered dataset
//   • Monthly ticket summary with line + bar charts
//   • Technician performance metrics
//   • Property overview with recurring issues
//   • Print-friendly layout via @media print
// =============================================================================

import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { STATUS_LABELS, SEVERITY_LABELS } from '@shared/types/enums';
import type { TicketStatus, TicketSeverity } from '@shared/types/enums';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend,
} from 'recharts';
import { PageTransition } from '@/components/PageTransition';
import { Loading } from '@/components/Loading';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  BarChart3, Clock, CheckCircle2, TrendingUp, Building2, Briefcase,
  Download, Printer, Filter, X, Users, Wrench,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_COLORS: Partial<Record<TicketStatus, string>> = {
  new: '#3b82f6', needs_info: '#f59e0b', scheduled: '#8b5cf6',
  dispatched: '#06b6d4', on_site: '#10b981', in_progress: '#f97316',
  waiting_approval: '#ec4899', completed: '#22c55e', invoiced: '#6366f1',
  cancelled: '#94a3b8',
};
const SEVERITY_COLORS: Record<TicketSeverity, string> = {
  emergency: '#ef4444', urgent: '#f59e0b', standard: '#3b82f6',
};
const OPEN_STATUSES: TicketStatus[] = [
  'new', 'needs_info', 'scheduled', 'dispatched', 'on_site', 'in_progress', 'waiting_approval',
];
const CLOSED_STATUSES: TicketStatus[] = ['completed', 'invoiced'];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TicketRow {
  id: string;
  status: TicketStatus;
  severity: TicketSeverity;
  issue_type: string;
  assigned_technician: string | null;
  created_at: string;
  completed_at: string | null;
  building: {
    id: string;
    name: string | null;
    address_line1: string;
    company_id: string;
    company: { name: string } | null;
  };
}

interface Filters {
  dateFrom: string;
  dateTo: string;
  buildingId: string;
  status: string;
  severity: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function daysBetween(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / 86400000;
}

function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const csv = [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MetricCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string | number; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 shrink-0">{icon}</div>
          <div className="min-w-0">
            <div className="text-2xl font-bold">{value}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
            {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-bold tracking-tight flex items-center gap-2 mb-3 mt-6 pb-2 border-b border-border">
      {children}
    </h3>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function ReportingDashboard() {
  const [allTickets, setAllTickets] = useState<TicketRow[]>([]);
  const [buildings, setBuildings] = useState<{ id: string; label: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Default: last 6 months
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const [filters, setFilters] = useState<Filters>({
    dateFrom: sixMonthsAgo.toISOString().slice(0, 10),
    dateTo: new Date().toISOString().slice(0, 10),
    buildingId: '',
    status: '',
    severity: '',
  });
  const [showFilters, setShowFilters] = useState(false);

  // ── Load data ──
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data: tickets, error: err } = await supabase
        .from('tickets')
        .select(`id, status, severity, issue_type, assigned_technician, created_at, completed_at,
          building:buildings!inner(id, name, address_line1, company_id,
            company:companies(name))`);
      if (err) throw new Error(err.message);
      const rows = (tickets ?? []) as unknown as TicketRow[];
      setAllTickets(rows);

      // Build unique building list
      const bMap = new Map<string, string>();
      for (const t of rows) {
        const label = t.building.name || t.building.address_line1;
        bMap.set(t.building.id, label);
      }
      setBuildings(Array.from(bMap.entries()).map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Apply filters ──
  const filtered = useMemo(() => {
    return allTickets.filter(t => {
      const created = t.created_at.slice(0, 10);
      if (filters.dateFrom && created < filters.dateFrom) return false;
      if (filters.dateTo && created > filters.dateTo) return false;
      if (filters.buildingId && t.building.id !== filters.buildingId) return false;
      if (filters.status && t.status !== filters.status) return false;
      if (filters.severity && t.severity !== filters.severity) return false;
      return true;
    });
  }, [allTickets, filters]);

  // ── Compute all metrics from filtered data ──
  const metrics = useMemo(() => {
    const total = filtered.length;
    const open = filtered.filter(t => OPEN_STATUSES.includes(t.status)).length;
    const completed = filtered.filter(t => CLOSED_STATUSES.includes(t.status)).length;
    const cancelled = filtered.filter(t => t.status === 'cancelled').length;

    // Avg resolution
    const resolved = filtered.filter(t => t.completed_at);
    const avgDays = resolved.length > 0
      ? Math.round(resolved.reduce((acc, t) => acc + daysBetween(t.created_at, t.completed_at!), 0) / resolved.length * 10) / 10
      : 0;
    const completionRate = total > 0 ? Math.round((completed / total) * 1000) / 10 : 0;

    // Status pie
    const statusCounts = new Map<TicketStatus, number>();
    for (const t of filtered) statusCounts.set(t.status, (statusCounts.get(t.status) || 0) + 1);
    const statusPie = Array.from(statusCounts.entries()).map(([s, c]) => ({
      name: STATUS_LABELS[s], value: c, color: STATUS_COLORS[s] || '#94a3b8',
    }));

    // Severity pie
    const sevCounts = new Map<TicketSeverity, number>();
    for (const t of filtered) sevCounts.set(t.severity, (sevCounts.get(t.severity) || 0) + 1);
    const severityPie = Array.from(sevCounts.entries()).map(([s, c]) => ({
      name: SEVERITY_LABELS[s], value: c, color: SEVERITY_COLORS[s],
    }));

    // Monthly trend (based on filter range)
    const from = new Date(filters.dateFrom || filtered[0]?.created_at || new Date().toISOString());
    const to = new Date(filters.dateTo || new Date().toISOString());
    const months: { month: string; created: number; completed: number }[] = [];
    const cur = new Date(from.getFullYear(), from.getMonth(), 1);
    while (cur <= to) {
      const yr = cur.getFullYear(), mo = cur.getMonth();
      const label = cur.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      months.push({
        month: label,
        created: filtered.filter(t => { const d = new Date(t.created_at); return d.getFullYear() === yr && d.getMonth() === mo; }).length,
        completed: filtered.filter(t => { if (!t.completed_at) return false; const d = new Date(t.completed_at); return d.getFullYear() === yr && d.getMonth() === mo; }).length,
      });
      cur.setMonth(cur.getMonth() + 1);
    }

    // By building
    const bMap = new Map<string, { name: string; open: number; completed: number; total: number }>();
    for (const t of filtered) {
      const bName = t.building.name || t.building.address_line1;
      const e = bMap.get(t.building.id) || { name: bName, open: 0, completed: 0, total: 0 };
      e.total++;
      if (OPEN_STATUSES.includes(t.status)) e.open++;
      if (CLOSED_STATUSES.includes(t.status)) e.completed++;
      bMap.set(t.building.id, e);
    }
    const byBuilding = Array.from(bMap.values()).sort((a, b) => b.total - a.total).slice(0, 10);

    // By company
    const cMap = new Map<string, { name: string; open: number; total: number }>();
    for (const t of filtered) {
      const cName = t.building.company?.name || 'Unknown';
      const e = cMap.get(t.building.company_id) || { name: cName, open: 0, total: 0 };
      e.total++; if (OPEN_STATUSES.includes(t.status)) e.open++;
      cMap.set(t.building.company_id, e);
    }
    const byCompany = Array.from(cMap.values()).sort((a, b) => b.total - a.total).slice(0, 10);

    // Technician performance
    const techMap = new Map<string, { name: string; total: number; completed: number; totalDays: number; completedCount: number }>();
    for (const t of filtered) {
      const tech = t.assigned_technician;
      if (!tech) continue;
      const e = techMap.get(tech) || { name: tech, total: 0, completed: 0, totalDays: 0, completedCount: 0 };
      e.total++;
      if (CLOSED_STATUSES.includes(t.status)) {
        e.completed++;
        if (t.completed_at) {
          e.totalDays += daysBetween(t.created_at, t.completed_at);
          e.completedCount++;
        }
      }
      techMap.set(tech, e);
    }
    const techPerf = Array.from(techMap.values())
      .map(t => ({
        ...t,
        avgDays: t.completedCount > 0 ? Math.round(t.totalDays / t.completedCount * 10) / 10 : null,
        rate: t.total > 0 ? Math.round(t.completed / t.total * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.total - a.total);

    // Issue type breakdown (top recurring)
    const issueMap = new Map<string, number>();
    for (const t of filtered) issueMap.set(t.issue_type, (issueMap.get(t.issue_type) || 0) + 1);
    const topIssues = Array.from(issueMap.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    return {
      total, open, completed, cancelled, avgDays, completionRate,
      statusPie, severityPie, months, byBuilding, byCompany,
      techPerf, topIssues,
    };
  }, [filtered, filters.dateFrom, filters.dateTo]);

  // ── CSV export ──
  const handleExportCsv = useCallback(() => {
    const headers = ['Ticket ID', 'Status', 'Severity', 'Issue Type', 'Technician', 'Building', 'Company', 'Created', 'Completed'];
    const rows = filtered.map(t => [
      t.id.slice(0, 8),
      STATUS_LABELS[t.status] ?? t.status,
      SEVERITY_LABELS[t.severity] ?? t.severity,
      t.issue_type,
      t.assigned_technician || '—',
      t.building.name || t.building.address_line1,
      t.building.company?.name || '—',
      fmtDate(t.created_at),
      t.completed_at ? fmtDate(t.completed_at) : '—',
    ]);
    const dateRange = `${filters.dateFrom || 'all'}_to_${filters.dateTo || 'all'}`;
    downloadCsv(`plumbtix-report-${dateRange}.csv`, headers, rows);
  }, [filtered, filters]);

  const handlePrint = () => window.print();

  const clearFilters = () => {
    const sixAgo = new Date(); sixAgo.setMonth(sixAgo.getMonth() - 6);
    setFilters({
      dateFrom: sixAgo.toISOString().slice(0, 10),
      dateTo: new Date().toISOString().slice(0, 10),
      buildingId: '', status: '', severity: '',
    });
  };

  const hasActiveFilters = filters.buildingId || filters.status || filters.severity;

  if (loading) return <Loading />;
  if (error && !allTickets.length) return <ErrorBanner message={error} />;

  return (
    <PageTransition>
      {/* ── Header ── */}
      <div className="flex justify-between items-start flex-wrap gap-3 mb-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Reporting Dashboard</h2>
          <p className="text-sm text-muted-foreground">
            {fmtDate(filters.dateFrom)} — {fmtDate(filters.dateTo)} · {filtered.length} tickets
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="h-3.5 w-3.5" />
            Filters {hasActiveFilters && <span className="bg-primary text-primary-foreground rounded-full w-4 h-4 text-[10px] flex items-center justify-center">!</span>}
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportCsv}>
            <Download className="h-3.5 w-3.5" /> CSV
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 print:hidden" onClick={handlePrint}>
            <Printer className="h-3.5 w-3.5" /> Print
          </Button>
        </div>
      </div>
      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {/* ── Filters Panel ── */}
      {showFilters && (
        <Card className="mb-4 print:hidden">
          <CardContent className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <div>
                <Label className="text-xs">From</Label>
                <Input type="date" value={filters.dateFrom} onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">To</Label>
                <Input type="date" value={filters.dateTo} onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Building</Label>
                <select
                  className="form-input text-sm"
                  value={filters.buildingId}
                  onChange={e => setFilters(f => ({ ...f, buildingId: e.target.value }))}
                >
                  <option value="">All Buildings</option>
                  {buildings.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs">Status</Label>
                <select
                  className="form-input text-sm"
                  value={filters.status}
                  onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
                >
                  <option value="">All Statuses</option>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs">Severity</Label>
                <select
                  className="form-input text-sm"
                  value={filters.severity}
                  onChange={e => setFilters(f => ({ ...f, severity: e.target.value }))}
                >
                  <option value="">All Severities</option>
                  {Object.entries(SEVERITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" className="mt-2 gap-1 text-xs" onClick={clearFilters}>
                <X className="h-3 w-3" /> Clear filters
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <MetricCard icon={<BarChart3 className="h-5 w-5 text-primary" />} label="Total Tickets" value={metrics.total} />
        <MetricCard icon={<TrendingUp className="h-5 w-5 text-orange-500" />} label="Open" value={metrics.open} sub={metrics.total ? `${Math.round(metrics.open / metrics.total * 100)}%` : undefined} />
        <MetricCard icon={<CheckCircle2 className="h-5 w-5 text-green-500" />} label="Completed" value={metrics.completed} />
        <MetricCard icon={<Clock className="h-5 w-5 text-purple-500" />} label="Avg Resolution" value={`${metrics.avgDays}d`} />
        <MetricCard icon={<CheckCircle2 className="h-5 w-5 text-emerald-500" />} label="Completion Rate" value={`${metrics.completionRate}%`} />
      </div>

      {/* ── Monthly Trend + Status Pie ── */}
      <SectionTitle><BarChart3 className="h-4 w-4 text-muted-foreground" /> Ticket Trends</SectionTitle>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Card><CardContent className="p-4">
          <div className="text-sm font-semibold mb-3">Monthly Created vs Completed</div>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={metrics.months}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="created" stroke="#3b82f6" name="Created" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="completed" stroke="#22c55e" name="Completed" strokeWidth={2} dot={{ r: 3 }} />
              <Legend />
            </LineChart>
          </ResponsiveContainer>
        </CardContent></Card>

        <Card><CardContent className="p-4">
          <div className="text-sm font-semibold mb-3">Status Breakdown</div>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={metrics.statusPie} cx="50%" cy="50%" innerRadius={50} outerRadius={90} dataKey="value">
                {metrics.statusPie.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </CardContent></Card>
      </div>

      {/* ── Technician Performance ── */}
      {metrics.techPerf.length > 0 && (
        <>
          <SectionTitle><Users className="h-4 w-4 text-muted-foreground" /> Technician Performance</SectionTitle>
          <Card className="mb-6">
            <CardContent className="p-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="pb-2 font-semibold text-xs text-muted-foreground">Technician</th>
                      <th className="pb-2 font-semibold text-xs text-muted-foreground text-center">Assigned</th>
                      <th className="pb-2 font-semibold text-xs text-muted-foreground text-center">Completed</th>
                      <th className="pb-2 font-semibold text-xs text-muted-foreground text-center">Completion Rate</th>
                      <th className="pb-2 font-semibold text-xs text-muted-foreground text-center">Avg Days</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.techPerf.map(t => (
                      <tr key={t.name} className="border-b border-border/50">
                        <td className="py-2 font-medium">{t.name}</td>
                        <td className="py-2 text-center">{t.total}</td>
                        <td className="py-2 text-center">{t.completed}</td>
                        <td className="py-2 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                            t.rate >= 80 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : t.rate >= 50 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                            : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          }`}>
                            {t.rate}%
                          </span>
                        </td>
                        <td className="py-2 text-center">{t.avgDays !== null ? `${t.avgDays}d` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* ── Property Overview + Issue Types ── */}
      <SectionTitle><Building2 className="h-4 w-4 text-muted-foreground" /> Property & Issue Breakdown</SectionTitle>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 text-sm font-semibold mb-3">
            <Building2 className="h-4 w-4 text-muted-foreground" /> Tickets by Building
          </div>
          {metrics.byBuilding.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={metrics.byBuilding} layout="vertical" margin={{ left: 20 }}>
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={120} />
                <Tooltip />
                <Bar dataKey="open" fill="#f97316" name="Open" />
                <Bar dataKey="completed" fill="#22c55e" name="Completed" />
                <Legend />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">No data for selected filters</p>
          )}
        </CardContent></Card>

        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 text-sm font-semibold mb-3">
            <Wrench className="h-4 w-4 text-muted-foreground" /> Top Issue Types
          </div>
          {metrics.topIssues.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={metrics.topIssues} layout="vertical" margin={{ left: 20 }}>
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis type="category" dataKey="type" tick={{ fontSize: 10 }} width={120} />
                <Tooltip />
                <Bar dataKey="count" fill="#6366f1" name="Tickets" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">No data for selected filters</p>
          )}
        </CardContent></Card>
      </div>

      {/* ── Company + Severity ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 text-sm font-semibold mb-3">
            <Briefcase className="h-4 w-4 text-muted-foreground" /> Tickets by Company
          </div>
          {metrics.byCompany.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={metrics.byCompany} layout="vertical" margin={{ left: 20 }}>
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={120} />
                <Tooltip />
                <Bar dataKey="open" fill="#f97316" name="Open" />
                <Bar dataKey="total" fill="#3b82f6" name="Total" />
                <Legend />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">No data</p>
          )}
        </CardContent></Card>

        <Card><CardContent className="p-4">
          <div className="text-sm font-semibold mb-3">Severity Distribution</div>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={metrics.severityPie} cx="50%" cy="50%" outerRadius={80} dataKey="value" label>
                {metrics.severityPie.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </CardContent></Card>
      </div>

      {/* ── Print footer ── */}
      <div className="hidden print:block text-center text-xs text-gray-400 mt-8 pt-4 border-t">
        PlumbTix Reporting Dashboard · Pro Roto Inc. · Printed {new Date().toLocaleDateString()}
      </div>
    </PageTransition>
  );
}
