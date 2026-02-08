import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { updateTicket } from '@/lib/api';
import { fetchCompanyOptions, type CompanyOption } from '@/lib/admin';
import {
  TICKET_STATUSES,
  STATUS_LABELS,
  ISSUE_TYPE_LABELS,
  SEVERITY_LABELS,
} from '@shared/types/enums';
import type { TicketStatus, IssueType, TicketSeverity } from '@shared/types/enums';
import { getAllowedTransitions } from '@shared/types/transitions';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Loading } from '@/components/Loading';

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
  created_at: string;
  building: { id: string; name: string | null; address_line1: string; company_id: string } | null;
  space: { id: string; unit_number: string | null; common_area_type: string | null } | null;
  created_by: { id: string; full_name: string } | null;
}

// Statuses to show as columns (active workflow, not terminal by default)
const ACTIVE_STATUSES: TicketStatus[] = [
  'new', 'needs_info', 'scheduled', 'dispatched',
  'on_site', 'in_progress', 'waiting_approval',
];
const TERMINAL_STATUSES: TicketStatus[] = ['completed', 'invoiced', 'cancelled'];

// Colors per status
const STATUS_COLORS: Record<TicketStatus, { bg: string; border: string; text: string }> = {
  new:               { bg: '#eff6ff', border: '#93c5fd', text: '#1e40af' },
  needs_info:        { bg: '#fefce8', border: '#fcd34d', text: '#92400e' },
  scheduled:         { bg: '#f0fdf4', border: '#86efac', text: '#166534' },
  dispatched:        { bg: '#ecfdf5', border: '#6ee7b7', text: '#065f46' },
  on_site:           { bg: '#faf5ff', border: '#c4b5fd', text: '#5b21b6' },
  in_progress:       { bg: '#faf5ff', border: '#a78bfa', text: '#4c1d95' },
  waiting_approval:  { bg: '#fffbeb', border: '#f59e0b', text: '#78350f' },
  completed:         { bg: '#f0fdf4', border: '#22c55e', text: '#14532d' },
  invoiced:          { bg: '#f8fafc', border: '#94a3b8', text: '#334155' },
  cancelled:         { bg: '#fef2f2', border: '#fca5a5', text: '#991b1b' },
};

