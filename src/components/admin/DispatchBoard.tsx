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
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useRealtimeTickets } from '@/hooks/useRealtime';
import { toast } from 'sonner';
import { RefreshCcw, Loader2 } from 'lucide-react';

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

const ACTIVE_STATUSES: TicketStatus[] = [
  'new', 'needs_info', 'scheduled', 'dispatched',
  'on_site', 'in_progress', 'waiting_approval',
];
const TERMINAL_STATUSES: TicketStatus[] = ['completed', 'invoiced', 'cancelled'];

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
  emergency: '#dc2626', urgent: '#f59e0b', standard: '#6b7280',
};

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function BoardSkeleton() {
  return (
    <div style={boardStyle}>
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} style={{ ...columnStyle, borderColor: '#e5e7eb' }}>
          <div style={{ padding: '8px 10px' }}><Skeleton className="h-4 w-20" /></div>
          <div style={{ padding: '6px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {[1, 2].map((j) => (
              <div key={j} style={{ background: '#fff', borderRadius: '6px', padding: '10px', border: '1px solid #f3f4f6' }}>
                <div className="flex justify-between mb-2">
                  <Skeleton className="h-4 w-12" /><Skeleton className="h-3 w-14" />
                </div>
                <Skeleton className="h-3 w-24 mb-1" /><Skeleton className="h-3 w-32" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DispatchBoard() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<DispatchTicket[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  const [companyFilter, setCompanyFilter] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [showTerminal, setShowTerminal] = useState(false);

  const buildingOptions = Array.from(
    new Map(
      tickets.filter((t) => t.building)
        .map((t) => [t.building!.id, { id: t.building!.id, label: t.building!.name || t.building!.address_line1 }])
    ).values()
  );
  const [buildingFilter, setBuildingFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
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
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Realtime: auto-refresh when any ticket changes
  useRealtimeTickets(load, !loading);

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

  const columns = (showTerminal ? TICKET_STATUSES : ACTIVE_STATUSES) as readonly TicketStatus[];
  const grouped = new Map<TicketStatus, DispatchTicket[]>();
  for (const s of columns) grouped.set(s, []);
  for (const t of filteredTickets) { grouped.get(t.status)?.push(t); }
  const terminalCount = showTerminal ? 0 : filteredTickets.filter((t) => TERMINAL_STATUSES.includes(t.status)).length;

  const handleTransition = async (ticket: DispatchTicket, newStatus: TicketStatus) => {
    setUpdating(ticket.id); setError(null);
    const result = await updateTicket({ ticket_id: ticket.id, status: newStatus });
    if (result.ok) {
      setTickets((prev) => prev.map((t) => t.id === ticket.id ? { ...t, status: newStatus } : t));
      toast.success(`#${ticket.ticket_number} → ${STATUS_LABELS[newStatus]}`);
    } else {
      toast.error(`Failed: ${result.error.message}`);
      setError(`Failed to update #${ticket.ticket_number}: ${result.error.message}`);
    }
    setUpdating(null);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
        <h2 style={{ fontSize: '1.15rem', margin: 0 }}>
          Dispatch Board
          <span style={{ fontSize: '0.85rem', color: '#6b7280', fontWeight: 400, marginLeft: '8px' }}>
            {filteredTickets.length} ticket{filteredTickets.length !== 1 ? 's' : ''}
          </span>
        </h2>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />} Refresh
        </Button>
      </div>

      <div className="dispatch-filters flex gap-2 flex-wrap mb-4">
        <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)} style={filterSelect}>
          <option value="">All Companies</option>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={buildingFilter} onChange={(e) => setBuildingFilter(e.target.value)} style={filterSelect}>
          <option value="">All Buildings</option>
          {buildingOptions.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
        </select>
        <input type="text" placeholder="Search #, address, tech…"
          value={searchFilter} onChange={(e) => setSearchFilter(e.target.value)}
          style={{ ...filterSelect, width: '180px' }} />
        <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer select-none">
          <input type="checkbox" checked={showTerminal} onChange={() => setShowTerminal(!showTerminal)} />
          Show closed ({terminalCount})
        </label>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {loading ? <BoardSkeleton /> : (
        <div style={boardStyle}>
          {Array.from(columns).map((status) => {
            const col = grouped.get(status) ?? [];
            const colors = STATUS_COLORS[status];
            return (
              <div key={status} style={{ ...columnStyle, borderColor: colors.border }}>
                <div style={{ ...colHeaderStyle, background: colors.bg, color: colors.text }}>
                  <strong>{STATUS_LABELS[status]}</strong>
                  <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>{col.length}</span>
                </div>
                <div style={colBody}>
                  {col.length === 0 ? (
                    <div className="text-center py-4 px-2 text-muted-foreground text-xs">No tickets</div>
                  ) : col.map((ticket) => (
                    <TicketCard key={ticket.id} ticket={ticket} isUpdating={updating === ticket.id}
                      onNavigate={() => navigate(`tickets/${ticket.id}`)}
                      onTransition={(s) => handleTransition(ticket, s)} />
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
// TicketCard
// ---------------------------------------------------------------------------

function TicketCard({ ticket, isUpdating, onNavigate, onTransition }: {
  ticket: DispatchTicket; isUpdating: boolean;
  onNavigate: () => void; onTransition: (s: TicketStatus) => void;
}) {
  const transitions = getAllowedTransitions(ticket.status, 'proroto_admin');
  const spaceLabel = ticket.space?.unit_number ? `Unit ${ticket.space.unit_number}` : ticket.space?.common_area_type ?? '';

  return (
    <div style={cardStyle}>
      <div onClick={onNavigate} style={{ cursor: 'pointer' }}>
        <div className="flex justify-between items-center mb-1">
          <strong style={{ fontSize: '0.85rem' }}>#{ticket.ticket_number}</strong>
          <span style={{ fontSize: '0.7rem', fontWeight: 600, color: SEVERITY_COLORS[ticket.severity] ?? '#6b7280' }}>
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
          <div style={{ fontSize: '0.75rem', color: '#2563eb', marginTop: '2px' }}>🔧 {ticket.assigned_technician}</div>
        )}
        {ticket.scheduled_date && (
          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '1px' }}>
            📅 {new Date(ticket.scheduled_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </div>
        )}
      </div>
      {transitions.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2 pt-1.5" style={{ borderTop: '1px solid #f3f4f6' }}>
          {transitions.map((ts) => (
            <Button key={ts} variant="ghost" size="sm" onClick={() => onTransition(ts)}
              disabled={isUpdating} className="h-6 px-2 text-[0.65rem]" title={`Move to ${STATUS_LABELS[ts]}`}>
              {isUpdating ? <Loader2 className="h-3 w-3 animate-spin" /> : `→ ${STATUS_LABELS[ts]}`}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const boardStyle: React.CSSProperties = {
  display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '16px', minHeight: '400px',
};
const columnStyle: React.CSSProperties = {
  minWidth: '220px', maxWidth: '260px', flex: '1 0 220px',
  background: '#fafafa', borderRadius: '8px', border: '1px solid #e5e7eb', borderTopWidth: '3px',
  display: 'flex', flexDirection: 'column',
};
const colHeaderStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '8px 10px', fontSize: '0.8rem', borderRadius: '6px 6px 0 0',
};
const colBody: React.CSSProperties = {
  flex: 1, padding: '6px', display: 'flex', flexDirection: 'column', gap: '6px',
  overflowY: 'auto', maxHeight: '600px',
};
const cardStyle: React.CSSProperties = {
  background: '#fff', borderRadius: '6px', padding: '8px 10px',
  border: '1px solid #e5e7eb', boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
};
const filterSelect: React.CSSProperties = {
  padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.8rem', background: '#fff',
};
