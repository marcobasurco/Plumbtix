import { useEffect, useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { fetchTicketList, type TicketListRow, type TicketListFilters } from '@/lib/tickets';
import { ISSUE_TYPE_LABELS } from '@shared/types/enums';
import { StatusBadge } from './StatusBadge';
import { SeverityBadge } from './SeverityBadge';
import { TicketFilters } from './TicketFilters';
import { Loading } from '@/components/Loading';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Plus, Ticket } from 'lucide-react';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function spaceLabel(space: TicketListRow['space']): string {
  if (space.space_type === 'unit' && space.unit_number) return `Unit ${space.unit_number}`;
  if (space.common_area_type) return space.common_area_type.replace(/_/g, ' ');
  return space.space_type;
}

export function TicketList() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<TicketListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<TicketListFilters>({});

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setTickets(await fetchTicketList(filters)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to load tickets'); }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="animate-in">
      <div className="page-title-bar">
        <div>
          <h2 className="page-title">Tickets</h2>
          <p className="page-subtitle">{tickets.length} ticket{tickets.length !== 1 ? 's' : ''}</p>
        </div>
        <Link to="new" className="btn btn-primary" style={{ textDecoration: 'none' }}>
          <Plus size={16} />
          New Ticket
        </Link>
      </div>

      <TicketFilters filters={filters} onChange={setFilters} />

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {loading ? (
        <Loading message="Loading tickets…" />
      ) : tickets.length === 0 ? (
        <div className="empty-state">
          <Ticket size={48} className="empty-state-icon" />
          <div className="empty-state-title">No tickets found</div>
          <div className="empty-state-text">
            {Object.keys(filters).length > 0 ? 'Try adjusting your filters.' : 'Tickets will appear here once created.'}
          </div>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>#</th><th>Status</th><th>Severity</th><th>Issue</th>
                <th>Building</th><th>Space</th><th>Created By</th><th>Created</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id} onClick={() => navigate(t.id)} style={{ cursor: 'pointer' }}>
                  <td><strong className="text-mono">{t.ticket_number}</strong></td>
                  <td><StatusBadge status={t.status} /></td>
                  <td><SeverityBadge severity={t.severity} /></td>
                  <td style={{ maxWidth: 200 }}>
                    <div style={{ fontWeight: 500 }}>
                      {ISSUE_TYPE_LABELS[t.issue_type as keyof typeof ISSUE_TYPE_LABELS] ?? t.issue_type}
                    </div>
                    {t.description && (
                      <div className="truncate text-muted text-xs" style={{ maxWidth: 180 }}>{t.description}</div>
                    )}
                  </td>
                  <td>{t.building.name || t.building.address_line1}</td>
                  <td>{spaceLabel(t.space)}</td>
                  <td>{t.created_by?.full_name ?? 'Unknown'}</td>
                  <td className="text-muted">{formatDate(t.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
