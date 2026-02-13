# Work Orders — Step 4 Verification: Ticket List + Ticket Detail

## Files Added/Changed in Step 4

| File | Lines | Status |
|------|-------|--------|
| **New: Ticket components** | | |
| `src/components/tickets/TicketList.tsx` | 179 | NEW — ticket table with filters |
| `src/components/tickets/TicketFilters.tsx` | 77 | NEW — status/severity/building/search filters |
| `src/components/tickets/TicketDetail.tsx` | 259 | NEW — full ticket detail page |
| `src/components/tickets/StatusBadge.tsx` | 35 | NEW — color-coded status badge |
| `src/components/tickets/SeverityBadge.tsx` | 28 | NEW — color-coded severity badge |
| `src/components/tickets/StatusTimeline.tsx` | 88 | NEW — vertical timeline from ticket_status_log |
| `src/components/tickets/CommentsThread.tsx` | 190 | NEW — Edge Function-only comment read/write |
| `src/components/tickets/AttachmentsList.tsx` | 92 | NEW — attachment list with signed URL download |
| `src/components/tickets/ActionPanel.tsx` | 246 | NEW — role-based transition buttons + admin fields |
| **New: Shared** | | |
| `src/components/DashboardLayout.tsx` | 49 | NEW — shared dashboard chrome |
| `src/lib/tickets.ts` | 286 | NEW — PostgREST queries for tickets/log/attachments |
| **Changed** | | |
| `src/routes/dashboard-admin.tsx` | 15 | REWRITTEN — nested Routes for tickets |
| `src/routes/dashboard-pm.tsx` | 15 | REWRITTEN — nested Routes for tickets |
| `src/routes/dashboard-resident.tsx` | 15 | REWRITTEN — nested Routes for tickets |
| `src/index.css` | 172 | UPDATED — dl/dt/dd styles, responsive, wider dashboard |
| **Frontend total** | **2,772** | |

---

## How to Run Locally

```bash
# Terminal 1: Supabase
supabase start && supabase db reset

# Terminal 2: Edge Functions
supabase functions serve --env-file ./supabase/.env.local

# Terminal 3: Frontend
npm install && npm run dev
```

---

## Pre-requisite: Bootstrap Test Data

```bash
ANON_KEY="<anon_key>"
SERVICE_KEY="<service_role_key>"
API="http://127.0.0.1:54321"

# 1. Create proroto_admin
ADMIN_AUTH=$(curl -s "$API/auth/v1/signup" \
  -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"email":"admin@proroto.com","password":"testpass123"}')
ADMIN_ID=$(echo $ADMIN_AUTH | jq -r '.user.id')

curl -s "$API/rest/v1/users" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"id\":\"$ADMIN_ID\",\"email\":\"admin@proroto.com\",\"full_name\":\"Marco Admin\",\"role\":\"proroto_admin\",\"company_id\":\"00000000-0000-0000-0000-000000000001\"}"

ADMIN_JWT=$(curl -s "$API/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"email":"admin@proroto.com","password":"testpass123"}' | jq -r '.access_token')

# 2. Create PM company + PM user
PM_CO=$(curl -s "$API/rest/v1/companies" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d '{"name":"Acme Properties","slug":"acme-props"}' | jq -r '.[0].id')

PM_AUTH=$(curl -s "$API/auth/v1/signup" \
  -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"email":"pm@example.com","password":"testpass123"}')
PM_ID=$(echo $PM_AUTH | jq -r '.user.id')

curl -s "$API/rest/v1/users" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"id\":\"$PM_ID\",\"email\":\"pm@example.com\",\"full_name\":\"Jane PM\",\"role\":\"pm_admin\",\"company_id\":\"$PM_CO\"}"

PM_JWT=$(curl -s "$API/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"email":"pm@example.com","password":"testpass123"}' | jq -r '.access_token')

# 3. Create building + space + entitlement
BLDG=$(curl -s "$API/rest/v1/buildings" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d "{\"company_id\":\"$PM_CO\",\"address_line1\":\"123 Main St\",\"city\":\"Redwood City\",\"state\":\"CA\",\"zip\":\"94063\",\"gate_code\":\"1234\"}" \
  | jq -r '.[0].id')

SPACE=$(curl -s "$API/rest/v1/spaces" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d "{\"building_id\":\"$BLDG\",\"space_type\":\"unit\",\"unit_number\":\"101\"}" \
  | jq -r '.[0].id')

curl -s "$API/rest/v1/building_entitlements" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"user_id\":\"$PM_ID\",\"building_id\":\"$BLDG\"}"

# 4. Create test tickets (as admin)
for i in 1 2 3; do
  curl -s -X POST "$API/functions/v1/create-ticket" \
    -H "Authorization: Bearer $ADMIN_JWT" -H "Content-Type: application/json" \
    -d "{\"building_id\":\"$BLDG\",\"space_id\":\"$SPACE\",\"issue_type\":\"drain_clog\",\"severity\":\"standard\",\"description\":\"Test ticket $i — kitchen sink slow\"}"
  echo ""
done

# Create an emergency ticket
curl -s -X POST "$API/functions/v1/create-ticket" \
  -H "Authorization: Bearer $ADMIN_JWT" -H "Content-Type: application/json" \
  -d "{\"building_id\":\"$BLDG\",\"space_id\":\"$SPACE\",\"issue_type\":\"active_leak\",\"severity\":\"emergency\",\"description\":\"Water flooding from ceiling — active leak in unit 101\"}"

echo "Admin JWT: $ADMIN_JWT"
echo "PM JWT: $PM_JWT"
echo "Building: $BLDG"
```

