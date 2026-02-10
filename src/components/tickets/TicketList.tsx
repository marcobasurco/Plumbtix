import { useEffect, useState, useCallback } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { fetchTicketList, type TicketListRow, type TicketListFilters } from '@/lib/tickets';
import { ISSUE_TYPE_LABELS } from '@shared/types/enums';
import { StatusBadge } from './StatusBadge';
import { SeverityBadge } from './SeverityBadge';
import { TicketFilters } from './TicketFilters';
import { ErrorBanner } from '@/components/ErrorBanner';
import { PageTransition } from '@/components/PageTransition';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Ticket } from 'lucide-react';
import { useRealtimeTickets } from '@/hooks/useRealtime';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function spaceLabel(space: TicketListRow['space']): string {
  if (space.space_type === 'unit' && space.unit_number) return `Unit ${space.unit_number}`;
  if (space.common_area_type) return space.common_area_type.replace(/_/g, ' ');
  return space.space_type;
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

export function TicketList() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tickets, setTickets] = useState<TicketListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize filters from URL params (e.g. ?status=open&severity=emergency)
  const [filters, setFilters] = useState<TicketListFilters>(() => {
    const initial: TicketListFilters = {};
    const status = searchParams.get('status');
    const severity = searchParams.get('severity');
    const building_id = searchParams.get('building_id');
    if (status) initial.status = status as TicketListFilters['status'];
    if (severity) initial.severity = severity as TicketListFilters['severity'];
    if (building_id) initial.building_id = building_id;
    return initial;
  });

  // Sync filters back to URL (keeps browser back/forward working)
  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.status && filters.status !== 'all') params.set('status', filters.status);
    if (filters.severity && filters.severity !== 'all') params.set('severity', filters.severity);
    if (filters.building_id) params.set('building_id', filters.building_id);
    setSearchParams(params, { replace: true });
  }, [filters, setSearchParams]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setTickets(await fetchTicketList(filters)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to load tickets'); }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  // Realtime: auto-refresh when tickets/comments/attachments change
  useRealtimeTickets(load, !loading);

  return (
    <PageTransition>
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Tickets</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {tickets.length} ticket{tickets.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button asChild>
          <Link to="new"><Plus className="h-4 w-4" /> New Ticket</Link>
        </Button>
      </div>

      <TicketFilters filters={filters} onChange={setFilters} />

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {loading ? (
        <TableSkeleton />
      ) : tickets.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-16 px-4">
          <Ticket className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <div className="text-base font-semibold mb-1">No tickets found</div>
          <div className="text-sm text-muted-foreground max-w-sm">
            {Object.keys(filters).length > 0 ? 'Try adjusting your filters.' : 'Tickets will appear here once created.'}
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">#</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Severity</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Issue</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Building</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Space</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Created By</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Created</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => navigate(t.id)}
                  className="cursor-pointer transition-colors hover:bg-muted/50"
                >
                  <td className="px-4 py-3 border-t border-border">
                    <strong className="font-mono">{t.ticket_number}</strong>
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
                  <td className="px-4 py-3 border-t border-border">{spaceLabel(t.space)}</td>
                  <td className="px-4 py-3 border-t border-border">{t.created_by?.full_name ?? 'Unknown'}</td>
                  <td className="px-4 py-3 border-t border-border text-muted-foreground">{formatDate(t.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageTransition>
  );
}
