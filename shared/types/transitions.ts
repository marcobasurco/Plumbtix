// =============================================================================
// PlumbTix — Ticket Status Transition Matrix
// =============================================================================
//
// CRITICAL: This matrix MUST match the Postgres trigger in migration 00005
// (enforce_ticket_status_transition). If you change one, you MUST change both.
//
// Layers:
//   1. Postgres trigger (00005) — database seatbelt, rejects invalid UPDATEs
//   2. Edge Functions     — validates before calling DB, returns friendly errors
//   3. Frontend           — uses this to render/hide action buttons per role
//
// =============================================================================

import type { TicketStatus, UserRole, IssueType, TicketSeverity } from './enums';

/**
 * For a given (currentStatus, role), returns the list of statuses
 * the user is allowed to transition to. Empty/absent = no transitions.
 */
export const TRANSITION_MATRIX: Record<
  TicketStatus,
  Partial<Record<UserRole, readonly TicketStatus[]>>
> = {
  new: {
    proroto_admin: ['needs_info', 'scheduled', 'cancelled'],
    pm_admin:      ['cancelled'],
    pm_user:       ['cancelled'],
  },

  needs_info: {
    proroto_admin: ['new', 'scheduled', 'cancelled'],
    pm_admin:      ['new', 'cancelled'],
    pm_user:       ['new', 'cancelled'],
  },

  scheduled: {
    proroto_admin: ['dispatched', 'needs_info', 'cancelled'],
  },

  dispatched: {
    proroto_admin: ['on_site', 'scheduled', 'cancelled'],
  },

  on_site: {
    proroto_admin: ['in_progress', 'cancelled'],
  },

  in_progress: {
    proroto_admin: ['waiting_approval', 'completed', 'cancelled'],
  },

  waiting_approval: {
    proroto_admin: ['scheduled', 'in_progress', 'cancelled'],
    pm_admin:      ['scheduled', 'cancelled'],
    pm_user:       ['scheduled', 'cancelled'],
  },

  completed: {
    proroto_admin: ['invoiced'],
  },

  invoiced:  {},
  cancelled: {},
};

// =============================================================================
// Helpers
// =============================================================================

export function isTransitionAllowed(
  currentStatus: TicketStatus,
  targetStatus: TicketStatus,
  role: UserRole,
): boolean {
  const allowed = TRANSITION_MATRIX[currentStatus]?.[role];
  if (!allowed) return false;
  return allowed.includes(targetStatus);
}

export function getAllowedTransitions(
  currentStatus: TicketStatus,
  role: UserRole,
): readonly TicketStatus[] {
  return TRANSITION_MATRIX[currentStatus]?.[role] ?? [];
}

export function isTerminalStatus(status: TicketStatus): boolean {
  const transitions = TRANSITION_MATRIX[status];
  return !transitions || Object.keys(transitions).length === 0;
}

// =============================================================================
// Auto-severity mapping (ticket creation)
// =============================================================================

export const DEFAULT_SEVERITY: Record<IssueType, TicketSeverity> = {
  active_leak:          'emergency',
  sewer_backup:         'emergency',
  gas_smell:            'emergency',
  water_heater:         'urgent',
  drain_clog:           'standard',
  toilet_faucet_shower: 'standard',
  other_plumbing:       'standard',
};

export const EMERGENCY_KEYWORDS = [
  'leak', 'flood', 'flooding', 'water damage', 'burst', 'dripping',
  'sewage', 'sewer', 'backup', 'overflow', 'raw sewage',
  'gas', 'gas smell', 'rotten egg', 'gas leak',
] as const;

export function detectEmergencyKeywords(description: string): boolean {
  const lower = description.toLowerCase();
  return EMERGENCY_KEYWORDS.some((kw) => lower.includes(kw));
}
