import { useEffect, useState, useCallback } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { fetchTicketList, formatSpaceLabel, TICKET_PAGE_SIZE, type TicketListRow, type TicketListFilters } from '@/lib/tickets';
import { ISSUE_TYPE_LABELS, SEVERITY_LABELS, STATUS_LABELS } from '@shared/types/enums';
import { StatusBadge } from './StatusBadge';
import { SeverityBadge } from './SeverityBadge';
import { TicketFilters } from './TicketFilters';
import { ErrorBanner, friendlyError } from '@/components/ErrorBanner';
import { PageTransition } from '@/components/PageTransition';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Ticket, ChevronRight, Loader2 } from 'lucide-react';
import { useRealtimeTickets } from '@/hooks/useRealtime';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function CardSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="rounded-xl border border-border p-4 space-y-2">
          <div className="flex gap-3 items-center">
            <Skeleton className="h-4 w-10" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-16 ml-auto" />
          </div>
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex gap-4 items-center p-3">
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-24 ml-auto" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mobile card view — one card per ticket
// ---------------------------------------------------------------------------
function TicketCard({ ticket, onClick }: { ticket: TicketListRow; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`ticket-card${ticket.severity === 'emergency' ? ' is-emergency' : ''}`}
      aria-label={`Work order #${ticket.ticket_number}, ${SEVERITY_LABELS[ticket.severity]}, ${STATUS_LABELS[ticket.status]}, ${ISSUE_TYPE_LABELS[ticket.issue_type as keyof typeof ISSUE_TYPE_LABELS] ?? ticket.issue_type}`}
    >
      <div className="ticket-card-header">
        <span className="ticket-card-number">#{ticket.ticket_number}</span>
        <div className="ticket-card-badges">
          <SeverityBadge severity={ticket.severity} />
          <StatusBadge status={ticket.status} />
        </div>
      </div>

      <div className="ticket-card-issue">
        {ISSUE_TYPE_LABELS[ticket.issue_type as keyof typeof ISSUE_TYPE_LABELS] ?? ticket.issue_type}
      </div>

      {ticket.description && (
        <div className="ticket-card-desc">{ticket.description}</div>
      )}

      <div className="ticket-card-footer">
        <span className="ticket-card-location">
          {ticket.building.name || ticket.building.address_line1} · {formatSpaceLabel(ticket.space)}
        </span>
        <span className="ticket-card-date">{formatDateShort(ticket.created_at)}</span>
      </div>

      <ChevronRight className="ticket-card-chevron" aria-hidden="true" />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Desktop table view
// ---------------------------------------------------------------------------
function TicketTable({ tickets, onRowClick }: { tickets: TicketListRow[]; onRowClick: (id: string) => void }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border hidden md:block">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">#</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Severity</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Issue</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Building</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Location</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Reported by</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Created</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((t) => (
            <tr
              key={t.id}
              onClick={() => onRowClick(t.id)}
              className={`ticket-row cursor-pointer transition-colors hover:bg-muted/50${t.severity === 'emergency' ? ' is-emergency' : ''}`}
            >
              <td className="px-4 py-3 border-t border-border">
                <Link
                  to={t.id}
                  onClick={(e) => e.stopPropagation()}
                  className="font-mono font-bold text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                  aria-label={`Open work order #${t.ticket_number}`}
                >
                  {t.ticket_number}
                </Link>
              </td>
              <td className="px-4 py-3 border-t border-border"><StatusBadge status={t.status} /></td>
              <td className="px-4 py-3 border-t border-border"><SeverityBadge severity={t.severity} /></td>
              <td className="px-4 py-3 border-t border-border max-w-[200px]">
                <div className="font-medium">
                  {ISSUE_TYPE_LABELS[t.issue_type as keyof typeof ISSUE_TYPE_LABELS] ?? t.issue_type}
                </div>
                {t.description && (
                  <div className="truncate text-muted-foreground text-xs max-w-[180px]">{t.description}</div>
                )}
              </td>
              <td className="px-4 py-3 border-t border-border">{t.building.name || t.building.address_line1}</td>
              <td className="px-4 py-3 border-t border-border">{formatSpaceLabel(t.space)}</td>
              <td className="px-4 py-3 border-t border-border">{t.created_by?.full_name ?? 'Unknown'}</td>
              <td className="px-4 py-3 border-t border-border text-muted-foreground">{formatDate(t.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function TicketList() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tickets, setTickets] = useState<TicketListRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [visibleLimit, setVisibleLimit] = useState(TICKET_PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<TicketListFilters>(() => {
    const initial: TicketListFilters = {};
    const status = searchParams.get('status');
    const severity = searchParams.get('severity');
    const building_id = searchParams.get('building_id');
    initial.status = (status as TicketListFilters['status']) || 'open';
    if (severity) initial.severity = severity as TicketListFilters['severity'];
    if (building_id) initial.building_id = building_id;
    return initial;
  });

  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.status && filters.status !== 'open') params.set('status', filters.status); // 'open' is the default
    if (filters.severity && filters.severity !== 'all') params.set('severity', filters.severity);
    if (filters.building_id) params.set('building_id', filters.building_id);
    setSearchParams(params, { replace: true });
  }, [filters, setSearchParams]);

  // ── Pagination: growing window ──
  // We always fetch rows 0..limit-1. "Load more" grows the limit; realtime
  // refreshes refetch the SAME window, so a database change never collapses
  // the user's scrolled list back to page one.
  const loadWindow = useCallback(
    async (limit: number, mode: 'initial' | 'more' | 'refresh') => {
      if (mode === 'initial') setLoading(true);
      if (mode === 'more') setLoadingMore(true);
      setError(null);
      try {
        const { rows, count } = await fetchTicketList(filters, limit);
        setTickets(rows);
        setTotalCount(count);
      } catch (e) {
        console.error('[tickets] load failed:', e);
        setError(friendlyError(e, "Couldn't load work orders."));
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [filters],
  );

  // Filter change (and mount): reset the window and reload from scratch
  useEffect(() => {
    setVisibleLimit(TICKET_PAGE_SIZE);
    loadWindow(TICKET_PAGE_SIZE, 'initial');
  }, [loadWindow]);

  const handleLoadMore = () => {
    const next = visibleLimit + TICKET_PAGE_SIZE;
    setVisibleLimit(next);
    loadWindow(next, 'more');
  };

  // Realtime: silently refresh whatever window is currently visible
  const refresh = useCallback(() => {
    loadWindow(visibleLimit, 'refresh');
  }, [loadWindow, visibleLimit]);
  useRealtimeTickets(refresh, !loading);

  const isDefaultView = (filters.status ?? 'open') === 'open'
    && (!filters.severity || filters.severity === 'all')
    && !filters.search && !filters.building_id && !filters.date_from && !filters.date_to;
  const hasMore = tickets.length < totalCount;
  const remaining = totalCount - tickets.length;

  return (
    <PageTransition>
      <div className="flex items-start justify-between gap-3 mb-4 sm:mb-6">
        <div className="min-w-0">
          <h2 className="text-lg sm:text-xl font-bold tracking-tight">Work orders</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {totalCount} {(filters.status ?? 'open') === 'open' ? 'open ' : ''}work order{totalCount !== 1 ? 's' : ''}
          </p>
        </div>
        <Button asChild size="lg">
          <Link to="new"><Plus className="h-5 w-5" aria-hidden="true" /> Report a problem</Link>
        </Button>
      </div>

      <TicketFilters filters={filters} onChange={setFilters} />

      <ErrorBanner message={error} onRetry={() => loadWindow(visibleLimit, 'initial')} onDismiss={() => setError(null)} />

      {loading ? (
        <>
          <div className="md:hidden"><CardSkeleton /></div>
          <div className="hidden md:block"><TableSkeleton /></div>
        </>
      ) : tickets.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-16 px-4">
          <Ticket className="h-12 w-12 text-muted-foreground/30 mb-4" aria-hidden="true" />
          <div className="text-base font-semibold mb-1">
            {isDefaultView
              ? 'No open work orders'
              : 'No work orders match these filters'}
          </div>
          <div className="text-sm text-muted-foreground max-w-sm mb-4">
            {isDefaultView
              ? 'Everything is taken care of. Report a problem when something comes up.'
              : 'Try "All" or clear the filters to see completed and cancelled work orders too.'}
          </div>
          <Button asChild variant="outline">
            <Link to="new"><Plus className="h-4 w-4" aria-hidden="true" /> Report a problem</Link>
          </Button>
        </div>
      ) : (
        <>
          {/* Mobile: card layout */}
          <div className="space-y-2 md:hidden">
            {tickets.map((t) => (
              <TicketCard key={t.id} ticket={t} onClick={() => navigate(t.id)} />
            ))}
          </div>

          {/* Desktop: table layout */}
          <TicketTable tickets={tickets} onRowClick={(id) => navigate(id)} />

          {/* Load more — shown only when the window hasn't reached the total */}
          {hasMore && (
            <div className="flex flex-col items-center gap-2 mt-6">
              <Button variant="outline" onClick={handleLoadMore} disabled={loadingMore}>
                {loadingMore ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Loading…</>
                ) : (
                  <>Load {Math.min(TICKET_PAGE_SIZE, remaining)} more</>
                )}
              </Button>
              <p className="text-xs text-muted-foreground">
                Showing {tickets.length} of {totalCount}
              </p>
            </div>
          )}
        </>
      )}
    </PageTransition>
  );
}
