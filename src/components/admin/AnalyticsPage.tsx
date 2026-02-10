// =============================================================================
// PlumbTix — Analytics Page (proroto_admin only)
// =============================================================================
// Platform-wide SaaS metrics: MRR, company usage, subscription tiers,
// ticket trends, issue type breakdown, and per-company utilization.
// =============================================================================

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchPlatformSummary,
  fetchCompanyAnalytics,
  type PlatformSummary,
  type CompanyAnalyticsRow,
} from '@/lib/analytics';
import { ISSUE_TYPE_LABELS, STATUS_LABELS, SEVERITY_LABELS } from '@shared/types/enums';
import type { TicketStatus, TicketSeverity, IssueType } from '@shared/types/enums';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area,
} from 'recharts';
import {
  DollarSign, Building2, Users2, Ticket, TrendingUp,
  ArrowUpRight, Shield, AlertTriangle, BarChart3,
} from 'lucide-react';
import { useRealtime } from '@/hooks/useRealtime';
import { PageTransition } from '@/components/PageTransition';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorBanner } from '@/components/ErrorBanner';

// ---------------------------------------------------------------------------
// Color palette
// ---------------------------------------------------------------------------

const TIER_COLORS: Record<string, string> = {
  free: '#94a3b8', starter: '#3b82f6', professional: '#8b5cf6', enterprise: '#f59e0b',
};
const TIER_LABELS: Record<string, string> = {
  free: 'Free', starter: 'Starter', professional: 'Professional', enterprise: 'Enterprise',
};
const SUB_STATUS_COLORS: Record<string, string> = {
  active: '#22c55e', trialing: '#3b82f6', past_due: '#f59e0b', cancelled: '#94a3b8',
};
const SEVERITY_COLORS: Record<TicketSeverity, string> = {
  emergency: '#ef4444', urgent: '#f59e0b', standard: '#3b82f6',
};
const PIE_COLORS = ['#3b82f6', '#f59e0b', '#8b5cf6', '#06b6d4', '#10b981', '#f97316', '#ec4899', '#22c55e', '#6366f1', '#94a3b8'];

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function AnalyticsSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-24" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Skeleton className="h-72" /><Skeleton className="h-72" />
      </div>
      <Skeleton className="h-96" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function KPICard({ label, value, subtext, icon, color }: {
  label: string; value: string | number; subtext?: string;
  icon: React.ReactNode; color: string;
}) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</div>
            <div className="text-2xl font-bold mt-1 tabular-nums">{value}</div>
            {subtext && <div className="text-xs text-muted-foreground mt-0.5">{subtext}</div>}
          </div>
          <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0"
               style={{ background: color + '14', color }}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ChartTooltip({ active, payload, label }: {
  active?: boolean; payload?: Array<{ value: number; name?: string }>; label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-card px-3 py-2 shadow-md text-xs">
      <div className="font-semibold mb-1">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="text-muted-foreground">{p.name ?? 'Count'}: {p.value}</div>
      ))}
    </div>
  );
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function tierBadgeVariant(tier: string | null): 'default' | 'secondary' | 'outline' | 'info' | 'urgent' | 'success' | 'warning' {
  if (tier === 'enterprise') return 'warning';
  if (tier === 'professional') return 'info';
  if (tier === 'starter') return 'success';
  return 'secondary';
}

function subStatusBadgeVariant(status: string | null): 'default' | 'secondary' | 'outline' | 'info' | 'urgent' | 'success' | 'warning' | 'destructive' {
  if (status === 'active') return 'success';
  if (status === 'trialing') return 'info';
  if (status === 'past_due') return 'warning';
  return 'secondary';
}

