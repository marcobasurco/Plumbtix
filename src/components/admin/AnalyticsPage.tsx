// =============================================================================
// Work Orders — Analytics Page (Role-Aware, Mobile-First)
// =============================================================================
// Admin: platform-wide → drill into company → drill into building
// PM:    own company → drill into building
// Responsive: iPhone-optimized cards, charts, and building table
// =============================================================================

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth';
import {
  fetchAnalyticsSummary,
  fetchCompanyAnalytics,
  fetchBuildingAnalytics,
  type AnalyticsSummary,
  type CompanyAnalyticsRow,
  type BuildingAnalyticsRow,
} from '@/lib/analytics';
import { fetchCompanyOptions, type CompanyOption } from '@/lib/admin';
import { ISSUE_TYPE_LABELS, STATUS_LABELS, SEVERITY_LABELS } from '@shared/types/enums';
import type { TicketSeverity, IssueType } from '@shared/types/enums';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area,
} from 'recharts';
import {
  Building2, Users2, Ticket, TrendingUp,
  ArrowUpRight, AlertTriangle, BarChart3,
  ChevronRight, MapPin, Home, Search, X,
} from 'lucide-react';
import { useRealtime } from '@/hooks/useRealtime';
import { PageTransition } from '@/components/PageTransition';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Button } from '@/components/ui/button';

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

const SEVERITY_COLORS: Record<TicketSeverity, string> = {
  emergency: '#ef4444', urgent: '#f59e0b', standard: '#3b82f6',
};
const SEVERITY_BADGE: Record<string, 'destructive' | 'warning' | 'secondary'> = {
  emergency: 'destructive', urgent: 'warning', standard: 'secondary',
};
const PIE_COLORS = ['#3b82f6', '#f59e0b', '#8b5cf6', '#06b6d4', '#10b981', '#f97316', '#ec4899', '#22c55e', '#6366f1', '#94a3b8'];

// ---------------------------------------------------------------------------
// KPI Card (mobile-optimized)
// ---------------------------------------------------------------------------

