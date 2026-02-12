// =============================================================================
// Work Orders — Reporting Dashboard (Admin Only)
// =============================================================================

import { useEffect, useState, useCallback } from 'react';
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
import { BarChart3, Clock, CheckCircle2, TrendingUp, Building2, Briefcase } from 'lucide-react';

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

interface DashboardData {
  ticketsByBuilding: { name: string; open: number; completed: number }[];
  ticketsByCompany: { name: string; open: number; total: number }[];
  avgResolutionDays: number;
  completionRate: number;
  statusBreakdown: { name: string; value: number; color: string }[];
  severityBreakdown: { name: string; value: number; color: string }[];
  monthlyTrend: { month: string; created: number; completed: number }[];
  totalTickets: number;
  openTickets: number;
  completedTickets: number;
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">{icon}</div>
          <div>
            <div className="text-2xl font-bold">{value}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function ReportingDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data: tickets, error: ticketErr } = await supabase
        .from('tickets')
        .select(`id, status, severity, created_at, completed_at,
          building:buildings!inner(id, name, address_line1, company_id,
            company:companies(name))`);
      if (ticketErr) throw new Error(ticketErr.message);

      const all = (tickets ?? []) as unknown as Array<{
        id: string; status: TicketStatus; severity: TicketSeverity;
        created_at: string; completed_at: string | null;
        building: { id: string; name: string | null; address_line1: string;
          company_id: string; company: { name: string } | null };
      }>;

      const totalTickets = all.length;
      const openTickets = all.filter(t => OPEN_STATUSES.includes(t.status)).length;
      const completedTickets = all.filter(t => t.status === 'completed' || t.status === 'invoiced').length;

      const resolved = all.filter(t => t.completed_at);
      const avgResolutionDays = resolved.length > 0
        ? Math.round(resolved.reduce((acc, t) => {
            return acc + (new Date(t.completed_at!).getTime() - new Date(t.created_at).getTime()) / 86400000;
          }, 0) / resolved.length * 10) / 10
        : 0;
      const completionRate = totalTickets > 0 ? Math.round((completedTickets / totalTickets) * 1000) / 10 : 0;

      // By building
      const bMap = new Map<string, { name: string; open: number; completed: number }>();
      for (const t of all) {
        const bName = t.building.name || t.building.address_line1;
        const e = bMap.get(t.building.id) || { name: bName, open: 0, completed: 0 };
        if (OPEN_STATUSES.includes(t.status)) e.open++;
        if (t.status === 'completed' || t.status === 'invoiced') e.completed++;
        bMap.set(t.building.id, e);
      }

      // By company
      const cMap = new Map<string, { name: string; open: number; total: number }>();
      for (const t of all) {
        const cName = t.building.company?.name || 'Unknown';
        const e = cMap.get(t.building.company_id) || { name: cName, open: 0, total: 0 };
        e.total++; if (OPEN_STATUSES.includes(t.status)) e.open++;
        cMap.set(t.building.company_id, e);
      }

      // Status pie
      const sCounts = new Map<TicketStatus, number>();
      for (const t of all) sCounts.set(t.status, (sCounts.get(t.status) || 0) + 1);
      const statusBreakdown = Array.from(sCounts.entries()).map(([s, c]) => ({
        name: STATUS_LABELS[s], value: c, color: STATUS_COLORS[s] || '#94a3b8',
      }));

      // Severity pie
      const sevCounts = new Map<TicketSeverity, number>();
      for (const t of all) sevCounts.set(t.severity, (sevCounts.get(t.severity) || 0) + 1);
      const severityBreakdown = Array.from(sevCounts.entries()).map(([s, c]) => ({
        name: SEVERITY_LABELS[s], value: c, color: SEVERITY_COLORS[s],
      }));

      // Monthly trend (6 months)
      const now = new Date();
      const monthlyTrend: DashboardData['monthlyTrend'] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        const yr = d.getFullYear(), mo = d.getMonth();
        monthlyTrend.push({
          month: label,
          created: all.filter(t => { const c = new Date(t.created_at); return c.getFullYear() === yr && c.getMonth() === mo; }).length,
          completed: all.filter(t => { if (!t.completed_at) return false; const c = new Date(t.completed_at); return c.getFullYear() === yr && c.getMonth() === mo; }).length,
        });
      }

      setData({
        ticketsByBuilding: Array.from(bMap.values()).sort((a, b) => b.open - a.open).slice(0, 10),
        ticketsByCompany: Array.from(cMap.values()).sort((a, b) => b.total - a.total).slice(0, 10),
        avgResolutionDays, completionRate, statusBreakdown, severityBreakdown,
        monthlyTrend, totalTickets, openTickets, completedTickets,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Loading />;
  if (!data) return <ErrorBanner message={error} />;

  return (
    <PageTransition>
      <div className="mb-4">
        <h2 className="text-lg font-bold tracking-tight">Reporting Dashboard</h2>
        <p className="text-sm text-muted-foreground">Performance overview and analytics</p>
      </div>
      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <MetricCard icon={<BarChart3 className="h-5 w-5 text-primary" />} label="Total Tickets" value={data.totalTickets} />
        <MetricCard icon={<TrendingUp className="h-5 w-5 text-orange-500" />} label="Open Tickets" value={data.openTickets} />
        <MetricCard icon={<Clock className="h-5 w-5 text-purple-500" />} label="Avg Resolution" value={`${data.avgResolutionDays}d`} />
        <MetricCard icon={<CheckCircle2 className="h-5 w-5 text-green-500" />} label="Completion Rate" value={`${data.completionRate}%`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Monthly Trend */}
        <Card><CardContent className="p-4">
          <div className="text-sm font-semibold mb-3">Monthly Trend</div>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={data.monthlyTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="created" stroke="#3b82f6" name="Created" strokeWidth={2} />
              <Line type="monotone" dataKey="completed" stroke="#22c55e" name="Completed" strokeWidth={2} />
              <Legend />
            </LineChart>
          </ResponsiveContainer>
        </CardContent></Card>

        {/* Status Breakdown Pie */}
        <Card><CardContent className="p-4">
          <div className="text-sm font-semibold mb-3">Status Breakdown</div>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={data.statusBreakdown} cx="50%" cy="50%" innerRadius={50} outerRadius={90} dataKey="value">
                {data.statusBreakdown.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </CardContent></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Open by Building */}
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 text-sm font-semibold mb-3">
            <Building2 className="h-4 w-4 text-muted-foreground" /> Open Tickets by Building
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.ticketsByBuilding} layout="vertical" margin={{ left: 20 }}>
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={120} />
              <Tooltip />
              <Bar dataKey="open" fill="#f97316" name="Open" />
              <Bar dataKey="completed" fill="#22c55e" name="Completed" />
              <Legend />
            </BarChart>
          </ResponsiveContainer>
        </CardContent></Card>

        {/* By Company */}
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 text-sm font-semibold mb-3">
            <Briefcase className="h-4 w-4 text-muted-foreground" /> Tickets by Company
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.ticketsByCompany} layout="vertical" margin={{ left: 20 }}>
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={120} />
              <Tooltip />
              <Bar dataKey="open" fill="#f97316" name="Open" />
              <Bar dataKey="total" fill="#3b82f6" name="Total" />
              <Legend />
            </BarChart>
          </ResponsiveContainer>
        </CardContent></Card>
      </div>

      {/* Severity Breakdown */}
      <Card className="mb-6"><CardContent className="p-4">
        <div className="text-sm font-semibold mb-3">Severity Distribution</div>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie data={data.severityBreakdown} cx="50%" cy="50%" outerRadius={70} dataKey="value" label>
              {data.severityBreakdown.map((e, i) => <Cell key={i} fill={e.color} />)}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </CardContent></Card>
    </PageTransition>
  );
}
