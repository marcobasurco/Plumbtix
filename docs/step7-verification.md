# PlumbTix — Step 7 Final Verification (Section 7)

**Version:** Step 7 Final (UI Parity Pass)
**Date:** 2026-02-08

---

## 1. Complete Feature Inventory

### 1.1 Database Tables (11)
| Table | Purpose | CRUD via UI |
|-------|---------|-------------|
| companies | Tenant companies | ✅ List, Create, Edit, Detail |
| users | User accounts (all roles) | ✅ List, Invite flow |
| buildings | Property buildings | ✅ Full CRUD |
| spaces | Units & common areas | ✅ Full CRUD |
| occupants | Residents linked to spaces | ✅ List, Create, Delete per space |
| building_entitlements | PM User → Building access | ✅ Assign, Remove per building |
| invitations | PM invitation tokens | ✅ Send, List pending/accepted |
| tickets | Work order tickets | ✅ Create, Update, List, Detail |
| ticket_attachments | File attachments on tickets | ✅ Upload, List, Download |
| ticket_comments | Threaded comments | ✅ Create, List (via Edge Functions) |
| ticket_status_log | Status transition audit trail | ✅ Read-only timeline display |

### 1.2 Edge Functions (8)
| Function | Auth | UI Support |
|----------|------|------------|
| accept-invitation | Public (token) | ✅ /accept-invite page |
| claim-resident | Public (token) | ✅ /claim-account page |
| create-ticket | JWT | ✅ CreateTicketWizard |
| update-ticket | JWT | ✅ ActionPanel + DispatchBoard |
| get-ticket-comments | JWT | ✅ CommentsThread |
| create-comment | JWT | ✅ CommentsThread |
| register-attachment | JWT | ✅ AttachmentsList |
| send-invitation | JWT (admin) | ✅ UsersPage invite form |

### 1.3 User Roles (4)
| Role | Route | Capabilities |
|------|-------|-------------|
| proroto_admin | /admin | Full system access. All CRUD on all tables. Dispatch. |
| pm_admin | /dashboard | CRUD on own-company buildings/spaces/occupants. Create tickets. Invite users. |
| pm_user | /dashboard | Read entitled buildings. Create/manage entitled tickets. |
| resident | /my | Read own space/building. Create tickets for own space. Public comments. |

---

## 2. Role-Based Capabilities Matrix

| Capability | proroto_admin | pm_admin | pm_user | resident |
|-----------|:---:|:---:|:---:|:---:|
| **Companies** |
| List companies | ✅ | own | own | — |
| Create company | ✅ | — | — | — |
| Edit company | ✅ | — | — | — |
| **Buildings** |
| List buildings | ✅ all | ✅ company | ✅ entitled | ✅ own |
| Create building | ✅ | ✅ | — | — |
| Edit building | ✅ | ✅ | — | — |
| Delete building | ✅ | ✅ | — | — |
| **Spaces** |
| List spaces | ✅ | ✅ company | ✅ entitled | ✅ own |
| Create/Edit/Delete | ✅ | ✅ | — | — |
| **Occupants** |
| List occupants | ✅ | ✅ company | ✅ entitled | own record |
| Create occupant | ✅ | ✅ | — | — |
| Delete occupant | ✅ | ✅ | — | — |
| **Building Entitlements** |
| Assign PM User | ✅ | ✅ | — | — |
| Remove PM User | ✅ | ✅ | — | — |
| **Users & Invitations** |
| List users | ✅ all | — | — | — |
| Send invitation | ✅ any co. | ✅ own co. | — | — |
| **Tickets** |
| Create ticket | ✅ any | ✅ company | ✅ entitled | ✅ own space |
| View tickets | ✅ all | ✅ company | ✅ entitled | ✅ own |
| Update status | ✅ full matrix | partial | partial | — |
| Assign technician | ✅ | — | — | — |
| Set schedule/quote | ✅ | — | — | — |
| **Comments** |
| Read comments | ✅ all | ✅ entitled | ✅ entitled | ✅ public only |
| Create comment | ✅ + internal | ✅ public | ✅ public | ✅ public |
| **Attachments** |
| Upload/View | ✅ | ✅ entitled | ✅ entitled | ✅ own ticket |
| **Dispatch Board** |
| View/Transition | ✅ | — | — | — |

---

## 3. End-to-End Verification Steps

### Pre-requisites
- Supabase project with all migrations (00001–00007) applied
- Edge Functions deployed
- Netlify build passing with correct env vars
- At least one proroto_admin user created

