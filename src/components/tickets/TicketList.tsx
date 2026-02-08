import { useEffect, useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { fetchTicketList, type TicketListRow, type TicketListFilters } from '@/lib/tickets';
import { ISSUE_TYPE_LABELS } from '@shared/types/enums';
import { StatusBadge } from './StatusBadge';
import { SeverityBadge } from './SeverityBadge';
import { TicketFilters } from './TicketFilters';
import { Loading } from '@/components/Loading';
import { ErrorBanner } from '@/components/ErrorBanner';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
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
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchTicketList(filters);
      setTickets(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tickets');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const handleRowClick = (id: string) => {
    navigate(`tickets/${id}`);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <span />
        <Link
          to="tickets/new"
          className="btn btn-primary"
          style={{ width: 'auto', padding: '8px 20px', fontSize: '0.9rem', textDecoration: 'none' }}
        >
          + New Ticket
        </Link>
      </div>

      <TicketFilters filters={filters} onChange={setFilters} />

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {loading ? (
        <Loading message="Loading tickets…" />
      ) : tickets.length === 0 ? (
        <div style={emptyStyle}>
          <p>No tickets found.</p>
          <p style={{ fontSize: '0.85rem', color: '#9ca3af' }}>
            {Object.keys(filters).length > 0
              ? 'Try adjusting your filters.'
              : 'Tickets will appear here once created.'}
          </p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>#</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Severity</th>
                <th style={thStyle}>Issue</th>
                <th style={thStyle}>Building</th>
                <th style={thStyle}>Space</th>
                <th style={thStyle}>Created By</th>
                <th style={thStyle}>Created</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => handleRowClick(t.id)}
                  style={rowStyle}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = '#f9fafb';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = '';
                  }}
                >
                  <td style={tdStyle}>
                    <strong>{t.ticket_number}</strong>
                  </td>
                  <td style={tdStyle}>
                    <StatusBadge status={t.status} />
                  </td>
                  <td style={tdStyle}>
                    <SeverityBadge severity={t.severity} />
                  </td>
                  <td style={{ ...tdStyle, maxWidth: '200px' }}>
                    <div style={{ fontWeight: 500, fontSize: '0.85rem' }}>
                      {ISSUE_TYPE_LABELS[t.issue_type as keyof typeof ISSUE_TYPE_LABELS] ?? t.issue_type}
                    </div>
                    {t.description && (
                      <div style={{ fontSize: '0.8rem', color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.description}
                      </div>
                    )}
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: '0.85rem' }}>
                      {t.building.name || t.building.address_line1}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: '0.85rem' }}>
                      {spaceLabel(t.space)}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: '0.85rem' }}>
                      {t.created_by?.full_name ?? 'Unknown'}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                      {formatDate(t.created_at)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: '12px', fontSize: '0.8rem', color: '#9ca3af', textAlign: 'right' }}>
        {tickets.length} ticket{tickets.length !== 1 ? 's' : ''}
      </div>
    </div>
  );
}

// Styles
const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '0.9rem',
};
const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 12px',
  borderBottom: '2px solid #e5e7eb',
  fontSize: '0.8rem',
  fontWeight: 600,
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: '0.025em',
};
const tdStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderBottom: '1px solid #f3f4f6',
  verticalAlign: 'middle',
};
const rowStyle: React.CSSProperties = {
  cursor: 'pointer',
  transition: 'background 0.1s',
};
const emptyStyle: React.CSSProperties = {
  textAlign: 'center',
  padding: '48px 24px',
  background: '#f9fafb',
  borderRadius: '8px',
  border: '1px solid #e5e7eb',
  color: '#6b7280',
};
