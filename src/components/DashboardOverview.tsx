// =============================================================================
// PlumbTix — Dashboard Overview
// =============================================================================
// Rich overview page with metric cards, charts, and recent activity.
// Uses Recharts for data visualization and Lucide icons.
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
  TrendingUp, Clock, ArrowRight, Zap, CircleDot,
} from 'lucide-react';
import { Loading } from '@/components/Loading';
import { ErrorBanner } from '@/components/ErrorBanner';

// ---------------------------------------------------------------------------
// Color palette for charts
// ---------------------------------------------------------------------------

const STATUS_COLORS: Partial<Record<TicketStatus, string>> = {
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
  return (
    <div className="metric-card" onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined}>
      <div className="metric-card-icon" style={{ background: accent + '14', color: accent }}>
        {icon}
      </div>
      <div className="metric-card-content">
        <div className="metric-card-value">{value}</div>
        <div className="metric-card-label">{label}</div>
        {subtitle && <div className="metric-card-subtitle">{subtitle}</div>}
      </div>
      {onClick && (
        <div className="metric-card-arrow">
          <ArrowRight size={16} />
        </div>
      )}
    </div>
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
      <CircleDot size={10} />
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
      {severity === 'emergency' && <Zap size={10} />}
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
      {label}: {payload[0].value} ticket{payload[0].value !== 1 ? 's' : ''}
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
      setError(e instanceof Error ? e.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Loading message="Loading dashboard…" />;
  if (error) return <ErrorBanner message={error} />;
  if (!metrics) return null;

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there';
  const basePath = role === 'proroto_admin' ? '/admin' : '/dashboard';

  return (
    <div className="animate-in">
      {/* Greeting */}
      <div style={{ marginBottom: 28 }}>
        <h2 className="page-title" style={{ fontSize: 'var(--text-2xl)' }}>
          Good {getTimeOfDay()}, {firstName}
        </h2>
        <p className="page-subtitle">
          Here's what's happening across your properties today.
        </p>
      </div>

      {/* Metric cards */}
      <div className="metric-grid">
        <MetricCard
          label="Open Tickets"
          value={metrics.openTickets}
          icon={<TicketCheck size={22} />}
          accent="#3b82f6"
          subtitle={`${metrics.totalTickets} total`}
          onClick={() => navigate(`${basePath}/tickets`)}
        />
        <MetricCard
          label="Emergencies"
          value={metrics.emergencyTickets}
          icon={<AlertTriangle size={22} />}
          accent={metrics.emergencyTickets > 0 ? '#ef4444' : '#22c55e'}
          subtitle={metrics.emergencyTickets > 0 ? 'Needs attention' : 'All clear'}
        />
        <MetricCard
          label="Completed This Month"
          value={metrics.completedThisMonth}
          icon={<TrendingUp size={22} />}
          accent="#22c55e"
        />
        <MetricCard
          label="Buildings"
          value={metrics.totalBuildings}
          icon={<Building2 size={22} />}
          accent="#8b5cf6"
          subtitle={`${metrics.totalSpaces} spaces`}
          onClick={() => navigate(`${basePath}/buildings`)}
        />
      </div>

      {/* Charts row */}
      <div className="dashboard-charts">
        {/* Ticket volume chart */}
        <div className="card chart-card">
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <LayoutGrid size={16} style={{ color: 'var(--slate-400)' }} />
              <span style={{ fontWeight: 600, fontSize: 'var(--text-md)' }}>Ticket Volume</span>
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
              <div className="chart-empty">No ticket data yet</div>
            )}
          </div>
        </div>

        {/* Status breakdown pie */}
        <div className="card chart-card">
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CircleDot size={16} style={{ color: 'var(--slate-400)' }} />
              <span style={{ fontWeight: 600, fontSize: 'var(--text-md)' }}>By Status</span>
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
              <div className="chart-empty">No ticket data yet</div>
            )}
          </div>
        </div>
      </div>

      {/* Recent tickets + severity breakdown */}
      <div className="dashboard-bottom">
        {/* Recent tickets */}
        <div className="card">
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Clock size={16} style={{ color: 'var(--slate-400)' }} />
              <span style={{ fontWeight: 600, fontSize: 'var(--text-md)' }}>Recent Tickets</span>
            </div>
            <button className="btn-link text-sm" onClick={() => navigate(`${basePath}/tickets`)}>
              View all <ArrowRight size={13} style={{ marginLeft: 2 }} />
            </button>
          </div>
          {metrics.recentTickets.length > 0 ? (
            <div style={{ padding: 0 }}>
              {metrics.recentTickets.map((t, i) => (
                <div
                  key={t.id}
                  className="recent-ticket-row"
                  onClick={() => navigate(`${basePath}/tickets/${t.id}`)}
                  style={i === metrics.recentTickets.length - 1 ? { borderBottom: 'none' } : undefined}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                    <span className="text-mono" style={{ fontWeight: 700, color: 'var(--slate-900)', fontSize: 'var(--text-sm)' }}>
                      #{t.ticket_number}
                    </span>
                    <span className="truncate" style={{ fontSize: 'var(--text-sm)', color: 'var(--slate-600)' }}>
                      {ISSUE_TYPE_LABELS[t.issue_type as IssueType] ?? t.issue_type}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <span className="text-xs text-muted" style={{ display: 'none' }}>
                      {/* hidden on mobile via CSS class if needed */}
                      {t.building_name}
                    </span>
                    <SeverityIndicator severity={t.severity} />
                    <StatusDot status={t.status} />
                    <span className="text-xs text-muted" style={{ minWidth: 80, textAlign: 'right' }}>
                      {formatDate(t.created_at)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="card-body">
              <p className="text-muted text-sm">No tickets yet. Create your first ticket to get started.</p>
            </div>
          )}
        </div>

        {/* Severity breakdown mini cards */}
        <div className="severity-sidebar">
          <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--slate-700)', marginBottom: 12 }}>
            By Severity
          </h3>
          {(['emergency', 'urgent', 'standard'] as TicketSeverity[]).map((sev) => {
            const item = metrics.severityBreakdown.find(s => s.severity === sev);
            const count = item?.count ?? 0;
            const total = metrics.totalTickets || 1;
            const pct = Math.round((count / total) * 100);
            const color = SEVERITY_COLORS[sev];
            return (
              <div key={sev} className="severity-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--slate-700)' }}>
                    {SEVERITY_LABELS[sev]}
                  </span>
                  <span style={{ fontWeight: 700, fontSize: 'var(--text-lg)', color, letterSpacing: '-0.02em' }}>
                    {count}
                  </span>
                </div>
                <div className="severity-bar-track">
                  <div
                    className="severity-bar-fill"
                    style={{ width: `${Math.max(pct, 2)}%`, background: color }}
                  />
                </div>
                <div className="text-xs text-muted" style={{ marginTop: 4 }}>{pct}% of total</div>
              </div>
            );
          })}

          {/* Quick actions */}
          {(role === 'proroto_admin' || role === 'pm_admin') && (
            <div style={{ marginTop: 20 }}>
              <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--slate-700)', marginBottom: 12 }}>
                Quick Actions
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <button className="btn btn-primary btn-sm w-full" onClick={() => navigate(`${basePath}/tickets/new`)}>
                  <TicketCheck size={14} /> New Ticket
                </button>
                <button className="btn btn-secondary btn-sm w-full" onClick={() => navigate(`${basePath}/buildings`)}>
                  <Building2 size={14} /> View Buildings
                </button>
                {role === 'proroto_admin' && (
                  <button className="btn btn-secondary btn-sm w-full" onClick={() => navigate('/admin/companies')}>
                    <LayoutGrid size={14} /> Manage Companies
                  </button>
                )}
              </div>
            </div>
          )}
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
