# PlumbTix — Step 6 Verification: Building & Space Management

## Files Added/Changed

| File | Lines | Status |
|------|-------|--------|
| **New: Data layer** | | |
| `src/lib/buildings.ts` | 309 | NEW — PostgREST CRUD for buildings + spaces |
| **New: Building components** | | |
| `src/components/buildings/BuildingList.tsx` | 99 | NEW — card grid with space/ticket counts |
| `src/components/buildings/BuildingDetail.tsx` | 306 | NEW — info + spaces (units/common areas) + CRUD |
| `src/components/buildings/BuildingForm.tsx` | 195 | NEW — create/edit form with all fields |
| `src/components/buildings/SpaceForm.tsx` | 217 | NEW — unit/common area form, CHECK constraint, dup check |
| **Changed** | | |
| `src/components/DashboardLayout.tsx` | 95 | UPDATED — Tickets/Buildings nav tabs |
| `src/routes/dashboard-admin.tsx` | 24 | UPDATED — building routes |
| `src/routes/dashboard-pm.tsx` | 24 | UPDATED — building routes |
| `src/routes/dashboard-resident.tsx` | 21 | UPDATED — building read-only routes |
| **Step 6 total new code** | **~1,126** | |

---

## Route Map

| URL | Roles | Component | Access |
|-----|-------|-----------|--------|
| `/admin/buildings` | proroto_admin | BuildingList | All buildings |
| `/admin/buildings/new` | proroto_admin | BuildingForm | Create |
| `/admin/buildings/:id` | proroto_admin | BuildingDetail | View + CRUD spaces |
| `/admin/buildings/:id/edit` | proroto_admin | BuildingForm | Edit |
| `/dashboard/buildings` | pm_admin, pm_user | BuildingList | Company buildings |
| `/dashboard/buildings/new` | pm_admin | BuildingForm | Create |
| `/dashboard/buildings/:id` | pm_admin, pm_user | BuildingDetail | View; CRUD for pm_admin |
| `/dashboard/buildings/:id/edit` | pm_admin | BuildingForm | Edit |
| `/my/buildings` | resident | BuildingList | Own building only |
| `/my/buildings/:id` | resident | BuildingDetail | View only |

---

## Checkpoint 6.1 — Building List + Detail

### Test Steps (Admin)
1. Log in as `admin@proroto.com` → Click "Buildings" tab in nav
2. Card grid shows all buildings with: name/address, city/state/zip, space count, ticket count
3. Click a building card → navigates to `/admin/buildings/<uuid>`
4. Detail page shows: header (name, full address), building details (gate code, shutoff locations, contact, notes)
5. "← Back to buildings" returns to list
6. "+ Add Building" button visible on list

### Test Steps (PM — pm_admin)
1. Log in as PM (pm_admin) → Click "Buildings" tab
2. Only sees buildings for their company (RLS scoped)
3. "+ Add Building" button visible
4. Click building → sees detail with Edit/Delete buttons

### Test Steps (PM — pm_user)
1. Log in as pm_user → Click "Buildings" tab
2. Sees only entitled buildings (read-only via RLS)
3. No "+ Add Building" button (canCreate guard)
4. Click building → detail page shows info but NO Edit/Delete buttons, NO "+ Add Space" button

### Test Steps (Resident)
1. Log in as resident → Click "Buildings" tab
2. Sees only their building (RLS scoped)
3. No "+ Add Building" button
4. Click building → read-only detail, no CRUD actions

---

## Checkpoint 6.2 — Building Create/Edit/Delete

### Create
1. Admin → Buildings → "+ Add Building"
2. Fill: Address "456 Oak St", City "San Mateo", State "CA", ZIP "94401"
3. Optionally fill: Gate Code, Water Shutoff, Gas Shutoff, Contact, Notes
4. Click "Add Building" → redirects to new building detail
5. Building appears in list with 0 spaces, 0 tickets

### Edit
1. On building detail → click "Edit"
2. Form pre-fills with current values
3. Change name, add gate code → click "Save Changes"
4. Redirects back to detail with updated values

### Delete — Empty Building
1. Create a building with no spaces
2. Click "Delete" → confirm dialog → building removed, redirected to list

### Delete — Building with Spaces (UI guard)
1. On a building that has spaces → click "Delete"
2. Error: "Cannot delete building with existing spaces. Remove all spaces first."
3. Building is NOT deleted

