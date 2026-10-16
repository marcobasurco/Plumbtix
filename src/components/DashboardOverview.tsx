// =============================================================================
// Work Orders — Dashboard Overview
// =============================================================================
// Rich overview page with metric cards, charts, and recent activity.
// Uses Recharts for data visualization and Lucide icons.
//
// UX rules applied here (see the October 2026 UX review):
//   • "Report a problem" is the first thing on the page for every role —
//     on a phone it must not sit below the charts.
//   • Every clickable card is a real <button> (keyboard + screen readers).
//   • Colors come from design-system tokens so dark mode is readable.
//   • Load failures explain themselves and offer "Try again".
// =============================================================================

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { fetchDashboardMetrics, type DashboardMetrics } from '@/lib/dashboard';
import {
  STATUS_LABELS,
  SEVERITY_LABELS,
  ISSUE_TYPE_LABELS,
  type TicketStatus,
  type TicketSeverity,
  type IssueType,
} from '@shared/types/enums';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  TicketCheck, AlertTriangle, Building2, LayoutGrid,
  TrendingUp, Clock, ArrowRight, Zap, CircleDot, Plus,
} from 'lucide-react';
import { useRealtimeTickets } from '@/hooks/useRealtime';
import { Loading } from '@/components/Loading';
import { ErrorBanner, friendlyError } from '@/components/ErrorBanner';
import { Button } from '@/components/ui/button';

// ---------------------------------------------------------------------------
// Chart colors (data colors, deliberately fixed in both themes)
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<TicketStatus, string> = {
  new: '#3b82f6',
  needs_info: '#f59e0b',
  scheduled: '#8b5cf6',
  dispatched: '#06b6d4',
  on_site: '#10b981',
  in_progress: '#f97316',
  waiting_approval: '#ec4899',
  completed: '#22c55e',
  invoiced: '#6366f1',
  cancelled: '#94a3b8',
};

const SEVERITY_COLORS: Record<TicketSeverity, string> = {
  emergency: '#ef4444',
  urgent: '#f59e0b',
  standard: '#3b82f6',
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface MetricCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  accent: string;
  subtitle?: string;
  onClick?: () => void;
}

