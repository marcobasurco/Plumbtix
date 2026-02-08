# PlumbTix — Step 7 Verification: Admin Screens (proroto_admin)

## Table of Contents

1. [Preconditions](#1-preconditions)
2. [Positive Tests — /admin/companies](#2-positive-tests--admincompanies)
3. [Positive Tests — /admin/users](#3-positive-tests--adminusers)
4. [Positive Tests — /admin/dispatch](#4-positive-tests--admindispatch)
5. [Negative Tests — Access Control](#5-negative-tests--access-control)
6. [Security Confirmations](#6-security-confirmations)

---

## 1. Preconditions

### Environment Variables

| Variable | Example Value | Where Set |
|----------|---------------|-----------|
| `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` | `.env.local` or Netlify env |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbGciOiJI…` | `.env.local` or Netlify env |
| `VITE_EDGE_BASE_URL` | `https://<ref>.supabase.co` | `.env.local` or Netlify env |

### Migrations Applied (in order)

| Migration | Purpose | Locked? |
|-----------|---------|---------|
| `00001_section4_schema.sql` | Tables, types, indexes, constraints | ✅ Locked |
| `00002_section5_security.sql` | RLS, triggers, helper functions | ✅ Locked |
| `00003_section6_storage.sql` | Storage bucket + policies | ✅ Locked |
| `00004_section7_seed.sql` | Seed data | ✅ Locked |
| `00005_additive_transition_trigger.sql` | Status transition enforcement trigger | Do not modify |
| `00006_revoke_ticket_comments_postgrest.sql` | REVOKE PostgREST access on ticket_comments | Do not modify |

### Verification Query — All Migrations Applied

```sql
-- Trigger count = 9 (Section 5's 8 + migration 00005's 1)
SELECT COUNT(*) FROM pg_trigger
  WHERE tgrelid IN (
    SELECT oid FROM pg_class WHERE relnamespace = 'public'::regnamespace
  ) AND NOT tgisinternal;
-- Expected: 9

-- RLS policy count = 41 (Section 5 unchanged)
SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public';
-- Expected: 41

-- ticket_comments revoked from authenticated
SELECT has_table_privilege('authenticated', 'public.ticket_comments', 'SELECT');
-- Expected: false
```

### Required Roles (from seed or manual setup)

| Role | Purpose | Test Account |
|------|---------|--------------|
| `proroto_admin` | Full platform admin | `admin@proroto.com` |
| `pm_admin` | Property management admin | Any PM admin in seed data |
| `pm_user` | Property manager (read-only buildings) | Any PM user in seed data |
| `resident` | Tenant/homeowner | Any resident in seed data |

### Required Edge Functions Deployed

| Edge Function | Used By |
|---------------|---------|
| `send-invitation` | UsersPage → Send Invitation form |
| `update-ticket` | DispatchBoard → Transition buttons |
| `create-ticket` | (existing, not new in Step 7) |
| `get-ticket-comments` | (existing, not new in Step 7) |
| `create-comment` | (existing, not new in Step 7) |

---

## 2. Positive Tests — /admin/companies

### T-7.2.1 — Company List Loads

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Log in as `admin@proroto.com` | Redirected to `/admin` |
| 2 | Click "Companies" tab in nav | Navigated to `/admin/companies` |
| 3 | Observe company cards | Each card shows: company name, slug, building count, user count, created date |
| 4 | Confirm all seeded companies appear | Count matches `SELECT COUNT(*) FROM companies` |

### T-7.2.2 — Company Detail Page

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | On company list, click any company card | Navigated to `/admin/companies/<uuid>` |
| 2 | Observe header | Company name, slug, created date displayed |
| 3 | Observe "Buildings" section | Lists all buildings for this company with address and city/state |
| 4 | Click a building row | Navigated to `/admin/buildings/<building_uuid>` |
| 5 | Navigate back → observe "Users" section | Table shows: Name, Email, Role (badge), Joined date |
| 6 | Click "← Back to companies" | Returns to `/admin/companies` |

### T-7.2.3 — Company Detail Data Accuracy

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | On company detail for company X | Note building count |
| 2 | Run: `SELECT COUNT(*) FROM buildings WHERE company_id = '<X>'` | Matches UI count |
| 3 | Note user count | |
| 4 | Run: `SELECT COUNT(*) FROM users WHERE company_id = '<X>'` | Matches UI count |

---

## 3. Positive Tests — /admin/users

### T-7.3.1 — Users List Loads

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click "Users" tab in nav | Navigated to `/admin/users` |
| 2 | Observe "Registered Users" table | Columns: Name, Email, Role, Company, Joined |
| 3 | Confirm all users visible | Count matches `SELECT COUNT(*) FROM users` |
| 4 | proroto_admin users show blue badge | Role badge has `#dbeafe` background |

### T-7.3.2 — Company Filter

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Select a company from the dropdown | Users table filters to show only that company's users |
| 2 | Pending invitations also filter to that company | Invitation list updates |
| 3 | Select "All Companies" | Full list restored |

### T-7.3.3 — Pending Invitations Display

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Below users table, find "Pending Invitations" section | Lists invitations where `accepted_at IS NULL` |
| 2 | Each row shows: Name, Email, Role, Company, Status, Sent date | All columns populated |
| 3 | Invitations past `expires_at` show "Expired" in red | Status column correctly differentiates |
| 4 | Non-expired invitations show "Active" in green | |

### T-7.3.4 — Send Invitation (Success)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click "+ Invite User" | Inline form appears |
| 2 | Select a Company from dropdown | Required field |
| 3 | Enter Full Name: "Test User" | Required field |
| 4 | Enter Email: `testuser@example.com` | Required field |
| 5 | Select Role: "Property Manager Admin" | Dropdown shows pm_admin, pm_user |
| 6 | Click "Send Invitation" | Button shows "Sending…" |
| 7 | On success | Green box appears with: email, token UUID, full accept URL |
| 8 | Accept URL format | `{origin}/accept-invite?token=<uuid>` |
| 9 | Invitations list refreshes | New invitation appears at top with status "Active" |
| 10 | Verify in DB | `SELECT token, email FROM invitations WHERE email = 'testuser@example.com'` — token matches displayed |

### T-7.3.5 — Send Invitation (Failure — Duplicate Email)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Attempt to invite same email again | |
| 2 | Click "Send Invitation" | Red error banner appears with Edge Function error message |
| 3 | No duplicate invitation created | `SELECT COUNT(*) FROM invitations WHERE email = '...'` unchanged |

### T-7.3.6 — Token Validity Check

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Copy the accept URL from T-7.3.4 success box | |
| 2 | Open in incognito/new browser | Accept Invite page loads |
| 3 | Token resolves to correct invitation | Name and company pre-displayed |
| 4 | Verify `expires_at` is in the future | `SELECT expires_at FROM invitations WHERE token = '<token>'` > NOW() |

### T-7.3.7 — Accepted Invitations Section

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | If any invitations have been accepted | Collapsed `<details>` at bottom: "Accepted invitations (N)" |
| 2 | Expand it | Table shows: Name, Email, Company, Accepted date |

---

## 4. Positive Tests — /admin/dispatch

### T-7.4.1 — Board Layout

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click "Dispatch" tab in nav | Navigated to `/admin/dispatch` |
| 2 | Observe board columns | 7 columns: New, Needs Info, Scheduled, Dispatched, On Site, In Progress, Waiting Approval |
| 3 | Each column header shows count | Count matches tickets in that status |
| 4 | Total ticket count in header | Matches sum of all visible column counts |
| 5 | Board scrolls horizontally if needed | Overflow-x works |

### T-7.4.2 — Terminal Status Toggle

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Observe "Show closed (N)" checkbox | N = count of Completed + Invoiced + Cancelled tickets |
| 2 | Check the checkbox | 3 additional columns appear: Completed, Invoiced, Cancelled |
| 3 | Uncheck | Terminal columns hidden again |

### T-7.4.3 — Ticket Card Content

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Observe any ticket card | Shows: `#<number>`, severity (colored), issue type label |
| 2 | Below issue type | Building name/address, space (unit # or common area type) |
| 3 | If technician assigned | Shows `🔧 <technician name>` |
| 4 | If scheduled_date set | Shows `📅 <formatted date>` |

### T-7.4.4 — Navigate to Ticket Detail

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click the body of any ticket card (not a transition button) | Navigated to `/admin/tickets/<uuid>` |
| 2 | Ticket detail page loads | Full ticket info, comments, attachments, status timeline |
| 3 | Browser back button | Returns to dispatch board |

### T-7.4.5 — Status Transition via Dispatch Board

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Find a ticket in "New" column | Card shows transition buttons: `→ Needs Info`, `→ Scheduled`, `→ Cancelled` |
| 2 | Click `→ Scheduled` | Card moves to "Scheduled" column (optimistic update) |
| 3 | Count in "New" column decrements | Count in "Scheduled" column increments |
| 4 | Verify in DB | `SELECT status FROM tickets WHERE id = '<id>'` → `'scheduled'` |
| 5 | Verify status log | `SELECT * FROM ticket_status_log WHERE ticket_id = '<id>' ORDER BY created_at DESC LIMIT 1` → `old_status='new', new_status='scheduled'` |

### T-7.4.6 — Transition Matrix Enforcement on Board

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Find a ticket in "Scheduled" column | Buttons: `→ Dispatched`, `→ Needs Info`, `→ Cancelled` |
| 2 | No `→ Completed` or `→ Invoiced` button visible | Transition matrix restricts options |
| 3 | Find a "Completed" ticket (show closed) | Only button: `→ Invoiced` |
| 4 | Find an "Invoiced" ticket | No transition buttons (terminal) |
| 5 | Find a "Cancelled" ticket | No transition buttons (terminal) |

### T-7.4.7 — Cross-Company Visibility

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | With no company filter, observe board | Tickets from ALL companies visible |
| 2 | Verify with DB | `SELECT COUNT(*) FROM tickets` matches total on board |

### T-7.4.8 — Filter by Company

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Select a company from the "All Companies" dropdown | Board shows only tickets for buildings owned by that company |
| 2 | Ticket count in header updates | Reduced count |
| 3 | Select "All Companies" | Full board restored |

### T-7.4.9 — Filter by Building

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Select a building from the "All Buildings" dropdown | Only tickets for that building shown |
| 2 | Other columns may be empty | |
| 3 | Select "All Buildings" | Full board restored |

### T-7.4.10 — Search Filter

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Type a ticket number (e.g., `#1`) in search box | Only matching tickets visible |
| 2 | Type a technician name | Filters to tickets assigned to that technician |
| 3 | Type a building address fragment | Filters to tickets at matching buildings |
| 4 | Clear search | Full board restored |

### T-7.4.11 — Refresh Button

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click `↻ Refresh` | Board reloads from server |
| 2 | If another admin changed a status in DB | Board reflects the new state |

---

## 5. Negative Tests — Access Control

### T-7.5.1 — pm_admin Cannot Access Admin Routes

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Log in as `pm_admin` | Redirected to `/dashboard` |
| 2 | Manually navigate to `/admin/companies` | Redirected to `/dashboard` by RoleGate |
| 3 | Manually navigate to `/admin/users` | Redirected to `/dashboard` |
| 4 | Manually navigate to `/admin/dispatch` | Redirected to `/dashboard` |
| 5 | Nav tabs show only: Tickets, Buildings | No Companies/Users/Dispatch tabs |

### T-7.5.2 — pm_user Cannot Access Admin Routes

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Log in as `pm_user` | Redirected to `/dashboard` |
| 2 | Manually navigate to `/admin/dispatch` | Redirected to `/dashboard` |
| 3 | Manually navigate to `/admin/companies` | Redirected to `/dashboard` |

### T-7.5.3 — Resident Cannot Access Admin Routes

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Log in as `resident` | Redirected to `/my` |
| 2 | Manually navigate to `/admin/users` | Redirected to `/my` |
| 3 | Manually navigate to `/admin/dispatch` | Redirected to `/my` |

### T-7.5.4 — Unauthenticated Cannot Access Admin Routes

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Without logging in, navigate to `/admin/companies` | Redirected to `/login` |
| 2 | Navigate to `/admin/dispatch` | Redirected to `/login` |

### T-7.5.5 — PM Cannot See Dispatch Tab

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Log in as `pm_admin` | At `/dashboard` |
| 2 | Inspect nav tabs | Only "Tickets" and "Buildings" present |
| 3 | No "Dispatch", "Companies", or "Users" tab rendered | DOM inspection confirms absence |

### T-7.5.6 — PostgREST Direct Access Blocked for ticket_comments

```bash
# As authenticated user (any role), attempt direct PostgREST read
curl -s "$SUPABASE_URL/rest/v1/ticket_comments" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $USER_JWT"
# Expected: 403 or permission denied (REVOKE ALL in migration 00006)
```

### T-7.5.7 — Resident Cannot Transition Ticket Status

```bash
# Attempt direct PATCH on tickets table as resident (bypasses UI)
curl -s -X PATCH "$SUPABASE_URL/rest/v1/tickets?id=eq.<ticket_id>" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $RESIDENT_JWT" \
  -H "Content-Type: application/json" \
  -d '{"status": "cancelled"}'
# Expected: DB trigger trg_tickets_enforce_transition raises:
#   P0001 "Status transition from \"new\" to \"cancelled\" is not permitted for role \"resident\""
```

---

## 6. Security Confirmations

### S-7.1 — ticket_comments Never Accessed via PostgREST

| Check | Evidence | Result |
|-------|----------|--------|
| Frontend code audit | `grep -rn 'ticket_comments' src/lib/admin.ts src/components/admin/` → no results | ✅ |
| Migration 00006 in effect | `REVOKE ALL ON public.ticket_comments FROM anon; REVOKE ALL … FROM authenticated;` | ✅ |
| DB verification | `SELECT has_table_privilege('authenticated', 'public.ticket_comments', 'SELECT')` → `false` | ✅ |
| Step 7 files | No file in Step 7 reads, writes, or references ticket_comments | ✅ |

### S-7.2 — Status Changes Only via update-ticket Edge Function

| Check | Evidence | Result |
|-------|----------|--------|
| DispatchBoard.tsx | `import { updateTicket } from '@/lib/api'` — calls `PATCH /functions/v1/update-ticket` | ✅ |
| No direct PostgREST UPDATE on tickets.status in Step 7 | `grep -rn "\.update.*status" src/components/admin/` → only via `updateTicket()` API wrapper | ✅ |
| Edge Function validates transition | update-ticket checks `isTransitionAllowed()` from shared matrix before DB call | ✅ |
| DB trigger as seatbelt | Migration 00005 `trg_tickets_enforce_transition` rejects invalid status UPDATEs at the database level | ✅ |

### S-7.3 — Transition Matrix Enforced (Three Layers)

| Layer | File | Mechanism |
|-------|------|-----------|
| **Frontend** | `shared/types/transitions.ts` → `getAllowedTransitions()` | DispatchBoard renders only valid transition buttons per role and current status |
| **Edge Function** | `supabase/functions/update-ticket/index.ts` → `isTransitionAllowed()` | Validates request body before touching DB; returns 403 on violation |
| **Database** | `00005_additive_transition_trigger.sql` → `enforce_ticket_status_transition()` | BEFORE UPDATE trigger raises P0001 exception on invalid transitions even if Edge Function is bypassed |

All three layers reference the **same transition rules**:

```
new              → proroto_admin: [needs_info, scheduled, cancelled]
                 → pm_admin/pm_user: [cancelled]
needs_info       → proroto_admin: [new, scheduled, cancelled]
                 → pm_admin/pm_user: [new, cancelled]
scheduled        → proroto_admin: [dispatched, needs_info, cancelled]
dispatched       → proroto_admin: [on_site, scheduled, cancelled]
on_site          → proroto_admin: [in_progress, cancelled]
in_progress      → proroto_admin: [waiting_approval, completed, cancelled]
waiting_approval → proroto_admin: [scheduled, in_progress, cancelled]
                 → pm_admin/pm_user: [scheduled, cancelled]
completed        → proroto_admin: [invoiced]
invoiced         → (terminal — no transitions)
cancelled        → (terminal — no transitions)
resident         → (no transitions at any status)
```

### S-7.4 — No New Edge Functions Introduced

| Check | Evidence | Result |
|-------|----------|--------|
| Edge Functions directory | 8 functions unchanged: `accept-invitation`, `claim-resident`, `create-comment`, `create-ticket`, `get-ticket-comments`, `register-attachment`, `send-invitation`, `update-ticket` | ✅ |
| Step 7 only calls 2 existing Edge Functions | `sendInvitation()` in UsersPage, `updateTicket()` in DispatchBoard | ✅ |

### S-7.5 — No Service Role Key in Frontend

| Check | Evidence | Result |
|-------|----------|--------|
| Code audit | `grep -rn 'service.role\|SERVICE_ROLE' src/` → no results | ✅ |
| supabaseClient.ts | Uses only `VITE_SUPABASE_ANON_KEY` | ✅ |

### S-7.6 — No Locked Migrations Modified

| File | MD5 | Modified? |
|------|-----|-----------|
| `00001_section4_schema.sql` | `3249867a…` | ❌ |
| `00002_section5_security.sql` | `3fd2ac98…` | ❌ |
| `00003_section6_storage.sql` | `c1c9c2fd…` | ❌ |
| `00004_section7_seed.sql` | `f1514eb8…` | ❌ |

### S-7.7 — RoleGate Protection

| Check | Evidence | Result |
|-------|----------|--------|
| App.tsx | `/admin/*` wrapped in `<RoleGate allowed={['proroto_admin']}>` | ✅ |
| RoleGate behavior | Non-matching roles redirected to `roleHome()` | ✅ |
| DashboardLayout | Admin tabs rendered only when `role === 'proroto_admin'` | ✅ |

---

## Summary

| Category | Tests | Count |
|----------|-------|-------|
| Companies (list + detail) | T-7.2.1 — T-7.2.3 | 3 |
| Users & Invitations | T-7.3.1 — T-7.3.7 | 7 |
| Dispatch Board | T-7.4.1 — T-7.4.11 | 11 |
| Negative / Access Control | T-7.5.1 — T-7.5.7 | 7 |
| Security Confirmations | S-7.1 — S-7.7 | 7 |
| **Total** | | **35 verification items** |