const SEVERITY_COLORS: Record<string, string> = {
  emergency: '#dc2626',
  urgent: '#f59e0b',
  standard: '#6b7280',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DispatchBoard() {
  const navigate = useNavigate();

  const [tickets, setTickets] = useState<DispatchTicket[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null); // ticket id being updated

  // Filters
  const [companyFilter, setCompanyFilter] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [showTerminal, setShowTerminal] = useState(false);

  // Building options for filter (derived from tickets)
  const buildingOptions = Array.from(
    new Map(
      tickets
        .filter((t) => t.building)
        .map((t) => [t.building!.id, { id: t.building!.id, label: t.building!.name || t.building!.address_line1 }])
    ).values()
  );
  const [buildingFilter, setBuildingFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ticketResult, companyResult] = await Promise.all([
        supabase
          .from('tickets')
          .select(`
            id, ticket_number, status, severity, issue_type, description,
            assigned_technician, scheduled_date, created_at,
            building:buildings(id, name, address_line1, company_id),
            space:spaces(id, unit_number, common_area_type),
            created_by:users!tickets_created_by_user_id_fkey(id, full_name)
          `)
          .order('created_at', { ascending: false }),
        fetchCompanyOptions(),
      ]);

      if (ticketResult.error) throw new Error(ticketResult.error.message);
      setTickets((ticketResult.data ?? []) as unknown as DispatchTicket[]);
      setCompanies(companyResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Apply filters
  const filteredTickets = tickets.filter((t) => {
    if (companyFilter && t.building?.company_id !== companyFilter) return false;
    if (buildingFilter && t.building?.id !== buildingFilter) return false;
    if (searchFilter) {
      const q = searchFilter.toLowerCase();
      const haystack = [
        `#${t.ticket_number}`,
        t.description,
        t.assigned_technician,
        t.building?.name,
        t.building?.address_line1,
        t.space?.unit_number,
        t.created_by?.full_name,
      ].filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  // Group by status
  const columns = (showTerminal ? TICKET_STATUSES : ACTIVE_STATUSES) as readonly TicketStatus[];
  const grouped = new Map<TicketStatus, DispatchTicket[]>();
  for (const s of columns) grouped.set(s, []);
  for (const t of filteredTickets) {
    const col = grouped.get(t.status);
    if (col) col.push(t);
  }

  // Count terminal tickets if hidden
  const terminalCount = showTerminal ? 0 : filteredTickets.filter((t) => TERMINAL_STATUSES.includes(t.status)).length;

  // Status transition handler
  const handleTransition = async (ticket: DispatchTicket, newStatus: TicketStatus) => {
    setUpdating(ticket.id);
    setError(null);

    const result = await updateTicket({ ticket_id: ticket.id, status: newStatus });
    if (result.ok) {
      // Optimistic update
      setTickets((prev) => prev.map((t) =>
        t.id === ticket.id ? { ...t, status: newStatus } : t
      ));
    } else {
      setError(`Failed to update #${ticket.ticket_number}: ${result.error.message}`);
    }
    setUpdating(null);
  };

  return (
    <div>
      {/* Header + Filters */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
        <h2 style={{ fontSize: '1.15rem', margin: 0 }}>
          Dispatch Board
          <span style={{ fontSize: '0.85rem', color: '#6b7280', fontWeight: 400, marginLeft: '8px' }}>
            {filteredTickets.length} ticket{filteredTickets.length !== 1 ? 's' : ''}
          </span>
        </h2>
        <button
          onClick={load}
          style={{ ...filterBtn, background: '#2563eb', color: '#fff', border: 'none' }}
          disabled={loading}
        >
          {loading ? '↻' : '↻ Refresh'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)} style={filterSelect}>
          <option value="">All Companies</option>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={buildingFilter} onChange={(e) => setBuildingFilter(e.target.value)} style={filterSelect}>
          <option value="">All Buildings</option>
          {buildingOptions.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
        </select>
        <input
          type="text" placeholder="Search #, address, tech…"
          value={searchFilter} onChange={(e) => setSearchFilter(e.target.value)}
          style={{ ...filterSelect, width: '180px' }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', color: '#6b7280', cursor: 'pointer' }}>
          <input type="checkbox" checked={showTerminal} onChange={() => setShowTerminal(!showTerminal)} />
          Show closed ({terminalCount})
        </label>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {loading ? <Loading message="Loading dispatch board…" /> : (
        <div style={boardStyle}>
          {Array.from(columns).map((status) => {
            const col = grouped.get(status) ?? [];
            const colors = STATUS_COLORS[status];
            return (
              <div key={status} style={{ ...columnStyle, borderColor: colors.border }}>
                {/* Column header */}
                <div style={{ ...colHeaderStyle, background: colors.bg, color: colors.text }}>
                  <strong>{STATUS_LABELS[status]}</strong>
                  <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>{col.length}</span>
                </div>

                {/* Cards */}
                <div style={colBody}>
                  {col.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '16px 8px', color: '#d1d5db', fontSize: '0.8rem' }}>
                      No tickets
                    </div>
                  ) : col.map((ticket) => (
                    <TicketCard
                      key={ticket.id}
                      ticket={ticket}
                      isUpdating={updating === ticket.id}
                      onNavigate={() => navigate(`tickets/${ticket.id}`)}
                      onTransition={(newStatus) => handleTransition(ticket, newStatus)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ticket Card sub-component
// ---------------------------------------------------------------------------

function TicketCard({
  ticket,
  isUpdating,
  onNavigate,
  onTransition,
}: {
  ticket: DispatchTicket;
  isUpdating: boolean;
  onNavigate: () => void;
  onTransition: (status: TicketStatus) => void;
}) {
  const transitions = getAllowedTransitions(ticket.status, 'proroto_admin');
  const spaceLabel = ticket.space?.unit_number
    ? `Unit ${ticket.space.unit_number}`
    : ticket.space?.common_area_type ?? '';

  return (
    <div style={cardStyle}>
      {/* Clickable area → ticket detail */}
      <div onClick={onNavigate} style={{ cursor: 'pointer' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <strong style={{ fontSize: '0.85rem' }}>#{ticket.ticket_number}</strong>
          <span style={{
            fontSize: '0.7rem', fontWeight: 600,
            color: SEVERITY_COLORS[ticket.severity] ?? '#6b7280',
          }}>
            {SEVERITY_LABELS[ticket.severity]}
          </span>
        </div>
        <div style={{ fontSize: '0.8rem', color: '#374151', marginBottom: '2px' }}>
          {ISSUE_TYPE_LABELS[ticket.issue_type]}
        </div>
        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
          {ticket.building?.name || ticket.building?.address_line1 || '—'}
          {spaceLabel && ` · ${spaceLabel}`}
        </div>
        {ticket.assigned_technician && (
          <div style={{ fontSize: '0.75rem', color: '#2563eb', marginTop: '2px' }}>
            🔧 {ticket.assigned_technician}
          </div>
        )}
        {ticket.scheduled_date && (
          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '1px' }}>
            📅 {new Date(ticket.scheduled_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </div>
        )}
      </div>

      {/* Transition buttons */}
      {transitions.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '8px', paddingTop: '6px', borderTop: '1px solid #f3f4f6' }}>
          {transitions.map((ts) => (
            <button
              key={ts}
              onClick={() => onTransition(ts)}
              disabled={isUpdating}
              style={transBtn}
              title={`Move to ${STATUS_LABELS[ts]}`}
            >
              → {STATUS_LABELS[ts]}
            </button>
          ))}
        </div>
      )}
      {isUpdating && <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: '4px' }}>Updating…</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const boardStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  overflowX: 'auto',
  paddingBottom: '16px',
  minHeight: '400px',
};

const columnStyle: React.CSSProperties = {
  minWidth: '220px',
  maxWidth: '260px',
  flex: '1 0 220px',
  background: '#fafafa',
  borderRadius: '8px',
  border: '1px solid #e5e7eb',
  borderTopWidth: '3px',
  display: 'flex',
  flexDirection: 'column',
};

const colHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '8px 10px',
  fontSize: '0.8rem',
  borderRadius: '6px 6px 0 0',
};

const colBody: React.CSSProperties = {
  flex: 1,
  padding: '6px',
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  overflowY: 'auto',
  maxHeight: '600px',
};

const cardStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: '6px',
  padding: '8px 10px',
  border: '1px solid #e5e7eb',
  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
};

const transBtn: React.CSSProperties = {
  background: '#f3f4f6',
  border: '1px solid #e5e7eb',
  borderRadius: '4px',
  padding: '2px 6px',
  fontSize: '0.65rem',
  cursor: 'pointer',
  color: '#374151',
  whiteSpace: 'nowrap',
};

const filterSelect: React.CSSProperties = {
  padding: '5px 8px',
  border: '1px solid #d1d5db',
  borderRadius: '6px',
  fontSize: '0.8rem',
  background: '#fff',
};

const filterBtn: React.CSSProperties = {
  padding: '5px 12px',
  borderRadius: '6px',
  fontSize: '0.8rem',
  cursor: 'pointer',
  fontWeight: 500,
};
