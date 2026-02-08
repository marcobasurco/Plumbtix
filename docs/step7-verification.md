# PlumbTix — Step 7 Verification: Admin Screens

## Files Added/Changed

| File | Lines | Status |
|------|-------|--------|
| **New: Data layer** | | |
| `src/lib/admin.ts` | 187 | NEW — PostgREST queries for companies, users, invitations |
| **New: Admin components** | | |
| `src/components/admin/CompanyList.tsx` | 60 | NEW — card grid with building/user counts |
| `src/components/admin/CompanyDetail.tsx` | 129 | NEW — info + buildings + users tables |
| `src/components/admin/UsersPage.tsx` | 294 | NEW — user list, invitations, send-invitation form |
| `src/components/admin/DispatchBoard.tsx` | 398 | NEW — Kanban board with status columns |
| **Changed** | | |
| `src/components/DashboardLayout.tsx` | 130 | UPDATED — admin-only tabs (Companies, Users, Dispatch) |
| `src/routes/dashboard-admin.tsx` | 32 | UPDATED — 4 new routes |
| **Step 7 total new code** | **~1,230** | |

---

## Route Map

| URL | Component | Purpose |
|-----|-----------|---------|
| `/admin` | TicketList | Default (existing) |
| `/admin/companies` | CompanyList | All companies |
| `/admin/companies/:id` | CompanyDetail | Company buildings + users |
| `/admin/users` | UsersPage | All users + invitations + send invite |
| `/admin/dispatch` | DispatchBoard | Kanban ticket board |

All `/admin/*` routes are protected by `RoleGate allowed={['proroto_admin']}` in App.tsx. Non-admin roles are redirected to their role home.

---

## Checkpoint 7.1 — Routing + RoleGate Enforcement

### Test Steps
1. Log in as **proroto_admin** → navigate to `/admin`
2. Nav tabs show: Tickets, Buildings, **Companies**, **Users**, **Dispatch**
3. All five tabs navigate to correct pages
4. Log in as **pm_admin** → navigate to `/admin/companies` → redirected to `/dashboard`
5. Log in as **resident** → navigate to `/admin/dispatch` → redirected to `/my`
6. PM/resident dashboards show only 2 tabs: Tickets, Buildings (no admin tabs)

---

## Checkpoint 7.2 — Companies List + Company Detail

### Companies List
1. Admin → "Companies" tab
2. Card grid shows each company: name, slug, building count, user count, created date
3. Click card → navigates to `/admin/companies/<uuid>`

### Company Detail
1. Shows company name, slug, created date
2. **Buildings** section lists all buildings for this company (linked to `/admin/buildings/:id`)
3. **Users** section shows table: Name, Email, Role (badge), Joined date
4. "← Back to companies" returns to list

### Data Source
All queries via PostgREST with user JWT. RLS `proroto_admin_all_companies` / `proroto_admin_all_users` grants full access.

---

## Checkpoint 7.3 — Users List + Invitations + Send Invitation

### Users Tab
1. Admin → "Users" tab
2. Company dropdown filter (all companies loaded via PostgREST)
3. **Registered Users** table: Name, Email, Role, Company, Joined
4. Select a company filter → table shows only that company's users

### Pending Invitations
1. Below users table, **Pending Invitations** section
2. Shows: Name, Email, Role, Company, Status (Active/Expired), Sent date
3. Expired detection: `expires_at < now()` → shows "Expired" in red

### Accepted Invitations
1. Collapsed `<details>` section at bottom
2. Shows Name, Email, Company, Accepted date

### Send Invitation
1. Click "+ Invite User" → form appears
2. Fields: Company (dropdown), Full Name, Email, Role (pm_admin/pm_user)
3. Submit → calls `POST /functions/v1/send-invitation` Edge Function
4. On success: green box shows email, token, and accept URL
5. On failure: red error banner with message
6. Invitations list refreshes after send

### Security
- `sendInvitation` uses existing Edge Function (no new Edge Functions)
- Token is displayed only because `SendInvitationResponse` includes the full `Invitation` object
- Invitation read via PostgREST with `proroto_admin_all_invitations` RLS policy

---

## Checkpoint 7.4 — Dispatch Board

### Board Layout
1. Admin → "Dispatch" tab
2. Horizontal scrollable Kanban with columns: New, Needs Info, Scheduled, Dispatched, On Site, In Progress, Waiting Approval
3. Each column shows count and colored header
4. Terminal statuses (Completed, Invoiced, Cancelled) hidden by default
5. "Show closed (N)" checkbox toggles terminal columns

### Ticket Cards
1. Each card shows: ticket #, severity (color-coded), issue type, building/unit, technician, scheduled date
2. Click card body → navigates to `/admin/tickets/<uuid>` (ticket detail)
3. Transition buttons below card: "→ Scheduled", "→ Needs Info", etc.
4. Only allowed transitions for proroto_admin at current status are shown
5. Transitions use shared `getAllowedTransitions()` from `@shared/types/transitions`

### Status Transitions
1. Click a transition button → calls `PATCH /functions/v1/update-ticket` Edge Function
2. Optimistic update moves card to new column immediately
3. Error rolls back and shows error banner
4. "↻ Refresh" button reloads all tickets from server

### Filters
1. **Company** dropdown: filters tickets by building.company_id
2. **Building** dropdown: derived from visible tickets, filters by building_id
3. **Search** text: matches ticket #, description, technician, building name/address, unit #, creator name
4. Ticket count header updates with filter results

### Data Source
- Ticket list via PostgREST: `SELECT * FROM tickets` with joins to buildings, spaces, users
- RLS: `proroto_admin` has ALL on tickets → sees all companies' tickets
- Status updates via `update-ticket` Edge Function (existing, validates transition matrix + DB trigger)

---

## Security Checklist

| # | Check | Status |
|---|-------|--------|
| 1 | All `/admin/*` routes wrapped in `RoleGate allowed={['proroto_admin']}` | ✅ |
| 2 | Admin-only tabs (Companies, Users, Dispatch) visible only to proroto_admin | ✅ |
| 3 | All data reads use PostgREST with user JWT + RLS | ✅ |
| 4 | No service role key in frontend | ✅ |
| 5 | No locked migrations modified (00001–00004) | ✅ |
| 6 | No migration 00005/00006 modified | ✅ |
| 7 | ticket_comments never accessed (00006 REVOKE ALL respected) | ✅ |
| 8 | Ticket status updates use update-ticket Edge Function only | ✅ |
| 9 | Invitation sends use send-invitation Edge Function only | ✅ |
| 10 | No new Edge Functions introduced | ✅ |
| 11 | Invitation token displayed only from API response (not fabricated) | ✅ |
| 12 | Transition buttons use shared getAllowedTransitions() (single source of truth) | ✅ |
| 13 | PM/resident roles cannot reach admin pages (RoleGate redirect verified) | ✅ |

---

## Architecture Notes

### Data Access Pattern
```
CompanyList     → PostgREST: companies + buildings(count) + users(count)
CompanyDetail   → PostgREST: company + buildings(filtered) + users(filtered)
UsersPage       → PostgREST: users + invitations + companies
                → Edge Function: send-invitation (POST)
DispatchBoard   → PostgREST: tickets with joins
                → Edge Function: update-ticket (PATCH)
```

### Navigation Model
```
DashboardLayout detects role:
  proroto_admin → 5 tabs: Tickets, Buildings, Companies, Users, Dispatch
  all others    → 2 tabs: Tickets, Buildings

Active tab detected by matching first path segment after role root.
```
