// =============================================================================
// Work Orders — Dashboard Metrics (PostgREST via User JWT + RLS)
// =============================================================================
// Fetches aggregate data for the dashboard overview page.
// RLS ensures each role only sees data they're entitled to.
// =============================================================================

import { supabase } from './supabaseClient';
import type { TicketStatus, TicketSeverity } from '@shared/types/enums';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DashboardMetrics {
  totalTickets: number;
  openTickets: number;
  emergencyTickets: number;
  completedThisMonth: number;
  totalBuildings: number;
  totalSpaces: number;
  totalCompanies: number;
  statusBreakdown: { status: TicketStatus; count: number }[];
  severityBreakdown: { severity: TicketSeverity; count: number }[];
  recentTickets: RecentTicketRow[];
  ticketsByMonth: { month: string; count: number }[];
  /** Per-company breakdown (proroto_admin only — empty for other roles) */
  companyBreakdown: CompanyAnalyticsRow[];
}

export interface CompanyAnalyticsRow {
  company_id: string;
  company_name: string;
  building_count: number;
  space_count: number;
  user_count: number;
  total_tickets: number;
  open_tickets: number;
  tickets_this_month: number;
}

export interface RecentTicketRow {
  id: string;
  ticket_number: number;
  status: TicketStatus;
  severity: TicketSeverity;
  issue_type: string;
  created_at: string;
  building_name: string;
}

const OPEN_STATUSES: TicketStatus[] = [
  'new', 'needs_info', 'scheduled', 'dispatched', 'on_site', 'in_progress', 'waiting_approval',
];

// ---------------------------------------------------------------------------
// Fetch dashboard metrics
// ---------------------------------------------------------------------------

export async function fetchDashboardMetrics(): Promise<DashboardMetrics> {
  // Parallel fetches for speed
  const [ticketsRes, buildingsRes, spacesRes, companiesRes] = await Promise.all([
    supabase.from('tickets').select('id, status, severity, issue_type, created_at, ticket_number, building:buildings(name, address_line1)'),
    supabase.from('buildings').select('id'),
    supabase.from('spaces').select('id'),
    supabase.from('companies').select('id'),
  ]);

  const tickets = (ticketsRes.data ?? []) as unknown as Array<{
    id: string;
    status: TicketStatus;
    severity: TicketSeverity;
    issue_type: string;
    created_at: string;
    ticket_number: number;
    building: { name: string | null; address_line1: string } | null;
  }>;

  const totalTickets = tickets.length;
  const openTickets = tickets.filter(t => OPEN_STATUSES.includes(t.status)).length;
  const emergencyTickets = tickets.filter(t => t.severity === 'emergency' && OPEN_STATUSES.includes(t.status)).length;

  // Completed this month
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const completedThisMonth = tickets.filter(
    t => (t.status === 'completed' || t.status === 'invoiced') && t.created_at >= startOfMonth
  ).length;

  // Status breakdown
  const statusMap = new Map<TicketStatus, number>();
  for (const t of tickets) {
    statusMap.set(t.status, (statusMap.get(t.status) ?? 0) + 1);
  }
  const statusBreakdown = Array.from(statusMap.entries())
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count);

  // Severity breakdown
  const sevMap = new Map<TicketSeverity, number>();
  for (const t of tickets) {
    sevMap.set(t.severity, (sevMap.get(t.severity) ?? 0) + 1);
  }
  const severityBreakdown = Array.from(sevMap.entries())
    .map(([severity, count]) => ({ severity, count }));

  // Recent tickets (last 5)
  const sorted = [...tickets].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const recentTickets: RecentTicketRow[] = sorted.slice(0, 5).map(t => ({
    id: t.id,
    ticket_number: t.ticket_number,
    status: t.status,
    severity: t.severity,
    issue_type: t.issue_type,
    created_at: t.created_at,
    building_name: t.building?.name || t.building?.address_line1 || 'Unknown',
  }));

  // Tickets by month (last 6 months)
  const monthMap = new Map<string, number>();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    monthMap.set(key, 0);
  }
  for (const t of tickets) {
    const d = new Date(t.created_at);
    const key = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    if (monthMap.has(key)) {
      monthMap.set(key, (monthMap.get(key) ?? 0) + 1);
    }
  }
  const ticketsByMonth = Array.from(monthMap.entries()).map(([month, count]) => ({ month, count }));

  // Per-company breakdown (works for proroto_admin via v_company_analytics view)
  let companyBreakdown: CompanyAnalyticsRow[] = [];
  try {
    const { data: analytics } = await supabase
      .from('v_company_analytics')
      .select('*')
      .order('total_tickets', { ascending: false });

    companyBreakdown = (analytics ?? []) as unknown as CompanyAnalyticsRow[];
  } catch {
    // View may not exist yet (pre-migration) — gracefully degrade
  }

  return {
    totalTickets,
    openTickets,
    emergencyTickets,
    completedThisMonth,
    totalBuildings: buildingsRes.data?.length ?? 0,
    totalSpaces: spacesRes.data?.length ?? 0,
    totalCompanies: companiesRes.data?.length ?? 0,
    statusBreakdown,
    severityBreakdown,
    recentTickets,
    ticketsByMonth,
    companyBreakdown,
  };
}
