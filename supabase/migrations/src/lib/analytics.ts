// =============================================================================
// Work Orders — Analytics Data Access
// =============================================================================
// Role-aware: proroto_admin sees all, PM sees only their company (RLS).
// Supports platform summary, company-level, and building-level analytics.
// =============================================================================

import { supabase } from './supabaseClient';
import type { TicketStatus, TicketSeverity } from '@shared/types/enums';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CompanyAnalyticsRow {
  company_id: string;
  company_name: string;
  slug: string;
  building_count: number;
  space_count: number;
  user_count: number;
  total_tickets: number;
  open_tickets: number;
  tickets_this_month: number;
  subscription_tier: string | null;
  subscription_status: string | null;
  max_buildings: number | null;
  max_users: number | null;
  max_tickets_mo: number | null;
  max_storage_mb: number | null;
  monthly_price_cents: number | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
}

export interface BuildingAnalyticsRow {
  building_id: string;
  building_name: string;
  address: string;
  company_id: string;
  company_name: string;
  total_tickets: number;
  open_tickets: number;
  tickets_this_month: number;
  unit_count: number;
  severity_breakdown: { severity: TicketSeverity; count: number }[];
  top_issue_types: { issue_type: string; count: number }[];
}

export interface AnalyticsSummary {
  total_companies: number;
  total_buildings: number;
  total_spaces: number;
  total_users: number;
  total_tickets: number;
  open_tickets: number;
  tickets_this_month: number;
  mrr_cents: number;
  active_trials: number;
  active_paid: number;
  avg_tickets_per_company: number;
  avg_tickets_per_building: number;
  ticket_trend: { month: string; count: number }[];
  status_breakdown: { status: TicketStatus; count: number }[];
  severity_breakdown: { severity: TicketSeverity; count: number }[];
  top_issue_types: { issue_type: string; count: number }[];
}