---

## Checkpoint 4.1 — Ticket List + Filters

### Test Steps
1. Log in as `admin@proroto.com` → lands on `/admin`
2. Ticket table shows 4 rows with columns: #, Status, Severity, Issue, Building, Space, Created By, Created
3. Emergency ticket shows red severity badge, standard shows gray
4. All statuses show "New" (blue badge)
5. Use the Status filter → select "Cancelled" → table shows "No tickets found"
6. Clear filter → use Severity → select "Emergency" → only the emergency ticket shows
7. Type "flooding" in search → emergency ticket matches
8. Type a ticket number → matches that specific ticket
9. Click any row → navigates to `/admin/tickets/<uuid>`

### Security Notes
- PostgREST query uses user JWT → RLS scopes results
- Admin sees all tickets; PM sees only their company's entitled buildings; Resident sees only their own
- No ticket_comments queried anywhere in the list

---

## Checkpoint 4.2 — Ticket Detail (Info + Timeline + Attachments)

### Test Steps
1. From ticket list, click a ticket → detail page loads
2. Header shows: Ticket #N, severity badge, status badge, created date/user
3. "Ticket Details" section shows: issue type, description, access instructions (if set), scheduling preference (if set)
4. "Location" section shows: building address, space (Unit 101), gate code (admin only)
5. "Status History" section shows: timeline with one entry ("New" — system creation)
6. "Attachments" section shows: "No attachments." (none uploaded yet)
7. "← Back to tickets" link returns to list
8. URL is bookmarkable: `/admin/tickets/<uuid>`

### Verify as PM
1. Log in as `pm@example.com` → lands on `/dashboard`
2. Click ticket → navigates to `/dashboard/tickets/<uuid>`
3. Gate code is NOT visible (admin-only field)
4. Same ticket data otherwise visible

---

## Checkpoint 4.3 — Comments Thread (Edge Functions Only)

### Test Steps (as admin)
1. On ticket detail, "Comments" section shows "No comments yet."
2. Type "Checking availability" in compose box → click "Post Comment"
3. Comment appears: "Marco Admin · Pro Roto Admin · [date]" with text
4. Check "Internal note (only visible to Pro Roto)" checkbox
5. Type "Customer has history of late payment" → click "Post Internal Note"
6. Internal comment shows with yellow background and "Internal" badge

### Test Steps (as PM)
1. Log in as PM → go to same ticket detail
2. Comments section shows ONLY the public comment (1 comment)
3. Internal comment is NOT visible
4. "Internal note" checkbox is NOT present in compose box
5. Post a public comment → appears immediately
6. Try setting `is_internal: true` via curl → returns 403

### Security Verification
```bash
# PM tries is_internal=true via Edge Function:
curl -s -X POST "$API/functions/v1/create-comment" \
  -H "Authorization: Bearer $PM_JWT" \
  -H "Content-Type: application/json" \
  -d "{\"ticket_id\":\"<ticket_id>\",\"comment_text\":\"sneaky\",\"is_internal\":true}"
# Expected: 403 FORBIDDEN

# PM tries direct PostgREST:
curl -s "$API/rest/v1/ticket_comments?ticket_id=eq.<ticket_id>" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $PM_JWT"
# Expected: permission denied (migration 00006)
```

---

## Checkpoint 4.4 — Action Panel + Transitions

