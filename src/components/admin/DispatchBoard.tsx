// =============================================================================
// Pro Roto App — Dispatch Board
// =============================================================================
// One column per status, each holding the work orders in that status. Pro Roto
// admins move a work order with the "Move to" buttons on its card.
//
// Same look as Overview and Analytics: cards, tokens and the shared status /
// severity badges (the old `dispatch-*` / `kanban-*` classes were never defined
// in index.css, so the page rendered as an unstyled list).
//   • Desktop: every status column is always shown, so positions stay put.
//   • Phone: one column wide; statuses with nothing in them collapse into a
//     single line at the bottom instead of seven "No work orders" boxes.
// =============================================================================

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { updateTicket } from '@/lib/api';
import { fetchCompanyOptions, type CompanyOption } from '@/lib/admin';
import {
  SELECTABLE_TICKET_STATUSES,
  STATUS_LABELS,
  ISSUE_TYPE_LABELS,
} from '@shared/types/enums';
import type { TicketStatus, IssueType, TicketSeverity } from '@shared/types/enums';
import { getAllowedTransitions } from '@shared/types/transitions';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/tickets/StatusBadge';
import { SeverityBadge } from '@/components/tickets/SeverityBadge';
import { useRealtimeTickets } from '@/hooks/useRealtime';
import { toast } from 'sonner';
import {
  RefreshCcw, Loader2, Search, MapPin, Wrench, Calendar, X, Columns3,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DispatchTicket {
  id: string;
  ticket_number: number;
  status: TicketStatus;
  severity: TicketSeverity;
  issue_type: IssueType;
  description: string | null;
  assigned_technician: string | null;
  scheduled_date: string | null;
  scheduled_time_window: string | null;
  created_at: string;
  building: { id: string; name: string | null; address_line1: string; company_id: string } | null;
  space: { id: string; unit_number: string | null; common_area_type: string | null } | null;
  created_by: { id: string; full_name: string } | null;
}

// 'needs_info' is a legacy status (00035): it gets a column only while a
// historic work order is still sitting in it (see `columns` below).
const ACTIVE_STATUSES: TicketStatus[] = [
  'new', 'scheduled', 'dispatched',
  'on_site', 'in_progress', 'waiting_approval',
];
/** 'YYYY-MM-DD' → 'Nov 12'. Built from the parts: new Date('YYYY-MM-DD') is
 *  UTC midnight, which shows as the day BEFORE in California. */
function formatDay(ymd: string): string {
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const TERMINAL_STATUSES: TicketStatus[] = ['completed', 'invoiced', 'cancelled'];

// ---------------------------------------------------------------------------
// Work-order card
// ---------------------------------------------------------------------------

function DispatchCard({ ticket, isUpdating, onNavigate, onTransition }: {
  ticket: DispatchTicket;
  isUpdating: boolean;
  onNavigate: () => void;
  onTransition: (s: TicketStatus) => void;
}) {
  const transitions = getAllowedTransitions(ticket.status, 'proroto_admin');
  const spaceLabel = ticket.space?.unit_number
    ? `Unit ${ticket.space.unit_number}`
    : (ticket.space?.common_area_type ?? '').replace(/_/g, ' ');
  const place = ticket.building?.name || ticket.building?.address_line1 || 'No building';
  const issue = ISSUE_TYPE_LABELS[ticket.issue_type] ?? ticket.issue_type;

  return (
    <div className={`rounded-lg border bg-card shadow-sm ${ticket.severity === 'emergency' ? 'border-l-4 border-l-[hsl(var(--tone-danger-dot))] border-border' : 'border-border'}`}>
      {/* Opens the work order */}
      <button type="button" onClick={onNavigate}
        aria-label={`Open work order #${ticket.ticket_number}, ${issue}, ${place}`}
        className="card-button rounded-lg p-3 transition-colors hover:bg-muted/50">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-bold text-foreground tabular-nums">#{ticket.ticket_number}</span>
          <SeverityBadge severity={ticket.severity} />
        </div>
        <div className="mt-1 text-sm font-medium text-foreground">{issue}</div>
        <div className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
          <MapPin className="h-3.5 w-3.5 shrink-0 mt-px" aria-hidden="true" />
          <span className="min-w-0">{place}{spaceLabel && ` · ${spaceLabel}`}</span>
        </div>
        {ticket.assigned_technician && (
          <div className="mt-1 flex items-center gap-1.5 text-xs text-foreground">
            <Wrench className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 truncate">{ticket.assigned_technician}</span>
          </div>
        )}
        {ticket.scheduled_date && (
          <div className="mt-1 flex items-center gap-1.5 text-xs text-foreground">
            <Calendar className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span>
              {formatDay(ticket.scheduled_date)}
              {ticket.scheduled_time_window && ` · ${ticket.scheduled_time_window}`}
            </span>
          </div>
        )}
      </button>

      {/* Move to another status */}
      {transitions.length > 0 && (
        <div className="border-t border-border px-3 py-2">
          <div className="text-xs text-muted-foreground mb-1.5">Move to</div>
          <div className="flex flex-wrap gap-1.5">
            {transitions.map((ts) => (
              <Button key={ts} variant="outline" size="sm" disabled={isUpdating}
                className="min-h-[36px] text-xs" onClick={() => onTransition(ts)}>
                {isUpdating ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : STATUS_LABELS[ts]}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

const BOARD_GRID = 'grid gap-3 items-start grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4';

function BoardSkeleton() {
  return (
    <div className={BOARD_GRID}>
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="rounded-lg border border-border bg-muted/40 p-2">
          <Skeleton className="h-6 w-28 mb-2" />
          <Skeleton className="h-24 w-full rounded-lg mb-2" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function DispatchBoard() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<DispatchTicket[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  // Filters
  const [companyFilter, setCompanyFilter] = useState('');
  const [buildingFilter, setBuildingFilter] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [showTerminal, setShowTerminal] = useState(false);

  const buildingOptions = Array.from(
    new Map(
      tickets.filter((t) => t.building)
        .map((t) => [t.building!.id, { id: t.building!.id, label: t.building!.name || t.building!.address_line1 }])
    ).values()
  );

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [ticketResult, companyResult] = await Promise.all([
        supabase.from('tickets').select(`
            id, ticket_number, status, severity, issue_type, description,
            assigned_technician, scheduled_date, scheduled_time_window, created_at,
            building:buildings(id, name, address_line1, company_id),
            space:spaces(id, unit_number, common_area_type),
            created_by:users!tickets_created_by_user_id_fkey(id, full_name)
          `).order('created_at', { ascending: false }),
        fetchCompanyOptions(),
      ]);
      if (ticketResult.error) throw new Error(ticketResult.error.message);
      setTickets((ticketResult.data ?? []) as unknown as DispatchTicket[]);
      setCompanies(companyResult);
    } catch (e) {
      console.error('[dispatch] load failed:', e);
      setError("We couldn't load the dispatch board. Check your connection and try again.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useRealtimeTickets(load, !loading);

  // Filtering
  const filteredTickets = tickets.filter((t) => {
    if (companyFilter && t.building?.company_id !== companyFilter) return false;
    if (buildingFilter && t.building?.id !== buildingFilter) return false;
    if (searchFilter) {
      const q = searchFilter.toLowerCase();
      const haystack = [
        `#${t.ticket_number}`, t.description, t.assigned_technician,
        t.building?.name, t.building?.address_line1, t.space?.unit_number,
        t.created_by?.full_name,
      ].filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const baseColumns = (showTerminal ? SELECTABLE_TICKET_STATUSES : ACTIVE_STATUSES) as readonly TicketStatus[];
  // Legacy: show a Needs Info column only if a historic row is still in it,
  // so Pro Roto can see it and move it out.
  const hasLegacyNeedsInfo = filteredTickets.some((t) => t.status === 'needs_info');
  const columns: readonly TicketStatus[] = hasLegacyNeedsInfo
    ? ['new', 'needs_info', ...baseColumns.filter((s) => s !== 'new')]
    : baseColumns;
  const grouped = new Map<TicketStatus, DispatchTicket[]>();
  for (const s of columns) grouped.set(s, []);
  for (const t of filteredTickets) grouped.get(t.status)?.push(t);
  const closedCount = filteredTickets.filter((t) => TERMINAL_STATUSES.includes(t.status)).length;
  const openCount = filteredTickets.length - closedCount;
  const emptyStatuses = Array.from(columns).filter((s) => (grouped.get(s) ?? []).length === 0);

  const hasActiveFilters = !!companyFilter || !!buildingFilter || !!searchFilter;

  const handleTransition = async (ticket: DispatchTicket, newStatus: TicketStatus) => {
    setUpdating(ticket.id); setError(null);
    const result = await updateTicket({ ticket_id: ticket.id, status: newStatus });
    if (result.ok) {
      setTickets((prev) => prev.map((t) => t.id === ticket.id ? { ...t, status: newStatus } : t));
      toast.success(`Work order #${ticket.ticket_number} moved to ${STATUS_LABELS[newStatus]}`);
    } else {
      setError(`Couldn't move work order #${ticket.ticket_number}: ${result.error.message}`);
    }
    setUpdating(null);
  };

  const clearFilters = () => { setCompanyFilter(''); setBuildingFilter(''); setSearchFilter(''); };

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2 text-foreground">
            <Columns3 className="h-5 w-5 text-primary shrink-0" aria-hidden="true" />
            Dispatch
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Every work order, grouped by where it stands.
            {' '}<span className="font-semibold text-foreground">{openCount} open</span>
            {closedCount > 0 && `, ${closedCount} closed`}.
          </p>
        </div>
        <Button variant="outline" className="min-h-[44px]" onClick={load} disabled={loading}>
          {loading
            ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            : <RefreshCcw className="h-4 w-4" aria-hidden="true" />}
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="card p-3 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.4fr_auto] gap-3 items-end">
          <div>
            <label htmlFor="dispatch-company" className="block text-xs font-medium text-muted-foreground mb-1">Company</label>
            <select id="dispatch-company" className="form-select w-full min-h-[44px]" value={companyFilter}
              onChange={(e) => { setCompanyFilter(e.target.value); setBuildingFilter(''); }}>
              <option value="">All companies</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="dispatch-building" className="block text-xs font-medium text-muted-foreground mb-1">Building</label>
            <select id="dispatch-building" className="form-select w-full min-h-[44px]" value={buildingFilter}
              onChange={(e) => setBuildingFilter(e.target.value)}>
              <option value="">All buildings</option>
              {buildingOptions.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="dispatch-search" className="block text-xs font-medium text-muted-foreground mb-1">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden="true" />
              <input id="dispatch-search" type="search" placeholder="Number, address or technician"
                className="form-input w-full pl-9 min-h-[44px]"
                value={searchFilter} onChange={(e) => setSearchFilter(e.target.value)} />
            </div>
          </div>
          <label className="flex items-center gap-2 min-h-[44px] text-sm text-foreground cursor-pointer whitespace-nowrap">
            <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))]"
              checked={showTerminal} onChange={() => setShowTerminal(!showTerminal)} />
            Show closed ({closedCount})
          </label>
        </div>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" className="mt-2 min-h-[36px]" onClick={clearFilters}>
            <X className="h-4 w-4" aria-hidden="true" /> Clear filters
          </Button>
        )}
      </div>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {/* Board */}
      {loading ? <BoardSkeleton /> : filteredTickets.length === 0 ? (
        <div className="card p-8 text-center text-sm text-muted-foreground">
          {hasActiveFilters ? 'No work orders match these filters.' : 'No work orders yet.'}
        </div>
      ) : (
        <>
          <div className={BOARD_GRID}>
            {Array.from(columns).map((status) => {
              const col = grouped.get(status) ?? [];
              return (
                <section key={status} aria-label={`${STATUS_LABELS[status]}: ${col.length}`}
                  className={`rounded-lg border border-border bg-muted/40 p-2 ${col.length === 0 ? 'hidden md:block' : ''}`}>
                  <div className="flex items-center justify-between gap-2 px-1 py-1.5">
                    <StatusBadge status={status} />
                    <span className="text-sm font-semibold tabular-nums text-foreground">{col.length}</span>
                  </div>
                  {col.length === 0 ? (
                    <p className="px-1 py-3 text-xs text-muted-foreground">None</p>
                  ) : (
                    <div className="flex flex-col gap-2 mt-1">
                      {col.map((ticket) => (
                        <DispatchCard key={ticket.id} ticket={ticket}
                          isUpdating={updating === ticket.id}
                          onNavigate={() => navigate(`/admin/tickets/${ticket.id}`)}
                          onTransition={(s) => handleTransition(ticket, s)} />
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>

          {/* Phones: empty statuses in one line instead of a box each */}
          {emptyStatuses.length > 0 && (
            <p className="md:hidden mt-3 text-xs text-muted-foreground">
              Nothing in: {emptyStatuses.map((s) => STATUS_LABELS[s]).join(', ')}.
            </p>
          )}
        </>
      )}
    </div>
  );
}