export interface UsageMonthRow {
  company_id: string;
  period: string;
  ticket_count: number;
  building_count: number;
  space_count: number;
  user_count: number;
  attachment_bytes: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const OPEN_STATUSES: TicketStatus[] = [
  'new', 'needs_info', 'scheduled', 'dispatched',
  'on_site', 'in_progress', 'waiting_approval',
];

// ---------------------------------------------------------------------------
// Fetch company-level analytics (admin sees all, PM sees own)
// ---------------------------------------------------------------------------

export async function fetchCompanyAnalytics(): Promise<CompanyAnalyticsRow[]> {
  const { data, error } = await supabase
    .from('v_company_analytics')
    .select('*')
    .order('total_tickets', { ascending: false });

  if (error) {
    console.warn('[analytics] v_company_analytics failed:', error.message);
    return [];
  }
  return (data ?? []) as unknown as CompanyAnalyticsRow[];
}

// ---------------------------------------------------------------------------
// Fetch building-level analytics
// ---------------------------------------------------------------------------

export async function fetchBuildingAnalytics(
  companyId?: string
): Promise<BuildingAnalyticsRow[]> {
  // Get all buildings (RLS limits PM to their own company)
  let bQuery = supabase
    .from('buildings')
    .select('id, name, address_line1, company_id, companies(name)')
    .order('address_line1');
  if (companyId) bQuery = bQuery.eq('company_id', companyId);

  const { data: buildings, error: bErr } = await bQuery;
  if (bErr || !buildings) return [];

  // Get all tickets for these buildings
  const buildingIds = buildings.map((b: Record<string, unknown>) => b.id as string);
  if (buildingIds.length === 0) return [];

  const { data: tickets } = await supabase
    .from('tickets')
    .select('id, building_id, status, severity, issue_type, created_at')
    .in('building_id', buildingIds);

  // Get unit counts per building
  const { data: spaces } = await supabase
    .from('spaces')
    .select('id, building_id')
    .eq('space_type', 'unit')
    .in('building_id', buildingIds);

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  return buildings.map((b: Record<string, unknown>) => {
    const bId = b.id as string;
    const bTickets = (tickets ?? []).filter(
      (t: Record<string, unknown>) => t.building_id === bId
    );
    const bSpaces = (spaces ?? []).filter(
      (s: Record<string, unknown>) => s.building_id === bId
    );

    const sevMap = new Map<TicketSeverity, number>();
    const issueMap = new Map<string, number>();
    let open = 0;
    let thisMonth = 0;

    for (const t of bTickets) {
      const tk = t as { status: TicketStatus; severity: TicketSeverity; issue_type: string; created_at: string };
      if (OPEN_STATUSES.includes(tk.status)) open++;
      if (tk.created_at >= startOfMonth) thisMonth++;
      sevMap.set(tk.severity, (sevMap.get(tk.severity) ?? 0) + 1);
      issueMap.set(tk.issue_type, (issueMap.get(tk.issue_type) ?? 0) + 1);
    }

    const companyObj = b.companies as { name: string } | null;

    return {
      building_id: bId,
      building_name: (b.name as string) || '',
      address: b.address_line1 as string,
      company_id: b.company_id as string,
      company_name: companyObj?.name ?? '',
      total_tickets: bTickets.length,
      open_tickets: open,
      tickets_this_month: thisMonth,
      unit_count: bSpaces.length,
      severity_breakdown: Array.from(sevMap.entries()).map(([severity, count]) => ({ severity, count })),
      top_issue_types: Array.from(issueMap.entries())
        .map(([issue_type, count]) => ({ issue_type, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
    } as BuildingAnalyticsRow;
  });
}

// ---------------------------------------------------------------------------
// Platform / company summary (role-aware via RLS)
// ---------------------------------------------------------------------------

export async function fetchAnalyticsSummary(
  companyId?: string,
  buildingId?: string
): Promise<AnalyticsSummary> {
  // Tickets query (optionally filtered)
  let tQuery = supabase.from('tickets').select('id, status, severity, issue_type, created_at, building_id');
  if (buildingId) tQuery = tQuery.eq('building_id', buildingId);
  else if (companyId) {
    // Get building IDs for this company first
    const { data: cBuildings } = await supabase.from('buildings').select('id').eq('company_id', companyId);
    const bIds = (cBuildings ?? []).map((b: { id: string }) => b.id);
    if (bIds.length > 0) tQuery = tQuery.in('building_id', bIds);
    else return emptySummary();
  }

  const [ticketsRes, companiesRes, buildingsRes, spacesRes, usersRes, subsRes] =
    await Promise.all([
      tQuery,
      supabase.from('companies').select('id'),
      companyId
        ? supabase.from('buildings').select('id').eq('company_id', companyId)
        : supabase.from('buildings').select('id'),
      companyId
        ? supabase.from('spaces').select('id, building_id').in(
            'building_id',
            (await supabase.from('buildings').select('id').eq('company_id', companyId)).data?.map((b: { id: string }) => b.id) ?? []
          )
        : supabase.from('spaces').select('id'),
      companyId
        ? supabase.from('users').select('id').eq('company_id', companyId)
        : supabase.from('users').select('id'),
      supabase.from('company_subscriptions').select('tier, status, monthly_price_cents, trial_ends_at'),
    ]);

  const tickets = (ticketsRes.data ?? []) as Array<{
    id: string; status: TicketStatus; severity: TicketSeverity;
    issue_type: string; created_at: string; building_id: string;
  }>;

  const subs = (subsRes.data ?? []) as Array<{
    tier: string; status: string; monthly_price_cents: number; trial_ends_at: string | null;
  }>;

  const totalCompanies = companiesRes.data?.length ?? 0;
  const totalBuildings = buildingsRes.data?.length ?? 0;
  const totalTickets = tickets.length;
  const openTickets = tickets.filter(t => OPEN_STATUSES.includes(t.status)).length;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const ticketsThisMonth = tickets.filter(t => t.created_at >= startOfMonth).length;

  const mrrCents = subs.filter(s => s.status === 'active').reduce((sum, s) => sum + (s.monthly_price_cents ?? 0), 0);
  const activeTrials = subs.filter(s => s.status === 'trialing').length;
  const activePaid = subs.filter(s => s.status === 'active').length;

  // Status breakdown
  const statusMap = new Map<TicketStatus, number>();
  for (const t of tickets) statusMap.set(t.status, (statusMap.get(t.status) ?? 0) + 1);
  const statusBreakdown = Array.from(statusMap.entries())
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count);

  // Severity breakdown
  const sevMap = new Map<TicketSeverity, number>();
  for (const t of tickets) sevMap.set(t.severity, (sevMap.get(t.severity) ?? 0) + 1);
  const severityBreakdown = Array.from(sevMap.entries()).map(([severity, count]) => ({ severity, count }));

  // Top issue types
  const issueMap = new Map<string, number>();
  for (const t of tickets) issueMap.set(t.issue_type, (issueMap.get(t.issue_type) ?? 0) + 1);
  const topIssueTypes = Array.from(issueMap.entries())
    .map(([issue_type, count]) => ({ issue_type, count }))
    .sort((a, b) => b.count - a.count).slice(0, 7);

  // Monthly trend (last 6 months)
  const monthMap = new Map<string, number>();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthMap.set(d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), 0);
  }
  for (const t of tickets) {
    const d = new Date(t.created_at);
    const key = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    if (monthMap.has(key)) monthMap.set(key, (monthMap.get(key) ?? 0) + 1);
  }

  return {
    total_companies: totalCompanies,
    total_buildings: totalBuildings,
    total_spaces: spacesRes.data?.length ?? 0,
    total_users: usersRes.data?.length ?? 0,
    total_tickets: totalTickets,
    open_tickets: openTickets,
    tickets_this_month: ticketsThisMonth,
    mrr_cents: mrrCents,
    active_trials: activeTrials,
    active_paid: activePaid,
    avg_tickets_per_company: totalCompanies > 0 ? Math.round(totalTickets / totalCompanies) : 0,
    avg_tickets_per_building: totalBuildings > 0 ? +(totalTickets / totalBuildings).toFixed(1) : 0,
    ticket_trend: Array.from(monthMap.entries()).map(([month, count]) => ({ month, count })),
    status_breakdown: statusBreakdown,
    severity_breakdown: severityBreakdown,
    top_issue_types: topIssueTypes,
  };
}

function emptySummary(): AnalyticsSummary {
  return {
    total_companies: 0, total_buildings: 0, total_spaces: 0, total_users: 0,
    total_tickets: 0, open_tickets: 0, tickets_this_month: 0,
    mrr_cents: 0, active_trials: 0, active_paid: 0,
    avg_tickets_per_company: 0, avg_tickets_per_building: 0,
    ticket_trend: [], status_breakdown: [], severity_breakdown: [], top_issue_types: [],
  };
}

// Keep backward compat alias
export const fetchPlatformSummary = fetchAnalyticsSummary;

// ---------------------------------------------------------------------------
// Usage history
// ---------------------------------------------------------------------------

export async function fetchUsageHistory(months = 6): Promise<UsageMonthRow[]> {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const { data, error } = await supabase
    .from('company_usage_monthly').select('*')
    .gte('period', cutoff.toISOString().slice(0, 10))
    .order('period', { ascending: true });

  if (error) { console.warn('[analytics] usage history failed:', error.message); return []; }
  return (data ?? []) as UsageMonthRow[];
}
