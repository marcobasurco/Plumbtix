// =============================================================================
// PlumbTix — TypeScript Enums
// =============================================================================
// Mirrors all 8 Postgres enums from Section 4 (LOCKED).
// String literal unions for JSON compatibility. Values are EXACT matches.
// =============================================================================

// --- users.role ---
export const USER_ROLES = [
  'proroto_admin',
  'pm_admin',
  'pm_user',
  'resident',
] as const;
export type UserRole = (typeof USER_ROLES)[number];

// --- spaces.space_type ---
export const SPACE_TYPES = ['unit', 'common_area'] as const;
export type SpaceType = (typeof SPACE_TYPES)[number];

// --- spaces.common_area_type ---
export const COMMON_AREA_TYPES = [
  'boiler_room',
  'pool',
  'garage',
  'roof',
  'crawlspace',
  'laundry',
  'water_room',
  'other',
] as const;
export type CommonAreaType = (typeof COMMON_AREA_TYPES)[number];

// --- occupants.occupant_type ---
export const OCCUPANT_TYPES = ['homeowner', 'tenant'] as const;
export type OccupantType = (typeof OCCUPANT_TYPES)[number];

// --- tickets.issue_type ---
export const ISSUE_TYPES = [
  'active_leak',
  'sewer_backup',
  'drain_clog',
  'water_heater',
  'gas_smell',
  'toilet_faucet_shower',
  'other_plumbing',
] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];

// --- tickets.severity ---
export const TICKET_SEVERITIES = ['emergency', 'urgent', 'standard'] as const;
export type TicketSeverity = (typeof TICKET_SEVERITIES)[number];

// --- tickets.status ---
export const TICKET_STATUSES = [
  'new',
  'needs_info',
  'scheduled',
  'dispatched',
  'on_site',
  'in_progress',
  'waiting_approval',
  'completed',
  'invoiced',
  'cancelled',
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

// --- invitations.role ---
export const INVITATION_ROLES = ['pm_admin', 'pm_user'] as const;
export type InvitationRole = (typeof INVITATION_ROLES)[number];

// =============================================================================
// Display labels (frontend rendering)
// =============================================================================

export const ISSUE_TYPE_LABELS: Record<IssueType, string> = {
  active_leak: 'Active Leak / Water Damage',
  sewer_backup: 'Sewer Backup',
  drain_clog: 'Drain Clog',
  water_heater: 'Water Heater',
  gas_smell: 'Gas Smell / Gas Leak',
  toilet_faucet_shower: 'Fixture Repair (Toilet, Faucet, Shower)',
  other_plumbing: 'Other Plumbing',
};

export const SEVERITY_LABELS: Record<TicketSeverity, string> = {
  emergency: 'Emergency',
  urgent: 'Urgent',
  standard: 'Standard',
};

export const STATUS_LABELS: Record<TicketStatus, string> = {
  new: 'New',
  needs_info: 'Needs Info',
  scheduled: 'Scheduled',
  dispatched: 'Dispatched',
  on_site: 'On Site',
  in_progress: 'In Progress',
  waiting_approval: 'Waiting for Approval',
  completed: 'Completed',
  invoiced: 'Invoiced',
  cancelled: 'Cancelled',
};

export const COMMON_AREA_LABELS: Record<CommonAreaType, string> = {
  boiler_room: 'Boiler Room',
  pool: 'Swimming Pool',
  garage: 'Parking Garage',
  roof: 'Roof',
  crawlspace: 'Crawlspace',
  laundry: 'Laundry Room',
  water_room: 'Main Water Room',
  other: 'Other',
};

export const ROLE_LABELS: Record<UserRole, string> = {
  proroto_admin: 'Pro Roto Admin',
  pm_admin: 'Property Manager Admin',
  pm_user: 'Property Manager',
  resident: 'Resident',
};