function KPICard({ label, value, subtext, icon, color }: {
  label: string; value: string | number; subtext?: string;
  icon: React.ReactNode; color: string;
}) {
  return (
    <div className="analytics-kpi">
      <div className="analytics-kpi-icon" style={{ background: color + '14', color }}>{icon}</div>
      <div className="analytics-kpi-body">
        <div className="analytics-kpi-value">{value}</div>
        <div className="analytics-kpi-label">{label}</div>
        {subtext && <div className="analytics-kpi-sub">{subtext}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chart tooltip
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Building card (mobile)
// ---------------------------------------------------------------------------

function BuildingCard({ b, isSelected, onSelect }: {
  b: BuildingAnalyticsRow; isSelected: boolean; onSelect: () => void;
}) {
  return (
    <div className={`analytics-building-card ${isSelected ? 'selected' : ''}`} onClick={onSelect}>
      <div className="analytics-building-top">
        <div className="analytics-building-info">
          <div className="analytics-building-name">
            {b.building_name || b.address}
          </div>
          {b.building_name && (
            <div className="analytics-building-addr">
              <MapPin className="h-3 w-3 shrink-0" /> {b.address}
            </div>
          )}
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
      </div>
      <div className="analytics-building-stats">
        <div className="analytics-building-stat">
          <span className="analytics-stat-num">{b.total_tickets}</span>
          <span className="analytics-stat-lbl">Total</span>
        </div>
        <div className="analytics-building-stat">
          <span className="analytics-stat-num" style={{ color: b.open_tickets > 0 ? '#f59e0b' : undefined }}>
            {b.open_tickets}
          </span>
          <span className="analytics-stat-lbl">Open</span>
        </div>
        <div className="analytics-building-stat">
          <span className="analytics-stat-num">{b.tickets_this_month}</span>
          <span className="analytics-stat-lbl">This Mo.</span>
        </div>
        <div className="analytics-building-stat">
          <span className="analytics-stat-num">{b.unit_count}</span>
          <span className="analytics-stat-lbl">Units</span>
        </div>
        {b.severity_breakdown.filter(s => s.severity === 'emergency' && s.count > 0).map(s => (
          <Badge key="em" variant="destructive" className="text-[10px] px-1.5 py-0">
            {s.count} emergency
          </Badge>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function AnalyticsSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="analytics-kpi-grid">
        {[1,2,3,4].map(i => <Skeleton key={i} className="h-20" />)}
      </div>
      <Skeleton className="h-64" />
      <Skeleton className="h-64" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AnalyticsPage() {
  const { role, companyId: userCompanyId } = useAuth();
  const isAdmin = role === 'proroto_admin';

  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [companies, setCompanies] = useState<CompanyAnalyticsRow[]>([]);
  const [companyOptions, setCompanyOptions] = useState<CompanyOption[]>([]);
  const [buildings, setBuildings] = useState<BuildingAnalyticsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedCompany, setSelectedCompany] = useState<string>('');
  const [selectedBuilding, setSelectedBuilding] = useState<string>('');
  const [buildingSearch, setBuildingSearch] = useState('');

  // Effective company for analytics
  const effectiveCompany = isAdmin ? selectedCompany : (userCompanyId ?? '');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [s, b] = await Promise.all([
        fetchAnalyticsSummary(
          selectedBuilding ? undefined : (effectiveCompany || undefined),
          selectedBuilding || undefined,
        ),
        fetchBuildingAnalytics(effectiveCompany || undefined),
      ]);
      setSummary(s);
      setBuildings(b);

      if (isAdmin) {
        const [ca, co] = await Promise.all([
          fetchCompanyAnalytics(),
          fetchCompanyOptions(),
        ]);
        setCompanies(ca);
        setCompanyOptions(co);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load analytics');
    } finally { setLoading(false); }
  }, [effectiveCompany, selectedBuilding, isAdmin]);

  useEffect(() => { load(); }, [load]);
  useRealtime('tickets', load, { enabled: !loading });

  // Filtered buildings for the list
  const filteredBuildings = buildings
    .filter(b => {
      if (effectiveCompany && b.company_id !== effectiveCompany) return false;
      if (buildingSearch) {
        const q = buildingSearch.toLowerCase();
        return (b.building_name + b.address + b.company_name).toLowerCase().includes(q);
      }
      return true;
    })
    .sort((a, b) => b.total_tickets - a.total_tickets);

  const selectedBuildingObj = buildings.find(b => b.building_id === selectedBuilding);

  // Chart data
  const issueChartData = summary?.top_issue_types.map(({ issue_type, count }) => ({
    name: ISSUE_TYPE_LABELS[issue_type as IssueType] ?? issue_type.replace(/_/g, ' '),
    count,
  })) ?? [];

  const sevPieData = summary?.severity_breakdown.map(({ severity, count }) => ({
    name: SEVERITY_LABELS[severity], value: count, fill: SEVERITY_COLORS[severity],
  })) ?? [];

  if (loading) return <PageTransition><AnalyticsSkeleton /></PageTransition>;
  if (error) return <ErrorBanner message={error} />;
  if (!summary) return null;

  // Breadcrumb context
  const selectedCompanyName = companyOptions.find(c => c.id === selectedCompany)?.name;

  return (
    <PageTransition>
      {/* Header + filters */}
      <div className="analytics-header">
        <div className="analytics-header-top">
          <div>
            <h2 className="text-lg sm:text-xl font-bold tracking-tight flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Analytics
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {selectedBuildingObj
                ? `${selectedBuildingObj.building_name || selectedBuildingObj.address}`
                : selectedCompanyName
                  ? selectedCompanyName
                  : isAdmin ? 'Platform-wide metrics' : 'Your company metrics'}
            </p>
          </div>
        </div>

        {/* Filter bar */}
        <div className="analytics-filter-bar">
          {isAdmin && (
            <select className="form-select analytics-filter-select" value={selectedCompany}
              onChange={(e) => { setSelectedCompany(e.target.value); setSelectedBuilding(''); }}>
              <option value="">All Companies</option>
              {companyOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <select className="form-select analytics-filter-select" value={selectedBuilding}
            onChange={(e) => setSelectedBuilding(e.target.value)}>
            <option value="">All Buildings</option>
            {buildings
              .filter(b => !effectiveCompany || b.company_id === effectiveCompany)
              .map(b => (
                <option key={b.building_id} value={b.building_id}>
                  {b.building_name || b.address}
                </option>
              ))}
          </select>
          {(selectedCompany || selectedBuilding) && (
            <Button variant="ghost" size="sm" className="text-xs shrink-0"
              onClick={() => { setSelectedCompany(''); setSelectedBuilding(''); }}>
              <X className="h-3 w-3" /> Clear
            </Button>
          )}
        </div>
      </div>

      {/* KPI Row */}
      <div className="analytics-kpi-grid">
        <KPICard label="Open Tickets" value={summary.open_tickets}
          subtext={`${summary.total_tickets} total`}
          icon={<Ticket className="h-4 w-4" />} color="#f59e0b" />
        <KPICard label="This Month" value={summary.tickets_this_month}
          subtext={summary.total_buildings > 0 ? `~${summary.avg_tickets_per_building}/bldg` : ''}
          icon={<TrendingUp className="h-4 w-4" />} color="#06b6d4" />
        <KPICard label="Buildings" value={selectedBuilding ? 1 : summary.total_buildings}
          subtext={`${summary.total_spaces} units`}
          icon={<Building2 className="h-4 w-4" />} color="#3b82f6" />
        <KPICard label="Users" value={summary.total_users}
          icon={<Users2 className="h-4 w-4" />} color="#8b5cf6" />
      </div>

      {/* Charts */}
      <div className="analytics-charts-grid">
        {/* Ticket trend */}
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="text-sm font-semibold mb-3 flex items-center gap-2">
              <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
              Ticket Volume (6 Months)
            </div>
            {summary.ticket_trend.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={summary.ticket_trend}>
                  <defs>
                    <linearGradient id="ticketFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="count" stroke="#3b82f6" fill="url(#ticketFill)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">No data</div>
            )}
          </CardContent>
        </Card>

        {/* Issue types */}
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="text-sm font-semibold mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              Issue Types
            </div>
            {issueChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={issueChartData} layout="vertical" margin={{ left: 0 }}>
                  <XAxis type="number" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={100} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={18}>
                    {issueChartData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">No data</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Severity + Status */}
      <div className="analytics-breakdown-grid">
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="text-sm font-semibold mb-3">Severity</div>
            {sevPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={sevPieData} dataKey="value" nameKey="name"
                    cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={3} strokeWidth={0}>
                    {sevPieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Pie>
                  <Tooltip formatter={(val: number, name: string) => [val, name]}
                    contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">No data</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="text-sm font-semibold mb-3">Status Breakdown</div>
            <div className="space-y-1.5">
              {summary.status_breakdown.map(({ status, count }) => {
                const pct = summary.total_tickets > 0 ? Math.round((count / summary.total_tickets) * 100) : 0;
                return (
                  <div key={status} className="analytics-status-row">
                    <div className="analytics-status-label">{STATUS_LABELS[status]}</div>
                    <div className="analytics-status-bar-wrap">
                      <div className="analytics-status-bar"
                        style={{ width: `${Math.max(pct, 2)}%`, background: PIE_COLORS[Object.keys(STATUS_LABELS).indexOf(status) % PIE_COLORS.length] }} />
                    </div>
                    <div className="analytics-status-count">{count}</div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Building Analytics Table / Cards */}
      {!selectedBuilding && (
        <Card className="mt-4">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
              <div className="text-sm font-semibold flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                Building Analytics
                <span className="text-xs font-normal text-muted-foreground">({filteredBuildings.length})</span>
              </div>
              <div className="analytics-building-search-wrap">
                <Search className="analytics-building-search-icon" />
                <input type="text" placeholder="Search buildings…"
                  className="form-input analytics-building-search"
                  value={buildingSearch} onChange={(e) => setBuildingSearch(e.target.value)} />
              </div>
            </div>

            {filteredBuildings.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">No buildings</div>
            ) : (
              <>
                {/* Mobile: card list */}
                <div className="md:hidden space-y-2">
                  {filteredBuildings.map(b => (
                    <BuildingCard key={b.building_id} b={b}
                      isSelected={selectedBuilding === b.building_id}
                      onSelect={() => setSelectedBuilding(b.building_id)} />
                  ))}
                </div>

                {/* Desktop: table */}
                <div className="hidden md:block overflow-x-auto -mx-4 px-4">
                  <table className="w-full text-sm" style={{ minWidth: 700 }}>
                    <thead>
                      <tr className="border-b-2 border-border">
                        <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Building</th>
                        {isAdmin && !effectiveCompany && (
                          <th className="text-left py-2 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Company</th>
                        )}
                        <th className="text-right py-2 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Units</th>
                        <th className="text-right py-2 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total</th>
                        <th className="text-right py-2 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Open</th>
                        <th className="text-right py-2 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">This Mo.</th>
                        <th className="text-center py-2 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Severity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBuildings.map(b => (
                        <tr key={b.building_id}
                          className="border-b border-border hover:bg-muted/50 cursor-pointer transition-colors"
                          onClick={() => setSelectedBuilding(b.building_id)}>
                          <td className="py-2 px-3">
                            <div className="font-semibold">{b.building_name || b.address}</div>
                            {b.building_name && <div className="text-xs text-muted-foreground">{b.address}</div>}
                          </td>
                          {isAdmin && !effectiveCompany && (
                            <td className="py-2 px-2 text-xs text-muted-foreground">{b.company_name}</td>
                          )}
                          <td className="py-2 px-2 text-right tabular-nums">{b.unit_count}</td>
                          <td className="py-2 px-2 text-right tabular-nums font-semibold">{b.total_tickets}</td>
                          <td className="py-2 px-2 text-right tabular-nums">
                            <span style={{ color: b.open_tickets > 0 ? '#f59e0b' : undefined, fontWeight: b.open_tickets > 0 ? 600 : 400 }}>
                              {b.open_tickets}
                            </span>
                          </td>
                          <td className="py-2 px-2 text-right tabular-nums">{b.tickets_this_month}</td>
                          <td className="py-2 px-2 text-center">
                            <div className="flex gap-1 justify-center">
                              {b.severity_breakdown.map(s => (
                                <Badge key={s.severity} variant={SEVERITY_BADGE[s.severity]} className="text-[10px] px-1.5 py-0">
                                  {s.count} {SEVERITY_LABELS[s.severity].toLowerCase()}
                                </Badge>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Admin-only: Company table */}
      {isAdmin && !selectedCompany && !selectedBuilding && companies.length > 0 && (
        <Card className="mt-4">
          <CardContent className="p-3 sm:p-4">
            <div className="text-sm font-semibold flex items-center gap-2 mb-3">
              <Home className="h-4 w-4 text-muted-foreground" />
              Company Overview
            </div>

            {/* Mobile: cards */}
            <div className="md:hidden space-y-2">
              {companies.map(c => (
                <div key={c.company_id} className="analytics-company-card"
                  onClick={() => { setSelectedCompany(c.company_id); setSelectedBuilding(''); }}>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="font-semibold text-sm truncate">{c.company_name}</div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                  <div className="analytics-building-stats">
                    <div className="analytics-building-stat">
                      <span className="analytics-stat-num">{c.building_count}</span>
                      <span className="analytics-stat-lbl">Bldgs</span>
                    </div>
                    <div className="analytics-building-stat">
                      <span className="analytics-stat-num">{c.user_count}</span>
                      <span className="analytics-stat-lbl">Users</span>
                    </div>
                    <div className="analytics-building-stat">
                      <span className="analytics-stat-num" style={{ color: c.open_tickets > 0 ? '#f59e0b' : undefined }}>
                        {c.open_tickets}
                      </span>
                      <span className="analytics-stat-lbl">Open</span>
                    </div>
                    <div className="analytics-building-stat">
                      <span className="analytics-stat-num">{c.total_tickets}</span>
                      <span className="analytics-stat-lbl">Total</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop: table */}
            <div className="hidden md:block overflow-x-auto -mx-4 px-4">
              <table className="w-full text-sm" style={{ minWidth: 600 }}>
                <thead>
                  <tr className="border-b-2 border-border">
                    <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Company</th>
                    <th className="text-right py-2 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Buildings</th>
                    <th className="text-right py-2 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Users</th>
                    <th className="text-right py-2 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Open</th>
                    <th className="text-right py-2 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">This Mo.</th>
                    <th className="text-right py-2 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {companies.map(c => (
                    <tr key={c.company_id}
                      className="border-b border-border hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => { setSelectedCompany(c.company_id); setSelectedBuilding(''); }}>
                      <td className="py-2 px-3 font-semibold">{c.company_name}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{c.building_count}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{c.user_count}</td>
                      <td className="py-2 px-2 text-right tabular-nums">
                        <span style={{ color: c.open_tickets > 0 ? '#f59e0b' : undefined, fontWeight: c.open_tickets > 0 ? 600 : 400 }}>
                          {c.open_tickets}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums">{c.tickets_this_month}</td>
                      <td className="py-2 px-2 text-right tabular-nums font-semibold">{c.total_tickets}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </PageTransition>
  );
}
