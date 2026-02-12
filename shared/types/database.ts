// =============================================================================
// Work Orders — Database Row Types
// =============================================================================
// TypeScript interfaces for all 11 tables from Section 4 (LOCKED).
// Column names, types, and nullability match the Postgres schema exactly.
// Verified against section4.sql line-by-line.
// =============================================================================

import type {
  UserRole,
  SpaceType,
  CommonAreaType,
  OccupantType,
  IssueType,
  TicketSeverity,
  TicketStatus,
  InvitationRole,
} from './enums';

// --- companies (Section 4, line 39–46) ---
export interface Company {
  id: string;                          // UUID PK, gen_random_uuid()
  name: string;                        // VARCHAR(255) NOT NULL
  slug: string;                        // VARCHAR(100) NOT NULL UNIQUE
  settings: Record<string, unknown>;   // JSONB DEFAULT '{}'
  created_at: string;                  // TIMESTAMPTZ NOT NULL DEFAULT NOW()
  updated_at: string;                  // TIMESTAMPTZ NOT NULL DEFAULT NOW()
}

// --- users (Section 4, line 51–61) ---
export interface User {
  id: string;                          // UUID PK → auth.users(id)
  email: string;                       // VARCHAR(255) NOT NULL UNIQUE
  full_name: string;                   // VARCHAR(255) NOT NULL
  phone: string | null;                // VARCHAR(20)
  role: UserRole;                      // user_role NOT NULL
  company_id: string | null;           // UUID → companies(id) ON DELETE SET NULL
  avatar_url: string | null;           // TEXT
  sms_notifications_enabled: boolean;  // BOOLEAN NOT NULL DEFAULT FALSE
  created_at: string;                  // TIMESTAMPTZ NOT NULL DEFAULT NOW()
  updated_at: string;                  // TIMESTAMPTZ NOT NULL DEFAULT NOW()
}

// --- buildings (Section 4, line 66–83) ---
export interface Building {
  id: string;                          // UUID PK, gen_random_uuid()
  company_id: string;                  // UUID NOT NULL → companies(id)
  name: string | null;                 // VARCHAR(255)
  address_line1: string;               // VARCHAR(255) NOT NULL
  address_line2: string | null;        // VARCHAR(255)
  city: string;                        // VARCHAR(100) NOT NULL
  state: string;                       // CHAR(2) NOT NULL
  zip: string;                         // VARCHAR(10) NOT NULL
  gate_code: string | null;            // VARCHAR(50)
  water_shutoff_location: string | null; // VARCHAR(500)
  gas_shutoff_location: string | null; // VARCHAR(500)
  onsite_contact_name: string | null;  // VARCHAR(255)
  onsite_contact_phone: string | null; // VARCHAR(20)
  access_notes: string | null;         // TEXT
  created_at: string;                  // TIMESTAMPTZ NOT NULL DEFAULT NOW()
  updated_at: string;                  // TIMESTAMPTZ NOT NULL DEFAULT NOW()
}

// --- spaces (Section 4, line 85–96) ---
// CHECK constraint: (unit → unit_number NOT NULL, common_area_type NULL)
//                   (common_area → unit_number NULL, common_area_type NOT NULL)
export interface Space {
  id: string;                          // UUID PK, gen_random_uuid()
  building_id: string;                 // UUID NOT NULL → buildings(id)
  space_type: SpaceType;               // space_type NOT NULL
  unit_number: string | null;          // VARCHAR(20) — NOT NULL when space_type='unit'
  common_area_type: CommonAreaType | null; // common_area_type — NOT NULL when space_type='common_area'
  floor: number | null;                // INTEGER
  bedrooms: number | null;             // INTEGER
  bathrooms: number | null;            // NUMERIC(3,1)
  created_at: string;                  // TIMESTAMPTZ NOT NULL DEFAULT NOW()
  updated_at: string;                  // TIMESTAMPTZ NOT NULL DEFAULT NOW()
}

// --- occupants (Section 4, line 105–118) ---
export interface Occupant {
  id: string;                          // UUID PK, gen_random_uuid()
  space_id: string;                    // UUID NOT NULL → spaces(id)
  user_id: string | null;              // UUID → users(id) ON DELETE SET NULL
  occupant_type: OccupantType;         // occupant_type NOT NULL
  name: string;                        // VARCHAR(255) NOT NULL
  email: string;                       // VARCHAR(255) NOT NULL
  phone: string | null;                // VARCHAR(20)
  invite_token: string | null;         // UUID UNIQUE
  invite_sent_at: string | null;       // TIMESTAMPTZ
  claimed_at: string | null;           // TIMESTAMPTZ
  created_at: string;                  // TIMESTAMPTZ NOT NULL DEFAULT NOW()
  updated_at: string;                  // TIMESTAMPTZ NOT NULL DEFAULT NOW()
}

// --- building_entitlements (Section 4, line 123–128) ---
export interface BuildingEntitlement {
  id: string;                          // UUID PK, gen_random_uuid()
  user_id: string;                     // UUID NOT NULL → users(id)
  building_id: string;                 // UUID NOT NULL → buildings(id)
  created_at: string;                  // TIMESTAMPTZ NOT NULL DEFAULT NOW()
}

