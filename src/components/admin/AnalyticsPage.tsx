// =============================================================================
// Pro Roto App — Analytics Page (Role-Aware, Mobile-First)
// =============================================================================
// Admin: all companies → one company → one building
// PM:    own company → one building
//
// Written to be read by a facilities director, not an analyst: every number
// has a plain label above it and a short sentence under it saying what it
// counts; every chart has a title that is a statement and a one-line hint.
// Layout uses Tailwind utilities + design tokens only (the old `analytics-*`
// classes were never defined in index.css, so the page rendered unstyled).
// Shared pieces (tiles, sections, count rows, monthly bars) live in
// components/StatBlocks.tsx and are also used by the Overview.
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
  Building2, Users2, Ticket, CalendarDays, BarChart3,
  ChevronRight, MapPin, Search, X,
} from 'lucide-react';
import { useRealtime } from '@/hooks/useRealtime';
import { PageTransition } from '@/components/PageTransition';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Button } from '@/components/ui/button';
import {
  SummaryTile, Section, CountRows, MonthlyBars, plural,
  SEVERITY_ORDER, SEVERITY_BAR, type CountRow,
} from '@/components/StatBlocks';

const SEVERITY_BADGE: Record<TicketSeverity, 'destructive' | 'warning' | 'secondary'> = {
  emergency: 'destructive', urgent: 'warning', standard: 'secondary',
};

// ---------------------------------------------------------------------------
// Small labelled number used in the phone cards
// ---------------------------------------------------------------------------

