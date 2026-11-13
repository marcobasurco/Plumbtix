// =============================================================================
// Work Orders — Dashboard Overview
// =============================================================================
// The first page everyone sees: what is open, what is an emergency, the
// latest work orders, then reference numbers. Written to be read at a glance:
// every number has its label above it and a sentence saying what it counts
// (shared blocks in components/StatBlocks.tsx, same as Analytics).
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
  TicketCheck, AlertTriangle, Building2, LayoutGrid,
  CheckCircle2, Clock, ArrowRight, Zap, CircleDot, Plus,
} from 'lucide-react';
import { useRealtimeTickets } from '@/hooks/useRealtime';
import { Loading } from '@/components/Loading';
import { ErrorBanner, friendlyError } from '@/components/ErrorBanner';
import { Button } from '@/components/ui/button';
import {
  SummaryTile, Section, CountRows, MonthlyBars, plural,
  SEVERITY_ORDER, SEVERITY_BAR, type CountRow,
} from '@/components/StatBlocks';

// ---------------------------------------------------------------------------
// Badge colors for the recent list (data colors, fixed in both themes)
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<TicketStatus, string> = {
  new: '#5b8fb9',
  needs_info: '#d9a441',
  scheduled: '#4f9fb0',
  dispatched: '#3f8f9f',
  on_site: '#35808c',
  in_progress: '#2c6f79',
  waiting_approval: '#c98a2e',
  completed: '#5aa37c',
  invoiced: '#3f8a62',
  cancelled: '#a3acb8',
};

