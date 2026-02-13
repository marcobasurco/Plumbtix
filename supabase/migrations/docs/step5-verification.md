# Work Orders — Step 5 Verification: Ticket Creation Wizard

## Files Added/Changed

| File | Lines | Status |
|------|-------|--------|
| `src/components/tickets/CreateTicketWizard.tsx` | 662 | **NEW** — 6-step wizard |
| `src/components/tickets/TicketList.tsx` | 191 | UPDATED — "+ New Ticket" button |
| `src/routes/dashboard-admin.tsx` | 17 | UPDATED — `tickets/new` route |
| `src/routes/dashboard-pm.tsx` | 17 | UPDATED — `tickets/new` route |
| `src/routes/dashboard-resident.tsx` | 17 | UPDATED — `tickets/new` route |
| `src/lib/tickets.ts` | 328 | UPDATED (prev session) — `fetchSpacesForBuilding`, file constants |
| **Frontend total** | **3,490** | |

---

## Wizard Flow

```
Step 1: Select Building     → fetchBuildingOptions() via PostgREST (RLS-scoped)
Step 2: Select Space         → fetchSpacesForBuilding() via PostgREST (RLS-scoped)
Step 3: Select Issue Type    → Static from ISSUE_TYPES enum
Step 4: Select Severity      → Static; auto-suggests DEFAULT_SEVERITY[issueType]
Step 5: Details + Files      → Description, access instructions, scheduling, file picker
Step 6: Confirm + Submit     → createTicket Edge Function → Storage upload → registerAttachment
```

---

## Routes

| URL | Role | Component |
|-----|------|-----------|
| `/admin/tickets/new` | proroto_admin | CreateTicketWizard |
| `/dashboard/tickets/new` | pm_admin, pm_user | CreateTicketWizard |
| `/my/tickets/new` | resident | CreateTicketWizard |

Route `tickets/new` is declared BEFORE `tickets/:ticketId` in each dashboard to avoid the param route catching "new" as a ticket ID.

---

## Checkpoint 5.1 — Routing + Wizard Skeleton

### Test Steps
1. Log in as admin → `/admin` shows ticket list with "+ New Ticket" button
2. Click "+ New Ticket" → navigates to `/admin/tickets/new`
3. Progress bar shows 6 segments (first highlighted)
4. "← Back to tickets" returns to list
5. Steps 1-5 require selection before "Next" enables
6. URL `/admin/tickets/new` is directly bookmarkable

### Security Notes
- Route is inside `<ProtectedRoute>` + `<RoleGate>` — requires auth
- Wizard lives within dashboard scope — RLS applies to all data fetches

---

## Checkpoint 5.2 — Building + Space Data Loading

### Test Steps
1. Step 1: Buildings load from PostgREST (RLS filters to entitled buildings)
2. Select a building → border highlights blue
3. Click "Next" → Step 2 loads spaces for that building
4. Spaces show unit numbers and common area types
5. Select a space → advance to Step 3

### Verify RLS Scoping
```bash
# PM user should only see buildings they have entitlements for
# Admin should see all buildings
# Resident should see buildings for their occupancy

# Log in as PM → Step 1 shows only entitled buildings
# Log in as admin → Step 1 shows all buildings
```

### Security Notes
- `fetchBuildingOptions()` uses user JWT → `buildings_entitled_read` RLS policy
- `fetchSpacesForBuilding()` uses user JWT → `spaces_entitled_read` RLS policy
- No service role involved

---

## Checkpoint 5.3 — Ticket Creation via Edge Function

### Test Steps
1. Complete Steps 1-5 (select building, space, issue type, severity, description)
2. Step 6 shows summary: building, space, issue type, severity, description, scheduling, attachment count
3. Click "Create Ticket" → calls `createTicket()` (POST /functions/v1/create-ticket)
4. On success → navigates to `/admin/tickets/<new_ticket_id>` (ticket detail page)
5. New ticket visible in detail view with all fields
6. Ticket list now shows the new ticket

### Test: Missing required field
1. Skip description on Step 5 → "Next" button disabled
2. Cannot advance to Step 6 without description

