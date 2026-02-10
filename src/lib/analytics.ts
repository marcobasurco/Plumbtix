// =============================================================================
// PlumbTix — Analytics Data Access
// =============================================================================
// Fetches per-company usage, subscription data, and trend metrics
// for the admin Analytics page. All queries use user JWT + RLS.
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
  // Subscription fields (from LEFT JOIN, may be null)
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

export interface UsageMonthRow {
  company_id: string;
  period: string;
  ticket_count: number;
  building_count: number;
  space_count: number;
  user_count: number;
  attachment_bytes: number;
}

export interface PlatformSummary {
  total_companies: number;
  total_buildings: number;
  total_spaces: number;
  total_users: number;
  total_tickets: number;
  open_tickets: number;
  tickets_this_month: number;
  mrr_cents: number; // monthly recurring revenue
  active_trials: number;
  active_paid: number;
  avg_tickets_per_company: number;
  ticket_trend: { month: string; count: number }[];
  status_breakdown: { status: TicketStatus; count: number }[];
  severity_breakdown: { severity: TicketSeverity; count: number }[];
  top_issue_types: { issue_type: string; count: number }[];
}

// ---------------------------------------------------------------------------
// Fetch enhanced company analytics (with subscription data)
// ---------------------------------------------------------------------------

export async function fetchCompanyAnalytics(): Promise<CompanyAnalyticsRow[]> {
  const { data, error } = await supabase
    .from('v_company_analytics')
    .select('*')
    .order('total_tickets', { ascending: false });

  if (error) {
    console.warn('[analytics] v_company_analytics fetch failed:', error.message);
    return [];
  }
  return (data ?? []) as unknown as CompanyAnalyticsRow[];
}

// ---------------------------------------------------------------------------
// Fetch monthly usage history for all companies
// ---------------------------------------------------------------------------

export async function fetchUsageHistory(months = 6): Promise<UsageMonthRow[]> {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('company_usage_monthly')
    .select('*')
    .gte('period', cutoffStr)
    .order('period', { ascending: true });

  if (error) {
    console.warn('[analytics] usage history fetch failed:', error.message);
    return [];
  }
  return (data ?? []) as UsageMonthRow[];
}

// ---------------------------------------------------------------------------
// Fetch platform-wide summary for admin analytics
// ---------------------------------------------------------------------------

const OPEN_STATUSES: TicketStatus[] = [
  'new', 'needs_info', 'scheduled', 'dispatched',
  'on_site', 'in_progress', 'waiting_approval',
];

export async function fetchPlatformSummary(): Promise<PlatformSummary> {
  const [companiesRes, buildingsRes, spacesRes, usersRes, ticketsRes, subsRes] =
    await Promise.all([
      supabase.from('companies').select('id'),
      supabase.from('buildings').select('id'),
      supabase.from('spaces').select('id'),
      supabase.from('users').select('id'),
      supabase.from('tickets').select('id, status, severity, issue_type, created_at'),
      supabase.from('company_subscriptions').select('tier, status, monthly_price_cents, trial_ends_at'),
    ]);

  const tickets = (ticketsRes.data ?? []) as Array<{
    id: string; status: TicketStatus; severity: TicketSeverity;
    issue_type: string; created_at: string;
  }>;

  const subs = (subsRes.data ?? []) as Array<{
    tier: string; status: string; monthly_price_cents: number; trial_ends_at: string | null;
  }>;

  const totalCompanies = companiesRes.data?.length ?? 0;
  const totalTickets = tickets.length;
  const openTickets = tickets.filter(t => OPEN_STATUSES.includes(t.status)).length;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const ticketsThisMonth = tickets.filter(t => t.created_at >= startOfMonth).length;

  // MRR from active paid subscriptions
  const mrrCents = subs
    .filter(s => s.status === 'active')
    .reduce((sum, s) => sum + (s.monthly_price_cents ?? 0), 0);

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
  const severityBreakdown = Array.from(sevMap.entries())
    .map(([severity, count]) => ({ severity, count }));

  // Top issue types
  const issueMap = new Map<string, number>();
  for (const t of tickets) issueMap.set(t.issue_type, (issueMap.get(t.issue_type) ?? 0) + 1);
  const topIssueTypes = Array.from(issueMap.entries())
    .map(([issue_type, count]) => ({ issue_type, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 7);

  // Monthly ticket trend (last 6 months)
  const monthMap = new Map<string, number>();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    monthMap.set(key, 0);
  }
  for (const t of tickets) {
    const d = new Date(t.created_at);
    const key = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    if (monthMap.has(key)) monthMap.set(key, (monthMap.get(key) ?? 0) + 1);
  }
  const ticketTrend = Array.from(monthMap.entries()).map(([month, count]) => ({ month, count }));

  return {
    total_companies: totalCompanies,
    total_buildings: buildingsRes.data?.length ?? 0,
    total_spaces: spacesRes.data?.length ?? 0,
    total_users: usersRes.data?.length ?? 0,
    total_tickets: totalTickets,
    open_tickets: openTickets,
    tickets_this_month: ticketsThisMonth,
    mrr_cents: mrrCents,
    active_trials: activeTrials,
    active_paid: activePaid,
    avg_tickets_per_company: totalCompanies > 0 ? Math.round(totalTickets / totalCompanies) : 0,
    ticket_trend: ticketTrend,
    status_breakdown: statusBreakdown,
    severity_breakdown: severityBreakdown,
    top_issue_types: topIssueTypes,
  };
}