### RLS Enforcement
```bash
# pm_user tries to create (will fail at RLS):
curl -s "$API/rest/v1/buildings" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $PM_USER_JWT" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d '{"company_id":"...","address_line1":"Hacked","city":"X","state":"CA","zip":"00000"}'
# Expected: 403 or empty result (RLS blocks INSERT for pm_user)
```

---

## Checkpoint 6.3 — Spaces List (Units + Common Areas)

### Test Steps
1. On building detail, "Spaces" section shows count
2. Units listed in separate table: Unit #, Floor, Beds, Baths
3. Common Areas listed in separate table: Type, Floor
4. Empty state: "No spaces yet. Click '+ Add Space' to create units or common areas."
5. Edit/Delete links visible only for admin/pm_admin (canWrite guard)

---

## Checkpoint 6.4 — Space Create/Edit/Delete

### Create Unit
1. Click "+ Add Space" → inline form appears
2. Select "Unit" type → Unit Number field appears (required)
3. Fill: Unit # "201", Floor "2", Beds "2", Baths "1"
4. Click "Add Space" → space appears in units table
5. Form collapses

### Create Common Area
1. Click "+ Add Space" → select "Common Area"
2. Unit Number field hidden; Area Type dropdown appears (required)
3. Select "Boiler Room", Floor "-1"
4. Click "Add Space" → appears in common areas table

### CHECK Constraint Enforcement
1. The form enforces unit_number XOR common_area_type:
   - Unit type: unit_number required, common_area_type set to null in payload
   - Common area type: common_area_type required, unit_number set to null in payload
2. Cannot switch space_type during edit (radio disabled)
3. DB constraint `spaces_unit_number_check` rejects invalid combos as a seatbelt

### Duplicate Unit Number Prevention
1. Building has Unit "101"
2. Click "+ Add Space" → type "Unit" → enter "101"
3. Warning: 'Unit "101" already exists in this building.'
4. Submit button disabled while duplicate detected
5. Change to "102" → warning clears, submit enabled
6. DB unique index `idx_spaces_building_unit_unique` is the seatbelt

### Edit Space
1. Click "Edit" next to a unit → form pre-fills with current values
2. Space type radio is disabled (can't switch unit ↔ common area)
3. Change unit number from "201" to "201A" → save
4. Table updates

### Delete Space
1. Click "Delete" next to a space → confirm dialog
2. Space removed from table
3. If space has tickets referencing it → DB FK RESTRICT blocks deletion → error surfaced

---

## Data Source Summary

| Operation | Method | RLS Policy |
|-----------|--------|------------|
| List buildings | PostgREST SELECT `buildings` | `proroto_admin_all_buildings`, `pm_admin_company_buildings`, `pm_user_entitled_buildings`, `resident_own_building` |
| Create building | PostgREST INSERT `buildings` | `proroto_admin` (ALL), `pm_admin` (ALL + company check) |
| Update building | PostgREST UPDATE `buildings` | Same as create |
| Delete building | PostgREST DELETE `buildings` | Same as create; UI guards if spaces exist |
| List spaces | PostgREST SELECT `spaces` | `proroto_admin_all_spaces`, `pm_admin_company_spaces`, `pm_user_entitled_spaces`, `resident_own_space` |
| Create space | PostgREST INSERT `spaces` | `proroto_admin` (ALL), `pm_admin` (company building check) |
| Update space | PostgREST UPDATE `spaces` | Same as create |
| Delete space | PostgREST DELETE `spaces` | Same as create; DB FK RESTRICT if tickets reference it |

---

## Security Checklist

| # | Check | Status |
|---|-------|--------|
| 1 | All operations use PostgREST with user JWT (no service role) | ✅ |
| 2 | No Edge Functions introduced | ✅ |
| 3 | No locked migrations modified (00001–00006) | ✅ |
| 4 | RLS errors surfaced as friendly messages ("You don't have permission") | ✅ |
| 5 | pm_user/resident see no create/edit/delete UI (canWrite/canCreate guards) | ✅ |
| 6 | Building delete blocked in UI if spaces exist | ✅ |
| 7 | Space form enforces CHECK constraint (unit_number XOR common_area_type) | ✅ |
| 8 | Duplicate unit numbers detected client-side before submit | ✅ |
| 9 | DB unique index is the seatbelt for unit number uniqueness | ✅ |
| 10 | DB FK RESTRICT protects spaces referenced by tickets | ✅ |
| 11 | Space type cannot be changed during edit (prevents constraint violations) | ✅ |
| 12 | Navigation tabs use absolute paths per role root | ✅ |