### Step 1: Login as Pro Roto Admin
- [ ] Navigate to /login
- [ ] Enter admin credentials
- [ ] Verify redirect to /admin
- [ ] Verify "PRO ROTO ADMIN" badge in header
- [ ] Verify 5 tabs: Tickets, Buildings, Companies, Users, Dispatch

### Step 2: Create a Company
- [ ] Click Companies tab
- [ ] Click "+ Add Company"
- [ ] Enter: Name = "Bay Area Properties", Slug auto-generates to "bay-area-properties"
- [ ] Click "Create Company"
- [ ] Verify company appears in grid
- [ ] Click into company detail
- [ ] Verify "Edit" button visible

### Step 3: Edit a Company
- [ ] On company detail, click "Edit"
- [ ] Change name to "Bay Area Property Management"
- [ ] Click "Save"
- [ ] Verify name updates immediately

### Step 4: Add a Building
- [ ] Click Buildings tab
- [ ] Click "+ Add Building"
- [ ] Fill in address: 123 Main St, San Mateo, CA 94401
- [ ] Submit form
- [ ] Verify building appears in list
- [ ] Click into building detail

### Step 5: Add Spaces
- [ ] Click "+ Add Space"
- [ ] Create Unit: Unit 101, Floor 1, 2 bed, 1 bath
- [ ] Click "Save Space"
- [ ] Create Common Area: Pool, Floor 0
- [ ] Click "Save Space"
- [ ] Verify both appear in building detail

### Step 6: Add Occupants
- [ ] Click the ▸ arrow next to Unit 101 to expand
- [ ] Click "+ Add Occupant"
- [ ] Enter: Name = "Jane Tenant", Email = "jane@test.com", Type = Tenant
- [ ] Click "Add"
- [ ] Verify occupant appears with invite token/claim URL
- [ ] Verify claim URL format: /claim-account?token=UUID

### Step 7: Manage Building Entitlements
- [ ] Scroll to "PM User Access" section on building detail
- [ ] If PM Users exist: Click "+ Assign PM User", select user, click "Assign"
- [ ] Verify user appears in entitlement list
- [ ] Click "Remove" to revoke access
- [ ] If no PM Users exist: verify "No PM Users" message

### Step 8: Invite a PM User
- [ ] Click Users tab
- [ ] Click "+ Invite User"
- [ ] Select company, enter name/email, role = PM Admin
- [ ] Click "Send Invitation"
- [ ] Verify success message with token and accept URL
- [ ] Verify invitation appears in Pending Invitations

### Step 9: Create a Ticket
- [ ] Click Tickets tab (or navigate to /admin)
- [ ] Click "+ New Ticket" (if button exists in TicketList)
- [ ] OR navigate to /admin/tickets/new
- [ ] Select building, space, issue type, severity
- [ ] Enter description
- [ ] Submit
- [ ] Verify ticket appears in list

### Step 10: Ticket Lifecycle
- [ ] Click into ticket detail
- [ ] Verify ActionPanel shows available transitions
- [ ] Change status: new → scheduled (set technician name, date)
- [ ] Verify StatusTimeline updates
- [ ] Add a comment
- [ ] Verify comment appears in thread
- [ ] Upload an attachment (if storage configured)

### Step 11: Dispatch Board
- [ ] Click Dispatch tab
- [ ] Verify Kanban columns show tickets by status
- [ ] Use "→ Status" buttons to move tickets between columns
- [ ] Filter by company and building
- [ ] Search by ticket number or address

### Step 12: Accept Invitation (separate browser/incognito)
- [ ] Open accept-invite URL from Step 8
- [ ] Fill in name, email (must match), password
- [ ] Submit
- [ ] Verify redirect to /dashboard (PM role)
- [ ] Verify can see company buildings

### Step 13: Claim Resident Account (separate browser/incognito)
- [ ] Open claim-account URL from Step 6
- [ ] Enter email (jane@test.com) and password
- [ ] Submit
- [ ] Verify redirect to /my (resident role)
- [ ] Verify can see own building and space

---

## 4. Pass/Fail Acceptance Criteria