function MiniStat({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <div className={`text-base tabular-nums ${strong ? 'font-bold text-foreground' : 'font-semibold text-foreground'}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Building card (phones)
// ---------------------------------------------------------------------------

function BuildingCard({ b, onSelect }: { b: BuildingAnalyticsRow; onSelect: () => void }) {
  const emergencies = b.severity_breakdown.find(s => s.severity === 'emergency')?.count ?? 0;
  return (
    <button type="button" onClick={onSelect}
      className="w-full text-left rounded-lg border border-border bg-card p-3 min-h-[44px] transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-sm text-foreground truncate">{b.building_name || b.address}</div>
          {b.building_name && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
              <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{b.address}</span>
            </div>
          )}
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" aria-hidden="true" />
      </div>
      <div className="grid grid-cols-3 gap-2 mt-3">
        <MiniStat label="Open now" value={b.open_tickets} strong={b.open_tickets > 0} />
        <MiniStat label="This month" value={b.tickets_this_month} />
        <MiniStat label="All time" value={b.total_tickets} />
      </div>
      {emergencies > 0 && (
        <Badge variant="destructive" className="mt-3 text-xs">
          {emergencies} {plural(emergencies, 'emergency', 'emergencies')}
        </Badge>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function AnalyticsSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-12 w-64" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28" />)}
      </div>
      <Skeleton className="h-72" />
      <Skeleton className="h-64" />
    </div>
  );
}

const TH = 'py-2 px-3 text-xs font-semibold text-muted-foreground';

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
    } catch {
      setError("We couldn't load the analytics. Check your connection and try again.");
    } finally { setLoading(false); }
  }, [effectiveCompany, selectedBuilding, isAdmin]);

  useEffect(() => { load(); }, [load]);
  useRealtime('tickets', load, { enabled: !loading });

  if (loading) return <PageTransition><AnalyticsSkeleton /></PageTransition>;
  if (error) return <ErrorBanner message={error} onRetry={load} />;
  if (!summary) return null;

  // Buildings for the dropdown and the "By building" list
  const companyBuildings = buildings.filter(b => !effectiveCompany || b.company_id === effectiveCompany);
  const filteredBuildings = companyBuildings
    .filter(b => {
      if (!buildingSearch) return true;
      const q = buildingSearch.toLowerCase();
      return (b.building_name + b.address + b.company_name).toLowerCase().includes(q);
    })
    .sort((a, b) => b.total_tickets - a.total_tickets);

  const selectedBuildingObj = buildings.find(b => b.building_id === selectedBuilding);
  const selectedCompanyName = companyOptions.find(c => c.id === selectedCompany)?.name;

  // What the numbers on this page cover, in words
  const scopeName = selectedBuildingObj
    ? (selectedBuildingObj.building_name || selectedBuildingObj.address)
    : selectedCompanyName
      ? selectedCompanyName
      : isAdmin ? 'all companies' : 'all your buildings';

  const total = summary.total_tickets;
  const monthName = new Date().toLocaleDateString('en-US', { month: 'long' });

  // Rows for the three breakdowns
  const issueRows: CountRow[] = summary.top_issue_types.map(({ issue_type, count }) => ({
    key: issue_type,
    label: ISSUE_TYPE_LABELS[issue_type as IssueType] ?? issue_type.replace(/_/g, ' '),
    count,
  }));
  const severityRows: CountRow[] = SEVERITY_ORDER
    .map(sev => ({
      key: sev,
      label: SEVERITY_LABELS[sev],
      count: summary.severity_breakdown.find(s => s.severity === sev)?.count ?? 0,
      barClass: SEVERITY_BAR[sev],
    }))
    .filter(r => r.count > 0);
  const statusRows: CountRow[] = summary.status_breakdown.map(({ status, count }) => ({
    key: status, label: STATUS_LABELS[status], count,
  }));

  const usersNote = isAdmin
    ? (selectedCompany ? 'Can sign in for this company' : 'Can sign in, across all companies')
    : 'Can sign in for your company';

  return (
    <PageTransition>
      {/* Header + filters */}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
        <div className="min-w-0">
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2 text-foreground">
            <BarChart3 className="h-5 w-5 text-primary shrink-0" aria-hidden="true" />
            Analytics
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Plumbing problems reported and where they stand.
            {' '}Showing <span className="font-semibold text-foreground">{scopeName}</span>.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3 w-full sm:w-auto">
          {isAdmin && (
            <div className="flex-1 sm:flex-none min-w-[180px]">
              <label htmlFor="analytics-company" className="block text-xs font-medium text-muted-foreground mb-1">Company</label>
              <select id="analytics-company" className="form-select w-full min-h-[44px]" value={selectedCompany}
                onChange={(e) => { setSelectedCompany(e.target.value); setSelectedBuilding(''); }}>
                <option value="">All companies</option>
                {companyOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          <div className="flex-1 sm:flex-none min-w-[180px]">
            <label htmlFor="analytics-building" className="block text-xs font-medium text-muted-foreground mb-1">Building</label>
            <select id="analytics-building" className="form-select w-full min-h-[44px]" value={selectedBuilding}
              onChange={(e) => setSelectedBuilding(e.target.value)}>
              <option value="">All buildings</option>
              {companyBuildings.map(b => (
                <option key={b.building_id} value={b.building_id}>
                  {b.building_name || b.address}
                </option>
              ))}
            </select>
          </div>
          {(selectedCompany || selectedBuilding) && (
            <Button variant="outline" className="min-h-[44px] shrink-0"
              onClick={() => { setSelectedCompany(''); setSelectedBuilding(''); }}>
              <X className="h-4 w-4" aria-hidden="true" /> Show everything
            </Button>
          )}
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <SummaryTile
          label="Open work orders"
          value={summary.open_tickets}
          note={total === 0
            ? 'Nothing has been reported yet'
            : `Not finished yet, out of ${total} reported in total`}
          icon={<Ticket className="h-4 w-4" />} />
        <SummaryTile
          label="Reported this month"
          value={summary.tickets_this_month}
          note={`New work orders since ${monthName} 1`}
          icon={<CalendarDays className="h-4 w-4" />} />
        {selectedBuildingObj ? (
          <SummaryTile
            label="Units in this building"
            value={selectedBuildingObj.unit_count}
            note="Units set up for this building"
            icon={<Building2 className="h-4 w-4" />} />
        ) : (
          <SummaryTile
            label="Buildings"
            value={summary.total_buildings}
            note={`${summary.total_spaces} ${plural(summary.total_spaces, 'location', 'locations')} inside them`}
            icon={<Building2 className="h-4 w-4" />} />
        )}
        <SummaryTile
          label="People with access"
          value={summary.total_users}
          note={usersNote}
          icon={<Users2 className="h-4 w-4" />} />
      </div>

      {/* Reported each month */}
      <Section className="mb-4"
        title="Work orders reported each month"
        hint="The last 6 months. The number above each bar is how many were reported that month.">
        <MonthlyBars data={summary.ticket_trend} />
      </Section>

      {/* Breakdowns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <Section title="What was reported"
          hint="The most common problems, out of every work order.">
          <CountRows rows={issueRows} total={total} />
        </Section>
        <Section title="How urgent they were"
          hint="Every work order, by the urgency it was reported with.">
          <CountRows rows={severityRows} total={total} />
        </Section>
        <Section title="Where they stand now"
          hint="Every work order, by its current status.">
          <CountRows rows={statusRows} total={total} />
        </Section>
      </div>

      {/* By building */}
      {!selectedBuilding && (
        <Card className="mb-4">
          <CardContent className="p-4">
            <div className="flex items-end justify-between gap-3 mb-4 flex-wrap">
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  By building
                  <span className="font-normal text-muted-foreground"> ({filteredBuildings.length})</span>
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Busiest first. Choose a building to see only its numbers.
                </p>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden="true" />
                <input type="search" aria-label="Search buildings" placeholder="Search buildings…"
                  className="form-input w-full pl-9 min-h-[44px]"
                  value={buildingSearch} onChange={(e) => setBuildingSearch(e.target.value)} />
              </div>
            </div>

            {filteredBuildings.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                {buildingSearch ? 'No buildings match your search.' : 'No buildings have been set up yet.'}
              </p>
            ) : (
              <>
                {/* Phones: cards */}
                <div className="md:hidden space-y-2">
                  {filteredBuildings.map(b => (
                    <BuildingCard key={b.building_id} b={b}
                      onSelect={() => setSelectedBuilding(b.building_id)} />
                  ))}
                </div>

                {/* Desktop: table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-border">
                        <th scope="col" className={`${TH} text-left`}>Building</th>
                        {isAdmin && !effectiveCompany && (
                          <th scope="col" className={`${TH} text-left`}>Company</th>
                        )}
                        <th scope="col" className={`${TH} text-right`}>Open now</th>
                        <th scope="col" className={`${TH} text-right`}>This month</th>
                        <th scope="col" className={`${TH} text-right`}>All time</th>
                        <th scope="col" className={`${TH} text-right`}>Units</th>
                        <th scope="col" className={`${TH} text-left`}>Urgency (all time)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBuildings.map(b => (
                        <tr key={b.building_id} className="border-b border-border hover:bg-muted/50 transition-colors">
                          <td className="py-2 px-3">
                            <button type="button" onClick={() => setSelectedBuilding(b.building_id)}
                              className="text-left font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">
                              {b.building_name || b.address}
                            </button>
                            {b.building_name && <div className="text-xs text-muted-foreground">{b.address}</div>}
                          </td>
                          {isAdmin && !effectiveCompany && (
                            <td className="py-2 px-3 text-muted-foreground">{b.company_name}</td>
                          )}
                          <td className={`py-2 px-3 text-right tabular-nums ${b.open_tickets > 0 ? 'font-bold text-foreground' : 'text-muted-foreground'}`}>
                            {b.open_tickets}
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums">{b.tickets_this_month}</td>
                          <td className="py-2 px-3 text-right tabular-nums">{b.total_tickets}</td>
                          <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">{b.unit_count}</td>
                          <td className="py-2 px-3">
                            <div className="flex flex-wrap gap-1">
                              {SEVERITY_ORDER.map(sev => {
                                const n = b.severity_breakdown.find(s => s.severity === sev)?.count ?? 0;
                                return n > 0 ? (
                                  <Badge key={sev} variant={SEVERITY_BADGE[sev]} className="text-xs">
                                    {n} {SEVERITY_LABELS[sev].toLowerCase()}
                                  </Badge>
                                ) : null;
                              })}
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

      {/* Admin-only: by company */}
      {isAdmin && !selectedCompany && !selectedBuilding && companies.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-base font-semibold text-foreground">By company</h3>
            <p className="text-xs text-muted-foreground mt-0.5 mb-4">
              Busiest first. Choose a company to see only its numbers.
            </p>

            {/* Phones: cards */}
            <div className="md:hidden space-y-2">
              {companies.map(c => (
                <button key={c.company_id} type="button"
                  onClick={() => { setSelectedCompany(c.company_id); setSelectedBuilding(''); }}
                  className="w-full text-left rounded-lg border border-border bg-card p-3 min-h-[44px] transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold text-sm text-foreground truncate">{c.company_name}</div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    <MiniStat label="Open now" value={c.open_tickets} strong={c.open_tickets > 0} />
                    <MiniStat label="This month" value={c.tickets_this_month} />
                    <MiniStat label="All time" value={c.total_tickets} />
                  </div>
                  <div className="text-xs text-muted-foreground mt-2">
                    {c.building_count} {plural(c.building_count, 'building', 'buildings')} · {c.user_count} {plural(c.user_count, 'person', 'people')} with access
                  </div>
                </button>
              ))}
            </div>

            {/* Desktop: table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-border">
                    <th scope="col" className={`${TH} text-left`}>Company</th>
                    <th scope="col" className={`${TH} text-right`}>Open now</th>
                    <th scope="col" className={`${TH} text-right`}>This month</th>
                    <th scope="col" className={`${TH} text-right`}>All time</th>
                    <th scope="col" className={`${TH} text-right`}>Buildings</th>
                    <th scope="col" className={`${TH} text-right`}>People with access</th>
                  </tr>
                </thead>
                <tbody>
                  {companies.map(c => (
                    <tr key={c.company_id} className="border-b border-border hover:bg-muted/50 transition-colors">
                      <td className="py-2 px-3">
                        <button type="button"
                          onClick={() => { setSelectedCompany(c.company_id); setSelectedBuilding(''); }}
                          className="text-left font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">
                          {c.company_name}
                        </button>
                      </td>
                      <td className={`py-2 px-3 text-right tabular-nums ${c.open_tickets > 0 ? 'font-bold text-foreground' : 'text-muted-foreground'}`}>
                        {c.open_tickets}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">{c.tickets_this_month}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{c.total_tickets}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">{c.building_count}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">{c.user_count}</td>
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