### Test: Severity auto-suggestion
1. Step 3: Select "Active Leak" → Step 4 auto-selects "Emergency"
2. Step 3: Select "Drain Clog" → Step 4 auto-selects "Standard"
3. User can override the suggestion

### Test: Scheduling preference
1. "ASAP" is default → creates ticket with `scheduling_preference: { type: 'asap' }`
2. Switch to "Preferred window" → date and time inputs appear
3. Fill in date/time → summary shows the preference

### Security Notes
- Ticket created via Edge Function (not PostgREST INSERT)
- Edge Function validates building/space ownership, issue type, severity
- No direct table writes from frontend

---

## Checkpoint 5.4 — Attachment Upload + Progress UI

### Pre-requisite
Storage bucket `ticket-attachments` must exist (Section 6 migration).

### Test Steps: Successful Upload
1. On Step 5, click file input → select 1 JPEG image (< 10 MB)
2. File appears in list with name and size
3. Complete wizard → Step 6 shows "1 file"
4. Click "Create Ticket" → ticket created first, then upload progress appears:
   - `○ photo.jpg — Waiting`
   - `⟳ photo.jpg — Uploading…`
   - `⟳ photo.jpg — Registering…`
   - `✓ photo.jpg — Done`
5. Redirects to ticket detail → Attachments section shows the file with "View" button

### Test Steps: File Validation (client-side)
1. Select a file > 10 MB → appears in list with red "Exceeds 10 MB limit" error
2. Select a .exe file → appears with "Unsupported type" error
3. Error files are shown but marked; summary on Step 6 counts only valid files
4. Error files are SKIPPED during upload

### Test Steps: Upload Failure Handling
1. (Simulate by removing storage bucket or RLS policy)
2. Ticket creation succeeds → upload progress shows `✗ file.jpg — Failed`
3. Warning: "Some uploads failed. The ticket was created successfully — you can retry from the ticket detail page."
4. Still redirects to detail page after all attempts complete

### Test Steps: Multiple Files
1. Select 3 files (2 valid, 1 too large)
2. Step 6 shows "2 files" (invalid excluded)
3. Upload progress shows 2 files processing sequentially
4. Both complete → redirect

### Upload Path Pattern
```
Storage bucket: ticket-attachments
File path:      tickets/{ticket_id}/{filename}
```

### Security Notes
- Files uploaded to Supabase Storage via user JWT
- Storage RLS (Section 6) scopes uploads to entitled users
- `registerAttachment` Edge Function validates ticket ownership
- Client-side validation is a UX convenience; server enforces limits too
- Files selected in Step 5 are NOT uploaded until Step 6 submission
- `upsert: false` prevents overwriting existing files

---

## Data Source Audit

| Operation | Method | Why |
|-----------|--------|-----|
| Load buildings | PostgREST `buildings` SELECT | RLS: `buildings_entitled_read` |
| Load spaces | PostgREST `spaces` SELECT | RLS: `spaces_entitled_read` |
| Create ticket | Edge Function `create-ticket` | Validates ownership + creates status log |
| Upload file | Supabase Storage `.upload()` | RLS: storage policy per Section 6 |
| Register attachment | Edge Function `register-attachment` | Validates ticket ownership |

---

## Security Checklist

| # | Check | Status |
|---|-------|--------|
| 1 | Ticket created via create-ticket Edge Function (not PostgREST INSERT) | ✅ |
| 2 | Building list RLS-scoped (user sees only entitled buildings) | ✅ |
| 3 | Space list RLS-scoped (building_id scoped to entitled buildings) | ✅ |
| 4 | Files validated client-side: 10 MB max, allowed MIME types | ✅ |
| 5 | Files uploaded to Storage via user JWT (not service role) | ✅ |
| 6 | Storage path: `tickets/{ticket_id}/{filename}` (matches Section 6 policy) | ✅ |
| 7 | Attachment metadata registered via Edge Function (validates ownership) | ✅ |
| 8 | Upload failures don't block ticket creation (ticket exists, uploads are additive) | ✅ |
| 9 | `tickets/new` route before `:ticketId` (avoids "new" being parsed as UUID) | ✅ |
| 10 | No service role key in frontend | ✅ |
| 11 | `upsert: false` on storage upload (no overwrites) | ✅ |