### Test Steps (as admin — full lifecycle)
1. On a "New" ticket, Action Panel shows: "Needs Info", "Scheduled", "Cancelled"
2. Click "Scheduled" → success toast, status badge updates to "Scheduled"
3. Status Timeline now shows: New → Scheduled
4. Action Panel updates to show: "Dispatched", "Needs Info", "Cancelled"
5. Fill in "Assigned Technician" = "Bryan", "Scheduled Date" = tomorrow → click "Save Fields"
6. "Work Details" section appears showing technician and date
7. Click "Dispatched" → "On Site" → "In Progress" → "Waiting Approval"
8. Status badge now shows "Waiting for Approval"

### Test Steps (as PM — approval flow)
1. Log in as PM → go to the ticket now at "Waiting Approval"
2. Action Panel shows: "Scheduled" (approve), "Cancelled" (decline)
3. Click "Scheduled" → ticket moves back to Scheduled
4. Admin-only fields (technician, quote, etc.) are NOT visible

### Test Steps (as PM — decline)
1. Admin moves ticket back to "Waiting Approval"
2. PM sees decline reason input field
3. Type "Too expensive" → click "Cancelled"
4. Ticket moves to Cancelled (terminal)
5. Action Panel shows: "No further transitions available"

### Test Steps (terminal states)
1. Admin completes a ticket → moves to "Completed" → "Invoiced"
2. Action Panel shows: "This ticket is invoiced — no further transitions available."

### Transition Matrix Verification

| Current Status | Admin Buttons | PM Buttons | Resident |
|---|---|---|---|
| new | needs_info, scheduled, cancelled | cancelled | (none) |
| needs_info | new, scheduled, cancelled | new, cancelled | (none) |
| scheduled | dispatched, needs_info, cancelled | (none) | (none) |
| dispatched | on_site, scheduled, cancelled | (none) | (none) |
| on_site | in_progress, cancelled | (none) | (none) |
| in_progress | waiting_approval, completed, cancelled | (none) | (none) |
| waiting_approval | scheduled, in_progress, cancelled | scheduled, cancelled | (none) |
| completed | invoiced | (none) | (none) |
| invoiced | (terminal) | (terminal) | (terminal) |
| cancelled | (terminal) | (terminal) | (terminal) |

---

## Route Structure

| URL | Role | Component |
|-----|------|-----------|
| `/admin` | proroto_admin | TicketList |
| `/admin/tickets/:id` | proroto_admin | TicketDetail |
| `/dashboard` | pm_admin, pm_user | TicketList |
| `/dashboard/tickets/:id` | pm_admin, pm_user | TicketDetail |
| `/my` | resident | TicketList |
| `/my/tickets/:id` | resident | TicketDetail |

All three dashboards share the same `TicketList` and `TicketDetail` components. RLS determines which tickets are visible. The Action Panel uses the caller's role to determine available transitions.

---

## Data Source Summary

| Data | Source | Why |
|------|--------|-----|
| Ticket list | PostgREST `tickets` + joins | RLS scopes results per role |
| Ticket detail | PostgREST `tickets` by ID + joins | RLS gate |
| Status log | PostgREST `ticket_status_log` | No sensitive data, RLS allows |
| Attachments metadata | PostgREST `ticket_attachments` | RLS allows |
| Attachment download | Supabase Storage signed URL | 5 min expiry |
| Comments read | **Edge Function** `get-ticket-comments` | Migration 00006 blocks PostgREST |
| Comment create | **Edge Function** `create-comment` | Migration 00006 blocks PostgREST |
| Ticket update | **Edge Function** `update-ticket` | Transition validation + restricted fields |

---

## Security Checklist

| # | Check | Status |
|---|-------|--------|
| 1 | ticket_comments NEVER queried via PostgREST | ✅ |
| 2 | Comments read through get-ticket-comments Edge Function only | ✅ |
| 3 | Comments written through create-comment Edge Function only | ✅ |
| 4 | Internal comment checkbox visible only to proroto_admin | ✅ |
| 5 | Ticket updates through update-ticket Edge Function only | ✅ |
| 6 | Action panel shows ONLY transitions allowed for current role | ✅ |
| 7 | Admin-only fields (technician, quote, etc.) visible only to admin | ✅ |
| 8 | Gate code visible only to admin | ✅ |
| 9 | No service_role key in frontend | ✅ |
| 10 | Transition matrix from shared/types/transitions.ts (single source of truth) | ✅ |
| 11 | All PostgREST queries use user JWT with RLS | ✅ |
| 12 | Signed URLs for attachment downloads (5 min expiry) | ✅ |