const SEVERITY_COLORS: Record<TicketSeverity, string> = {
  emergency: '#c2423c',
  urgent: '#d9a441',
  standard: '#5b8fb9',
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

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

const TH = 'py-2 px-3 text-xs font-semibold text-muted-foreground';

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
  const total = metrics.totalTickets;
  const isAdmin = role === 'proroto_admin';
  const scope = isAdmin ? 'across all companies' : role === 'resident' ? 'for your home' : 'across your buildings';
  const monthName = new Date().toLocaleDateString('en-US', { month: 'long' });

  const urgencyRows: CountRow[] = SEVERITY_ORDER.map((sev) => ({
    key: sev,
    label: SEVERITY_LABELS[sev],
    count: metrics.severityBreakdown.find((s) => s.severity === sev)?.count ?? 0,
    barClass: SEVERITY_BAR[sev],
    onClick: () => navigate(`${basePath}/tickets?severity=${sev}`),
  }));
  const statusRows: CountRow[] = [...metrics.statusBreakdown]
    .sort((a, b) => b.count - a.count)
    .map(({ status, count }) => ({ key: status, label: STATUS_LABELS[status], count }));

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
              ? `${metrics.emergencyTickets} open ${plural(metrics.emergencyTickets, 'emergency needs', 'emergencies need')} attention.`
              : metrics.openTickets === 0
                ? `No open work orders ${scope}.`
                : `${metrics.openTickets} open work ${plural(metrics.openTickets, 'order', 'orders')} ${scope}. No open emergencies.`}
          </p>
        </div>
        {canReport && (
          <Button size="lg" className="w-full sm:w-auto" onClick={() => navigate(`${basePath}/tickets/new`)}>
            <Plus className="h-5 w-5" aria-hidden="true" /> Report a problem
          </Button>
        )}
      </div>

      {/* Summary tiles — each opens the matching list */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <SummaryTile
          label="Open work orders"
          value={metrics.openTickets}
          note={total === 0
            ? 'Nothing has been reported yet'
            : `Not finished yet, out of ${total} reported in total`}
          icon={<TicketCheck className="h-4 w-4" />}
          onClick={() => navigate(`${basePath}/tickets?status=open`)}
        />
        <SummaryTile
          label="Open emergencies"
          value={metrics.emergencyTickets}
          note={hasEmergencies ? 'Need attention now' : 'None right now'}
          icon={<AlertTriangle className="h-4 w-4" />}
          alert={hasEmergencies}
          onClick={() => navigate(`${basePath}/tickets?severity=emergency`)}
        />
        <SummaryTile
          label="Completed this month"
          value={metrics.completedThisMonth}
          note={`Finished since ${monthName} 1`}
          icon={<CheckCircle2 className="h-4 w-4" />}
          onClick={() => navigate(`${basePath}/tickets?status=completed`)}
        />
        <SummaryTile
          label="Buildings"
          value={metrics.totalBuildings}
          note={`${metrics.totalSpaces} ${plural(metrics.totalSpaces, 'location', 'locations')} inside them`}
          icon={<Building2 className="h-4 w-4" />}
          onClick={() => navigate(`${basePath}/buildings`)}
        />
      </div>

      {/* Latest work orders + urgency */}
      <div className="dashboard-bottom">
        {/* Recent work orders */}
        <div className="card">
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Clock size={16} className="text-muted-foreground" aria-hidden="true" />
              <span style={{ fontWeight: 600, fontSize: 'var(--text-md)' }}>Latest work orders</span>
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

        <div className="flex flex-col gap-4">
          <Section
            title="All work orders by urgency"
            hint="Everything ever reported, finished or not. Choose one to see the list.">
            <CountRows rows={urgencyRows} total={total} />
          </Section>

          <div className="card p-4">
            <h3 className="text-base font-semibold text-foreground mb-3">Quick actions</h3>
            <div className="flex flex-col gap-2">
              <Button variant="outline" className="w-full min-h-[44px]" onClick={() => navigate(`${basePath}/tickets`)}>
                <TicketCheck className="h-4 w-4" aria-hidden="true" /> View work orders
              </Button>
              <Button variant="outline" className="w-full min-h-[44px]" onClick={() => navigate(`${basePath}/buildings`)}>
                <Building2 className="h-4 w-4" aria-hidden="true" /> View buildings
              </Button>
              {isAdmin && (
                <Button variant="outline" className="w-full min-h-[44px]" onClick={() => navigate('/admin/companies')}>
                  <LayoutGrid className="h-4 w-4" aria-hidden="true" /> Manage companies
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* By company (Pro Roto admin only) — full width so names and numbers fit */}
      {isAdmin && metrics.companyBreakdown.length > 0 && (
        <Section className="mt-4"
          title="By company"
          hint="Each customer at a glance.">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-border">
                  <th scope="col" className={`${TH} text-left`}>Company</th>
                  <th scope="col" className={`${TH} text-right`}>Open now</th>
                  <th scope="col" className={`${TH} text-right`}>All time</th>
                  <th scope="col" className={`${TH} text-right`}>Buildings</th>
                  <th scope="col" className={`${TH} text-right hidden sm:table-cell`}>Locations</th>
                  <th scope="col" className={`${TH} text-right hidden sm:table-cell`}>People with access</th>
                </tr>
              </thead>
              <tbody>
                {metrics.companyBreakdown.map((c) => (
                  <tr key={c.company_id} className="border-b border-border">
                    <td className="py-2 px-3 font-semibold text-foreground">{c.company_name}</td>
                    <td className={`py-2 px-3 text-right tabular-nums ${c.open_tickets > 0 ? 'font-bold text-foreground' : 'text-muted-foreground'}`}>
                      {c.open_tickets}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums">{c.total_tickets}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">{c.building_count}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-muted-foreground hidden sm:table-cell">{c.space_count}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-muted-foreground hidden sm:table-cell">{c.user_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* Reference numbers — after the actionable content; on a phone these
          are background, not the reason the person opened the app */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <Section
          title="Work orders reported each month"
          hint="The last 6 months. The number above each bar is how many were reported that month.">
          <MonthlyBars data={metrics.ticketsByMonth} />
        </Section>
        <Section
          title="Where they stand now"
          hint="Every work order, by its current status.">
          <CountRows rows={statusRows} total={total} />
        </Section>
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