| # | Criteria | Expected |
|---|---------|----------|
| 1 | `npm run build` passes with zero errors | ✅ |
| 2 | /admin loads without console errors | No RLS recursion errors |
| 3 | All 5 admin tabs render content | Tickets, Buildings, Companies, Users, Dispatch |
| 4 | Company CRUD: create, edit, list, detail | All work |
| 5 | Building CRUD: create, edit, delete, detail | All work |
| 6 | Space CRUD: create unit, create common area, edit, delete | All work |
| 7 | Occupant management: add/remove per space | Works with claim token |
| 8 | Building entitlements: assign/remove PM Users | Works |
| 9 | Invitation flow: send → accept → login | Complete |
| 10 | Resident claim flow: occupant → claim → login | Complete |
| 11 | Ticket lifecycle: create → transition → complete | All statuses reachable |
| 12 | Comments: create, read (internal for admin) | Via Edge Functions |
| 13 | Attachments: upload, list, download | Via Storage + Edge Function |
| 14 | Dispatch board: Kanban, transitions, filters | Works |
| 15 | RLS: no infinite recursion errors | Fixed by migration 00007 |
| 16 | Role isolation: PM can't see other companies | RLS enforced |
| 17 | Resident isolation: can only see own space/tickets | RLS enforced |

---

## 5. Backend-Only by Design (Disabled)

| Capability | Reason | Status |
|-----------|--------|--------|
| Company DELETE | Destructive cascade (buildings→spaces→tickets). No UI delete button. Backend RLS allows it for proroto_admin but UI intentionally omits it. | **By design** — use SQL Editor for exceptional cases |
| User profile editing | No UI to edit existing user name/phone/role. Backend UPDATE is allowed by RLS for proroto_admin. | **Deferred** — use Supabase Dashboard for now |
| Occupant UPDATE | Backend allows update (e.g., change name/email). UI only supports add/delete. | **Minimal risk** — delete and re-add if needed |
| Ticket DELETE | No delete policy or UI. Tickets are permanent records. | **By design** — use cancel status instead |

---

## 6. Migration Summary

| Migration | Purpose |
|-----------|---------|
| 00001_section4_schema.sql | Core schema (11 tables, 8 enums) |
| 00002_section5_security.sql | RLS policies (41), helper functions, triggers |
| 00003_section6_storage.sql | Storage bucket + policies for attachments |
| 00004_section7_seed.sql | Seed data (Pro Roto company) |
| 00005_additive_transition_trigger.sql | Ticket status transition enforcement trigger |
| 00006_revoke_ticket_comments_postgrest.sql | Revoke PostgREST access to ticket_comments |
| 00007_fix_buildings_rls_recursion.sql | Fix infinite recursion in RLS policies |

---

## 7. File Structure (Key Files)

```
src/
├── App.tsx                              # Router
├── routes/
│   ├── login.tsx                        # Login page
│   ├── accept-invite.tsx               # PM invitation acceptance
│   ├── claim-account.tsx               # Resident claim flow
│   ├── dashboard-admin.tsx             # Admin routes
│   ├── dashboard-pm.tsx                # PM routes
│   └── dashboard-resident.tsx          # Resident routes
├── components/
│   ├── DashboardLayout.tsx             # Nav tabs + header
│   ├── RoleGate.tsx                    # Role-based access control
│   ├── admin/
│   │   ├── CompanyList.tsx             # Companies grid + create form
│   │   ├── CompanyDetail.tsx           # Company detail + edit + users/buildings
│   │   ├── UsersPage.tsx               # Users list + invitation management
│   │   └── DispatchBoard.tsx           # Kanban dispatch board
│   ├── buildings/
│   │   ├── BuildingList.tsx            # Buildings grid
│   │   ├── BuildingDetail.tsx          # Building detail + spaces + occupants + entitlements
│   │   ├── BuildingForm.tsx            # Create/edit building
│   │   ├── SpaceForm.tsx               # Create/edit space
│   │   ├── OccupantList.tsx            # Occupants per space (add/delete + claim URL)
│   │   └── EntitlementManager.tsx      # PM User access management per building
│   └── tickets/
│       ├── TicketList.tsx              # Ticket grid + filters
│       ├── TicketDetail.tsx            # Full ticket view
│       ├── CreateTicketWizard.tsx       # Multi-step ticket creation
│       ├── ActionPanel.tsx             # Status transitions + field updates
│       ├── CommentsThread.tsx          # Comment read/write
│       ├── AttachmentsList.tsx         # File upload/download
│       ├── StatusTimeline.tsx          # Audit trail
│       └── [badges/filters]
├── lib/
│   ├── admin.ts                        # Companies, users, invitations data
│   ├── buildings.ts                    # Buildings, spaces, occupants, entitlements data
│   ├── tickets.ts                      # Tickets, status log, attachments data
│   ├── api.ts                          # Edge Function client
│   ├── auth.tsx                        # Auth context + session management
│   └── supabaseClient.ts              # Supabase client singleton
shared/types/
├── api.ts                              # Edge Function request/response types
├── database.ts                         # Table row types
├── enums.ts                            # Enum types + labels
├── transitions.ts                      # Status transition matrix
└── index.ts                            # Re-exports
```
