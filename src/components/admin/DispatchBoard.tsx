// =============================================================================
// PlumbTix — Dispatch Board (Mobile-First Rebuild)
// =============================================================================
// Mobile: Vertical collapsible status sections with ticket cards
// Desktop: Horizontal Kanban board (unchanged visual)
// =============================================================================

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
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useRealtimeTickets } from '@/hooks/useRealtime';
import { toast } from 'sonner';
import {
  RefreshCcw, Loader2, ChevronDown, ChevronRight, Search,
  MapPin, Wrench, Calendar, Filter, X,
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

const STATUS_COLORS: Record<TicketStatus, { bg: string; border: string; text: string; dot: string }> = {
  new:               { bg: '#eff6ff', border: '#93c5fd', text: '#1e40af', dot: '#3b82f6' },
  needs_info:        { bg: '#fefce8', border: '#fcd34d', text: '#92400e', dot: '#f59e0b' },
  scheduled:         { bg: '#f0fdf4', border: '#86efac', text: '#166534', dot: '#22c55e' },
  dispatched:        { bg: '#ecfdf5', border: '#6ee7b7', text: '#065f46', dot: '#10b981' },
  on_site:           { bg: '#faf5ff', border: '#c4b5fd', text: '#5b21b6', dot: '#8b5cf6' },
  in_progress:       { bg: '#faf5ff', border: '#a78bfa', text: '#4c1d95', dot: '#7c3aed' },
  waiting_approval:  { bg: '#fffbeb', border: '#f59e0b', text: '#78350f', dot: '#f59e0b' },
  completed:         { bg: '#f0fdf4', border: '#22c55e', text: '#14532d', dot: '#22c55e' },
  invoiced:          { bg: '#f8fafc', border: '#94a3b8', text: '#334155', dot: '#94a3b8' },
  cancelled:         { bg: '#fef2f2', border: '#fca5a5', text: '#991b1b', dot: '#ef4444' },
};

const SEVERITY_BADGE: Record<string, 'destructive' | 'warning' | 'secondary'> = {
  emergency: 'destructive', urgent: 'warning', standard: 'secondary',
};

// ---------------------------------------------------------------------------
// Mobile Ticket Card
// ---------------------------------------------------------------------------

function MobileTicketCard({ ticket, isUpdating, onNavigate, onTransition }: {
  ticket: DispatchTicket;
  isUpdating: boolean;
  onNavigate: () => void;
  onTransition: (s: TicketStatus) => void;
}) {
  const transitions = getAllowedTransitions(ticket.status, 'proroto_admin');
  const spaceLabel = ticket.space?.unit_number
    ? `Unit ${ticket.space.unit_number}`
    : ticket.space?.common_area_type ?? '';

  return (
    <div className="dispatch-card">
      <div className="dispatch-card-tap" onClick={onNavigate}>
        {/* Row 1: Ticket # + severity */}
        <div className="dispatch-card-top">
          <span className="dispatch-card-number">#{ticket.ticket_number}</span>
          <Badge variant={SEVERITY_BADGE[ticket.severity] ?? 'secondary'} className="text-[10px] px-1.5 py-0">
            {SEVERITY_LABELS[ticket.severity]}
          </Badge>
        </div>

        {/* Row 2: Issue type */}
        <div className="dispatch-card-issue">{ISSUE_TYPE_LABELS[ticket.issue_type]}</div>

        {/* Row 3: Location */}
        <div className="dispatch-card-meta">
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="truncate">
            {ticket.building?.name || ticket.building?.address_line1 || '—'}
            {spaceLabel && ` · ${spaceLabel}`}
          </span>
        </div>

        {/* Row 4: Tech + Date */}
        <div className="dispatch-card-row">
          {ticket.assigned_technician && (
            <div className="dispatch-card-meta">
              <Wrench className="h-3 w-3 shrink-0" />
              <span className="truncate">{ticket.assigned_technician}</span>
            </div>
          )}
          {ticket.scheduled_date && (
            <div className="dispatch-card-meta">
              <Calendar className="h-3 w-3 shrink-0" />
              {new Date(ticket.scheduled_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>
          )}
        </div>
      </div>

      {/* Transition buttons */}
      {transitions.length > 0 && (
        <div className="dispatch-card-actions">
          {transitions.map((ts) => {
            const tColors = STATUS_COLORS[ts];
            return (
              <button key={ts} className="dispatch-action-btn" onClick={() => onTransition(ts)}
                disabled={isUpdating}
                style={{ '--action-bg': tColors.bg, '--action-border': tColors.border, '--action-text': tColors.text } as React.CSSProperties}>
                {isUpdating ? <Loader2 className="h-3 w-3 animate-spin" /> : `→ ${STATUS_LABELS[ts]}`}
              </button>
            );
          })}
        </div>
      )}

      <ChevronRight className="dispatch-card-chevron" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Desktop Kanban Card
// ---------------------------------------------------------------------------

function KanbanCard({ ticket, isUpdating, onNavigate, onTransition }: {
  ticket: DispatchTicket; isUpdating: boolean;
  onNavigate: () => void; onTransition: (s: TicketStatus) => void;
}) {
  const transitions = getAllowedTransitions(ticket.status, 'proroto_admin');
  const spaceLabel = ticket.space?.unit_number ? `Unit ${ticket.space.unit_number}` : ticket.space?.common_area_type ?? '';
  const sevColor = SEVERITY_BADGE[ticket.severity] ?? 'secondary';

  return (
    <div className="kanban-card">
      <div onClick={onNavigate} style={{ cursor: 'pointer' }}>
        <div className="flex justify-between items-center mb-1">
          <strong style={{ fontSize: '0.85rem' }}>#{ticket.ticket_number}</strong>
          <Badge variant={sevColor} className="text-[10px] px-1.5 py-0">{SEVERITY_LABELS[ticket.severity]}</Badge>
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
              disabled={isUpdating} className="h-6 px-2 text-[0.65rem]">
              {isUpdating ? <Loader2 className="h-3 w-3 animate-spin" /> : `→ ${STATUS_LABELS[ts]}`}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeletons
// ---------------------------------------------------------------------------

function MobileSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4].map((i) => (
        <div key={i}>
          <Skeleton className="h-10 w-full rounded-lg mb-2" />
          <Skeleton className="h-20 w-full rounded-xl mb-1" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      ))}
    </div>
  );
}

function DesktopSkeleton() {
  return (
    <div className="kanban-board">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="kanban-column" style={{ borderColor: '#e5e7eb' }}>
          <div style={{ padding: '8px 10px' }}><Skeleton className="h-4 w-20" /></div>
          <div style={{ padding: '6px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {[1, 2].map((j) => (
              <div key={j} className="kanban-card">
                <div className="flex justify-between mb-2"><Skeleton className="h-4 w-12" /><Skeleton className="h-3 w-14" /></div>
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
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Mobile accordion — expanded statuses
  const [expanded, setExpanded] = useState<Set<TicketStatus>>(new Set(['new', 'scheduled', 'dispatched', 'in_progress']));

  const toggleExpanded = (status: TicketStatus) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status); else next.add(status);
      return next;
    });
  };

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
            assigned_technician, scheduled_date, created_at,
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
      setError(e instanceof Error ? e.message : 'Failed to load');
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

  const columns = (showTerminal ? TICKET_STATUSES : ACTIVE_STATUSES) as readonly TicketStatus[];
  const grouped = new Map<TicketStatus, DispatchTicket[]>();
  for (const s of columns) grouped.set(s, []);
  for (const t of filteredTickets) grouped.get(t.status)?.push(t);
  const terminalCount = showTerminal ? 0 : filteredTickets.filter((t) => TERMINAL_STATUSES.includes(t.status)).length;

  const hasActiveFilters = !!companyFilter || !!buildingFilter || !!searchFilter;

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
      {/* Header */}
      <div className="flex justify-between items-center mb-3 gap-2">
        <div className="min-w-0">
          <h2 className="text-lg sm:text-xl font-bold tracking-tight">Dispatch</h2>
          <p className="text-xs text-muted-foreground">
            {filteredTickets.length} ticket{filteredTickets.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex gap-2">
          {/* Mobile filter toggle */}
          <Button size="sm" variant={hasActiveFilters ? 'default' : 'outline'}
            className="md:hidden" onClick={() => setFiltersOpen(!filtersOpen)}>
            {hasActiveFilters ? <X className="h-3.5 w-3.5" /> : <Filter className="h-3.5 w-3.5" />}
            {hasActiveFilters ? 'Clear' : 'Filter'}
          </Button>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline ml-1">Refresh</span>
          </Button>
        </div>
      </div>

      {/* Filters — desktop always, mobile collapsible */}
      <div className={`dispatch-filters-wrap ${filtersOpen ? 'open' : ''}`}>
        <div className="dispatch-filters">
          <select className="form-select dispatch-filter-select" value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}>
            <option value="">All Companies</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className="form-select dispatch-filter-select" value={buildingFilter}
            onChange={(e) => setBuildingFilter(e.target.value)}>
            <option value="">All Buildings</option>
            {buildingOptions.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
          <div className="dispatch-search-wrap">
            <Search className="dispatch-search-icon" />
            <input type="text" placeholder="Search #, address, tech…" className="form-input dispatch-search-input"
              value={searchFilter} onChange={(e) => setSearchFilter(e.target.value)} />
          </div>
          <label className="dispatch-checkbox-label">
            <input type="checkbox" checked={showTerminal} onChange={() => setShowTerminal(!showTerminal)} />
            Closed ({terminalCount})
          </label>
        </div>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" className="md:hidden mt-2 text-xs"
            onClick={() => { setCompanyFilter(''); setBuildingFilter(''); setSearchFilter(''); setFiltersOpen(false); }}>
            <X className="h-3 w-3" /> Clear all filters
          </Button>
        )}
      </div>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {/* ═══ MOBILE VIEW: Accordion ═══ */}
      <div className="md:hidden">
        {loading ? <MobileSkeleton /> : (
          <div className="space-y-2">
            {Array.from(columns).map((status) => {
              const col = grouped.get(status) ?? [];
              const colors = STATUS_COLORS[status];
              const isOpen = expanded.has(status);
              if (col.length === 0 && !isOpen) return null; // hide empty collapsed

              return (
                <div key={status} className="dispatch-section">
                  {/* Section header — tappable */}
                  <button className="dispatch-section-header" onClick={() => toggleExpanded(status)}
                    style={{ '--section-bg': colors.bg, '--section-border': colors.border, '--section-text': colors.text, '--section-dot': colors.dot } as React.CSSProperties}>
                    <div className="dispatch-section-left">
                      <span className="dispatch-dot" />
                      <span className="dispatch-section-label">{STATUS_LABELS[status]}</span>
                      <span className="dispatch-section-count">{col.length}</span>
                    </div>
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>

                  {/* Cards */}
                  {isOpen && (
                    <div className="dispatch-section-body">
                      {col.length === 0 ? (
                        <div className="text-center py-4 text-xs text-muted-foreground">No tickets</div>
                      ) : col.map((ticket) => (
                        <MobileTicketCard key={ticket.id} ticket={ticket}
                          isUpdating={updating === ticket.id}
                          onNavigate={() => navigate(`tickets/${ticket.id}`)}
                          onTransition={(s) => handleTransition(ticket, s)} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══ DESKTOP VIEW: Kanban ═══ */}
      <div className="hidden md:block">
        {loading ? <DesktopSkeleton /> : (
          <div className="kanban-board">
            {Array.from(columns).map((status) => {
              const col = grouped.get(status) ?? [];
              const colors = STATUS_COLORS[status];
              return (
                <div key={status} className="kanban-column" style={{ borderColor: colors.border }}>
                  <div className="kanban-col-header" style={{ background: colors.bg, color: colors.text }}>
                    <strong>{STATUS_LABELS[status]}</strong>
                    <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>{col.length}</span>
                  </div>
                  <div className="kanban-col-body">
                    {col.length === 0 ? (
                      <div className="text-center py-4 px-2 text-muted-foreground text-xs">No tickets</div>
                    ) : col.map((ticket) => (
                      <KanbanCard key={ticket.id} ticket={ticket}
                        isUpdating={updating === ticket.id}
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
    </div>
  );
}