function MetricCard({ label, value, icon, accent, subtitle, onClick }: MetricCardProps) {
  const content = (
    <>
      <div className="metric-card-icon" style={{ background: accent + '14', color: accent }} aria-hidden="true">
        {icon}
      </div>
      <div className="metric-card-content">
        <div className="metric-card-value">{value}</div>
        <div className="metric-card-label">{label}</div>
        {subtitle && <div className="metric-card-subtitle">{subtitle}</div>}
      </div>
      {onClick && (
        <div className="metric-card-arrow" aria-hidden="true">
          <ArrowRight size={16} />
        </div>
      )}
    </>
  );
  if (!onClick) return <div className="metric-card">{content}</div>;
  return (
    <button type="button" className="metric-card card-button" onClick={onClick}>
      {content}
    </button>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function StatusDot({ status }: { status: TicketStatus }) {
  const color = STATUS_COLORS[status] ?? '#94a3b8';
  return (
    <span className="badge" style={{
      background: color + '18',
      color,
      fontSize: 'var(--text-xs)',
      padding: '2px 10px',
      gap: '5px',
    }}>
      <CircleDot size={10} aria-hidden="true" />
      {STATUS_LABELS[status]}
    </span>
  );
}

function SeverityIndicator({ severity }: { severity: TicketSeverity }) {
  const color = SEVERITY_COLORS[severity];
  return (
    <span className="badge" style={{
      background: color + '18',
      color,
      fontSize: 'var(--text-xs)',
      padding: '2px 10px',
    }}>
      {severity === 'emergency' && <Zap size={10} aria-hidden="true" />}
      {SEVERITY_LABELS[severity]}
    </span>
  );
}

// Custom tooltip for bar chart
function BarTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--slate-800)', color: '#fff', padding: '8px 12px',
      borderRadius: 'var(--radius-md)', fontSize: 'var(--text-xs)', fontWeight: 600,
      boxShadow: 'var(--shadow-lg)',
    }}>
      {label}: {payload[0].value} work order{payload[0].value !== 1 ? 's' : ''}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function DashboardOverview() {
  const navigate = useNavigate();
  const { role, profile } = useAuth();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setMetrics(await fetchDashboardMetrics());
    } catch (e) {
      console.error('[dashboard] load failed:', e);
      setError(friendlyError(e, "Couldn't load your dashboard."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Realtime: auto-refresh metrics when work orders change
  useRealtimeTickets(load, !loading);

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there';
  const basePath = role === 'proroto_admin' ? '/admin' : role === 'resident' ? '/my' : '/dashboard';
  const canReport = role !== null; // every signed-in role can report a problem

  if (loading) return <Loading message="Loading dashboard…" />;
  if (error) return <ErrorBanner message={error} onRetry={load} />;
  if (!metrics) return null;

  const hasEmergencies = metrics.emergencyTickets > 0;

  return (
    <div className="animate-in">
      {/* Greeting + primary action */}
      <div className="page-title-bar" style={{ marginBottom: 20 }}>
        <div>
          <h2 className="page-title" style={{ fontSize: 'var(--text-2xl)' }}>
            Good {getTimeOfDay()}, {firstName}
          </h2>
          <p className="page-subtitle">
            {hasEmergencies
              ? `${metrics.emergencyTickets} emergency work order${metrics.emergencyTickets === 1 ? '' : 's'} need${metrics.emergencyTickets === 1 ? 's' : ''} attention.`
              : `${metrics.openTickets} open work order${metrics.openTickets === 1 ? '' : 's'} across your buildings.`}
          </p>
        </div>
        {canReport && (
          <Button size="lg" className="w-full sm:w-auto" onClick={() => navigate(`${basePath}/tickets/new`)}>
            <Plus className="h-5 w-5" aria-hidden="true" /> Report a problem
          </Button>
        )}
      </div>

      {/* Metric cards */}
      <div className="metric-grid">
        <MetricCard
          label="Open work orders"
          value={metrics.openTickets}
          icon={<TicketCheck size={22} />}
          accent="#3b82f6"
          subtitle={`${metrics.totalTickets} total`}
          onClick={() => navigate(`${basePath}/tickets?status=open`)}
        />
        <MetricCard
          label="Emergencies"
          value={metrics.emergencyTickets}
          icon={<AlertTriangle size={22} />}
          accent={hasEmergencies ? '#ef4444' : '#22c55e'}
          subtitle={hasEmergencies ? 'Needs attention' : 'All clear'}
          onClick={() => navigate(`${basePath}/tickets?severity=emergency`)}
        />
        <MetricCard
          label="Completed this month"
          value={metrics.completedThisMonth}
          icon={<TrendingUp size={22} />}
          accent="#22c55e"
          onClick={() => navigate(`${basePath}/tickets?status=completed`)}
        />
        <MetricCard
          label="Buildings"
          value={metrics.totalBuildings}
          icon={<Building2 size={22} />}
          accent="#8b5cf6"
          subtitle={`${metrics.totalSpaces} locations`}
          onClick={() => navigate(`${basePath}/buildings`)}
        />
      </div>

      {/* Recent work orders + severity breakdown */}
      <div className="dashboard-bottom">
        {/* Recent work orders */}
        <div className="card">
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Clock size={16} className="text-muted-foreground" aria-hidden="true" />
              <span style={{ fontWeight: 600, fontSize: 'var(--text-md)' }}>Recent work orders</span>
            </div>
            <Button variant="link" size="sm" onClick={() => navigate(`${basePath}/tickets`)}>
              View all <ArrowRight size={13} style={{ marginLeft: 2 }} aria-hidden="true" />
            </Button>
          </div>
          {metrics.recentTickets.length > 0 ? (
            <div style={{ padding: 0 }}>
              {metrics.recentTickets.map((t, i) => (
                <button
                  type="button"
                  key={t.id}
                  className="recent-ticket-row card-button"
                  onClick={() => navigate(`${basePath}/tickets/${t.id}`)}
                  style={i === metrics.recentTickets.length - 1 ? { borderBottom: 'none' } : undefined}
                  aria-label={`Work order #${t.ticket_number}, ${ISSUE_TYPE_LABELS[t.issue_type as IssueType] ?? t.issue_type}, ${SEVERITY_LABELS[t.severity]}, ${STATUS_LABELS[t.status]}`}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                    <span className="text-mono text-foreground" style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>
                      #{t.ticket_number}
                    </span>
                    <span className="truncate text-muted-foreground" style={{ fontSize: 'var(--text-sm)' }}>
                      {ISSUE_TYPE_LABELS[t.issue_type as IssueType] ?? t.issue_type}
                    </span>
                  </div>
                  {/* minWidth:0 (not flexShrink:0): a rigid cluster made this row's
                      min-content wider than phone screens, inflating the shared
                      .dashboard-bottom grid track — every sibling section bled off-screen.
                      Badges stay rigid; the date absorbs the squeeze via ellipsis. */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <SeverityIndicator severity={t.severity} />
                    <StatusDot status={t.status} />
                    <span className="text-xs text-muted"
                      style={{ textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden',
                               textOverflow: 'ellipsis', minWidth: 0, flexShrink: 1 }}>
                      {formatDate(t.created_at)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="card-body">
              <p className="text-muted text-sm" style={{ marginBottom: 12 }}>
                No work orders yet. Report the first plumbing problem and it will show up here.
              </p>
              {canReport && (
                <Button variant="outline" size="sm" onClick={() => navigate(`${basePath}/tickets/new`)}>
                  <Plus className="h-4 w-4" aria-hidden="true" /> Report a problem
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Severity breakdown mini cards */}
        <div className="severity-sidebar">
          <h3 className="text-sm font-bold text-foreground" style={{ marginBottom: 2 }}>By severity</h3>
          {(['emergency', 'urgent', 'standard'] as TicketSeverity[]).map((sev) => {
            const item = metrics.severityBreakdown.find((s) => s.severity === sev);
            const count = item?.count ?? 0;
            const total = metrics.totalTickets || 1;
            const pct = Math.round((count / total) * 100);
            const color = SEVERITY_COLORS[sev];
            return (
              <button
                type="button"
                key={sev}
                className="severity-card card-button"
                onClick={() => navigate(`${basePath}/tickets?severity=${sev}`)}
                aria-label={`${SEVERITY_LABELS[sev]}: ${count} work orders, ${pct}% of total`}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span className="text-foreground" style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>
                    {SEVERITY_LABELS[sev]}
                  </span>
                  <span style={{ fontWeight: 700, fontSize: 'var(--text-lg)', color, letterSpacing: '-0.02em' }}>
                    {count}
                  </span>
                </div>
                <div className="severity-bar-track" aria-hidden="true">
                  <div
                    className="severity-bar-fill"
                    style={{ width: `${Math.max(pct, 2)}%`, background: color }}
                  />
                </div>
                <div className="text-xs text-muted" style={{ marginTop: 4 }}>{pct}% of total</div>
              </button>
            );
          })}

          {/* Company Analytics (proroto_admin only) */}
          {role === 'proroto_admin' && metrics.companyBreakdown.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <h3 className="text-sm font-bold text-foreground" style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <LayoutGrid size={14} aria-hidden="true" /> Company breakdown
              </h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr className="border-b-2 border-border">
                      <th scope="col" className="text-muted-foreground" style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600 }}>Company</th>
                      <th scope="col" className="text-muted-foreground" style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600 }}>Bldgs</th>
                      <th scope="col" className="text-muted-foreground" style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600 }}>Locations</th>
                      <th scope="col" className="text-muted-foreground" style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600 }}>Users</th>
                      <th scope="col" className="text-muted-foreground" style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600 }}>Open</th>
                      <th scope="col" className="text-muted-foreground" style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600 }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.companyBreakdown.map((c) => (
                      <tr key={c.company_id} className="border-b border-border">
                        <td className="text-foreground" style={{ padding: '6px 8px', fontWeight: 500 }}>{c.company_name}</td>
                        <td className="text-muted-foreground" style={{ textAlign: 'right', padding: '6px 8px' }}>{c.building_count}</td>
                        <td className="text-muted-foreground" style={{ textAlign: 'right', padding: '6px 8px' }}>{c.space_count}</td>
                        <td className="text-muted-foreground" style={{ textAlign: 'right', padding: '6px 8px' }}>{c.user_count}</td>
                        <td className={c.open_tickets > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'} style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600 }}>{c.open_tickets}</td>
                        <td className="text-muted-foreground" style={{ textAlign: 'right', padding: '6px 8px' }}>{c.total_tickets}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Quick actions */}
          <div style={{ marginTop: 20 }}>
            <h3 className="text-sm font-bold text-foreground" style={{ marginBottom: 12 }}>
              Quick actions
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Button variant="outline" size="sm" className="w-full" onClick={() => navigate(`${basePath}/tickets`)}>
                <TicketCheck size={14} aria-hidden="true" /> View work orders
              </Button>
              <Button variant="outline" size="sm" className="w-full" onClick={() => navigate(`${basePath}/buildings`)}>
                <Building2 size={14} aria-hidden="true" /> View buildings
              </Button>
              {role === 'proroto_admin' && (
                <Button variant="outline" size="sm" className="w-full" onClick={() => navigate('/admin/companies')}>
                  <LayoutGrid size={14} aria-hidden="true" /> Manage companies
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Charts row — after the actionable content; on a phone these are
          reference material, not the reason the person opened the app */}
      <div className="dashboard-charts" style={{ marginTop: 24, marginBottom: 0 }}>
        {/* Volume chart */}
        <div className="card chart-card">
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <LayoutGrid size={16} className="text-muted-foreground" aria-hidden="true" />
              <span style={{ fontWeight: 600, fontSize: 'var(--text-md)' }}>Work order volume</span>
            </div>
            <span className="text-xs text-muted">Last 6 months</span>
          </div>
          <div className="card-body" style={{ height: 260, padding: '12px 16px 4px' }}>
            {metrics.ticketsByMonth.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.ticketsByMonth} barCategoryGap="20%">
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    axisLine={{ stroke: '#e2e8f0' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip content={<BarTooltip />} cursor={{ fill: 'rgba(59, 130, 246, 0.06)' }} />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={48}>
                    {metrics.ticketsByMonth.map((_, idx) => (
                      <Cell key={idx} fill={idx === metrics.ticketsByMonth.length - 1 ? '#3b82f6' : '#dbeafe'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="chart-empty">No work orders yet</div>
            )}
          </div>
        </div>

        {/* Status breakdown pie */}
        <div className="card chart-card">
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CircleDot size={16} className="text-muted-foreground" aria-hidden="true" />
              <span style={{ fontWeight: 600, fontSize: 'var(--text-md)' }}>By status</span>
            </div>
          </div>
          <div className="card-body" style={{ height: 260, padding: '4px 8px' }}>
            {metrics.statusBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={metrics.statusBreakdown}
                    dataKey="count"
                    nameKey="status"
                    cx="50%"
                    cy="45%"
                    innerRadius={48}
                    outerRadius={80}
                    paddingAngle={2}
                    strokeWidth={0}
                  >
                    {metrics.statusBreakdown.map((entry) => (
                      <Cell
                        key={entry.status}
                        fill={STATUS_COLORS[entry.status] ?? '#94a3b8'}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val: number, name: string) => [val, STATUS_LABELS[name as TicketStatus] ?? name]}
                    contentStyle={{
                      background: 'var(--slate-800)', border: 'none', borderRadius: 8,
                      color: '#fff', fontSize: 12, fontWeight: 600,
                    }}
                  />
                  <Legend
                    formatter={(val: string) => STATUS_LABELS[val as TicketStatus] ?? val}
                    wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="chart-empty">No work orders yet</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTimeOfDay(): string {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}