function utilPct(current: number, max: number | null): { pct: number; color: string; label: string } {
  if (max === null || max === 0) return { pct: 0, color: '#22c55e', label: '∞' };
  const pct = Math.round((current / max) * 100);
  const color = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#22c55e';
  return { pct, color, label: `${pct}%` };
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AnalyticsPage() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<PlatformSummary | null>(null);
  const [companies, setCompanies] = useState<CompanyAnalyticsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, c] = await Promise.all([
        fetchPlatformSummary(),
        fetchCompanyAnalytics(),
      ]);
      setSummary(s);
      setCompanies(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Realtime: refresh when tickets or subscriptions change
  useRealtime('tickets', load, { enabled: !loading });
  useRealtime('company_subscriptions', load, { enabled: !loading });

  if (loading) return <PageTransition><AnalyticsSkeleton /></PageTransition>;
  if (error) return <ErrorBanner message={error} />;
  if (!summary) return null;

  // Prepare issue type chart data
  const issueChartData = summary.top_issue_types.map(({ issue_type, count }) => ({
    name: ISSUE_TYPE_LABELS[issue_type as IssueType] ?? issue_type.replace(/_/g, ' '),
    count,
  }));

  // Prepare severity pie data
  const sevPieData = summary.severity_breakdown.map(({ severity, count }) => ({
    name: SEVERITY_LABELS[severity],
    value: count,
    fill: SEVERITY_COLORS[severity],
  }));

  return (
    <PageTransition>
      <div className="mb-6">
        <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
          Platform Analytics
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          SaaS metrics, usage trends, and subscription overview
        </p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <KPICard
          label="MRR"
          value={formatCurrency(summary.mrr_cents)}
          subtext={`${summary.active_paid} paid · ${summary.active_trials} trials`}
          icon={<DollarSign className="h-5 w-5" />}
          color="#22c55e"
        />
        <KPICard
          label="Companies"
          value={summary.total_companies}
          subtext={`${summary.total_buildings} buildings`}
          icon={<Building2 className="h-5 w-5" />}
          color="#3b82f6"
        />
        <KPICard
          label="Users"
          value={summary.total_users}
          subtext={`${summary.total_spaces} spaces`}
          icon={<Users2 className="h-5 w-5" />}
          color="#8b5cf6"
        />
        <KPICard
          label="Open Tickets"
          value={summary.open_tickets}
          subtext={`${summary.total_tickets} total`}
          icon={<Ticket className="h-5 w-5" />}
          color="#f59e0b"
        />
        <KPICard
          label="This Month"
          value={summary.tickets_this_month}
          subtext={`~${summary.avg_tickets_per_company}/company`}
          icon={<TrendingUp className="h-5 w-5" />}
          color="#06b6d4"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Ticket Volume Trend */}
        <Card>
          <CardContent className="p-4">
            <div className="text-sm font-semibold mb-4 flex items-center gap-2">
              <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
              Ticket Volume (6 Months)
            </div>
            {summary.ticket_trend.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={summary.ticket_trend}>
                  <defs>
                    <linearGradient id="ticketFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="count" stroke="#3b82f6" fill="url(#ticketFill)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-52 text-sm text-muted-foreground">
                No ticket data yet
              </div>
            )}
          </CardContent>
        </Card>

        {/* Issue Type Breakdown */}
        <Card>
          <CardContent className="p-4">
            <div className="text-sm font-semibold mb-4 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              Issue Types
            </div>
            {issueChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={issueChartData} layout="vertical" margin={{ left: 10 }}>
                  <XAxis type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={130} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={20}>
                    {issueChartData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-52 text-sm text-muted-foreground">
                No data
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Severity Pie + Status Breakdown side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm font-semibold mb-3">Severity Distribution</div>
            {sevPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={sevPieData} dataKey="value" nameKey="name"
                       cx="50%" cy="50%" innerRadius={40} outerRadius={70}
                       paddingAngle={3} strokeWidth={0}>
                    {sevPieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Pie>
                  <Tooltip formatter={(val: number, name: string) => [val, name]}
                           contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">No data</div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardContent className="p-4">
            <div className="text-sm font-semibold mb-3">Status Breakdown</div>
            <div className="space-y-2">
              {summary.status_breakdown.map(({ status, count }) => {
                const pct = summary.total_tickets > 0 ? Math.round((count / summary.total_tickets) * 100) : 0;
                return (
                  <div key={status} className="flex items-center gap-3">
                    <div className="w-28 text-xs font-medium text-muted-foreground truncate">
                      {STATUS_LABELS[status]}
                    </div>
                    <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.max(pct, 2)}%`,
                          background: PIE_COLORS[Object.keys(STATUS_LABELS).indexOf(status) % PIE_COLORS.length],
                        }}
                      />
                    </div>
                    <div className="w-14 text-right text-xs font-semibold tabular-nums">
                      {count} <span className="text-muted-foreground font-normal">({pct}%)</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Company Table with Subscription + Utilization */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-semibold flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              Company Subscriptions &amp; Usage
            </div>
          </div>
          {companies.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">No companies</div>
          ) : (
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-sm" style={{ minWidth: 900 }}>
                <thead>
                  <tr className="border-b-2 border-border">
                    <th className="text-left py-2.5 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Company</th>
                    <th className="text-center py-2.5 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tier</th>
                    <th className="text-center py-2.5 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="text-right py-2.5 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Buildings</th>
                    <th className="text-right py-2.5 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Users</th>
                    <th className="text-right py-2.5 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Open</th>
                    <th className="text-right py-2.5 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">This Mo.</th>
                    <th className="text-right py-2.5 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total</th>
                    <th className="text-center py-2.5 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Utilization</th>
                  </tr>
                </thead>
                <tbody>
                  {companies.map((c) => {
                    const bldgUtil = utilPct(c.building_count, c.max_buildings);
                    const userUtil = utilPct(c.user_count, c.max_users);
                    const ticketUtil = utilPct(c.tickets_this_month, c.max_tickets_mo);
                    const worstPct = Math.max(bldgUtil.pct, userUtil.pct, ticketUtil.pct);
                    const worstColor = worstPct >= 90 ? '#ef4444' : worstPct >= 70 ? '#f59e0b' : '#22c55e';

                    return (
                      <tr
                        key={c.company_id}
                        className="border-b border-border hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => navigate(`/admin/companies/${c.company_id}`)}
                      >
                        <td className="py-2.5 px-3">
                          <div className="font-semibold">{c.company_name}</div>
                          <div className="text-xs text-muted-foreground font-mono">{c.slug}</div>
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <Badge variant={tierBadgeVariant(c.subscription_tier)}>
                            {TIER_LABELS[c.subscription_tier ?? 'free'] ?? c.subscription_tier}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <Badge variant={subStatusBadgeVariant(c.subscription_status)}>
                            {c.subscription_status ?? 'none'}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums">
                          <span className="font-semibold">{c.building_count}</span>
                          {c.max_buildings && (
                            <span className="text-muted-foreground text-xs">/{c.max_buildings}</span>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums">
                          <span className="font-semibold">{c.user_count}</span>
                          {c.max_users && (
                            <span className="text-muted-foreground text-xs">/{c.max_users}</span>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums">
                          <span className="font-semibold" style={{ color: c.open_tickets > 0 ? '#f59e0b' : undefined }}>
                            {c.open_tickets}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums font-semibold">
                          {c.tickets_this_month}
                          {c.max_tickets_mo && (
                            <span className="text-muted-foreground text-xs font-normal">/{c.max_tickets_mo}</span>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums text-muted-foreground">{c.total_tickets}</td>
                        <td className="py-2.5 px-2">
                          <div className="w-full max-w-[80px] mx-auto">
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{ width: `${Math.max(worstPct, 3)}%`, background: worstColor }}
                              />
                            </div>
                            <div className="text-[10px] text-center mt-0.5 tabular-nums" style={{ color: worstColor }}>
                              {worstPct > 0 ? `${worstPct}%` : '—'}
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </PageTransition>
  );
}