// --- invitations (Section 4, line 133–144) ---
export interface Invitation {
  id: string;                          // UUID PK, gen_random_uuid()
  company_id: string;                  // UUID NOT NULL → companies(id)
  email: string;                       // VARCHAR(255) NOT NULL
  name: string;                        // VARCHAR(255) NOT NULL
  role: InvitationRole;                // invitation_role NOT NULL
  token: string;                       // UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE
  invited_by_user_id: string;          // UUID NOT NULL → users(id)
  expires_at: string;                  // TIMESTAMPTZ NOT NULL
  accepted_at: string | null;          // TIMESTAMPTZ
  created_at: string;                  // TIMESTAMPTZ NOT NULL DEFAULT NOW()
}

// --- tickets (Section 4, line 149–169) ---
export interface Ticket {
  id: string;                          // UUID PK, gen_random_uuid()
  ticket_number: number;               // SERIAL UNIQUE
  building_id: string;                 // UUID NOT NULL → buildings(id) ON DELETE RESTRICT
  space_id: string;                    // UUID NOT NULL → spaces(id) ON DELETE RESTRICT
  created_by_user_id: string;          // UUID NOT NULL → users(id) ON DELETE RESTRICT
  issue_type: IssueType;               // issue_type NOT NULL
  severity: TicketSeverity;            // ticket_severity NOT NULL DEFAULT 'standard'
  status: TicketStatus;                // ticket_status NOT NULL DEFAULT 'new'
  description: string | null;          // TEXT
  access_instructions: string | null;  // TEXT
  scheduling_preference: SchedulingPreference | null; // JSONB
  assigned_technician: string | null;  // VARCHAR(255)
  scheduled_date: string | null;       // DATE
  scheduled_time_window: string | null; // VARCHAR(100)
  quote_amount: number | null;         // NUMERIC(10,2)
  invoice_number: string | null;       // VARCHAR(100)
  completed_at: string | null;         // TIMESTAMPTZ
  created_at: string;                  // TIMESTAMPTZ NOT NULL DEFAULT NOW()
  updated_at: string;                  // TIMESTAMPTZ NOT NULL DEFAULT NOW()
}

/** Shape for tickets.scheduling_preference JSONB */
export interface SchedulingPreference {
  type: 'asap' | 'preferred_window';
  preferred_date?: string;             // ISO date
  preferred_time?: string;             // e.g. "morning", "9am-12pm"
}

// --- ticket_attachments (Section 4, line 174–183) ---
export interface TicketAttachment {
  id: string;                          // UUID PK, gen_random_uuid()
  ticket_id: string;                   // UUID NOT NULL → tickets(id) ON DELETE CASCADE
  uploaded_by_user_id: string;         // UUID NOT NULL → users(id) ON DELETE RESTRICT
  file_path: string;                   // TEXT NOT NULL
  file_name: string;                   // VARCHAR(255) NOT NULL
  file_type: string | null;            // VARCHAR(100)
  file_size: number | null;            // INTEGER
  created_at: string;                  // TIMESTAMPTZ NOT NULL DEFAULT NOW()
}

// --- ticket_comments (Section 4, line 185–193) ---
export interface TicketComment {
  id: string;                          // UUID PK, gen_random_uuid()
  ticket_id: string;                   // UUID NOT NULL → tickets(id) ON DELETE CASCADE
  user_id: string;                     // UUID NOT NULL → users(id) ON DELETE RESTRICT
  comment_text: string;                // TEXT NOT NULL
  is_internal: boolean;                // BOOLEAN NOT NULL DEFAULT FALSE
  created_at: string;                  // TIMESTAMPTZ NOT NULL DEFAULT NOW()
  updated_at: string;                  // TIMESTAMPTZ NOT NULL DEFAULT NOW()
}

// --- ticket_status_log (Section 4, line 195–203) ---
export interface TicketStatusLog {
  id: string;                          // UUID PK, gen_random_uuid()
  ticket_id: string;                   // UUID NOT NULL → tickets(id) ON DELETE CASCADE
  old_status: TicketStatus | null;     // ticket_status (null on initial creation)
  new_status: TicketStatus;            // ticket_status NOT NULL
  changed_by_user_id: string | null;   // UUID → users(id) ON DELETE SET NULL
  notes: string | null;                // TEXT
  created_at: string;                  // TIMESTAMPTZ NOT NULL DEFAULT NOW()
}

// =============================================================================
// Enriched types (for API responses with joins)
// =============================================================================

/** Ticket with building + space + creator context */
export interface TicketWithContext extends Ticket {
  building: Pick<Building, 'id' | 'name' | 'address_line1' | 'city' | 'state' | 'zip'>;
  space: Pick<Space, 'id' | 'space_type' | 'unit_number' | 'common_area_type'>;
  created_by: Pick<User, 'id' | 'full_name' | 'email'>;
}

/** Comment with author info */
export interface TicketCommentWithAuthor extends TicketComment {
  author: Pick<User, 'id' | 'full_name' | 'role'>;
}
