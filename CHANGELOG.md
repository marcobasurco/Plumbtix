# PlumbTix v0.2.2 — Changelog

**Date:** February 9, 2026

## v0.2.2 — Critical Frontend Fix: CSS Foundation + UI Modernization

### Root Cause: Missing Tailwind/shadcn CSS Infrastructure

The v0.2.0 frontend had **three compounding CSS failures** that made shadcn/ui components invisible:

1. **No `postcss.config.js`** — PostCSS never invoked Tailwind, so zero utility classes were generated
2. **No `@tailwind` directives** in `index.css` — even with PostCSS, Tailwind had no entry point
3. **No shadcn CSS variables** (`--primary`, `--background`, `--border`, etc.) — all shadcn components rendered with unresolved `hsl(var(--primary))` → invisible

**Result:** shadcn `<Button>`, `<Input>`, `<Card>`, `<Dialog>`, and `<Label>` all rendered as unstyled/invisible HTML. Forms *appeared* non-functional because users couldn't see inputs or buttons. The JavaScript logic was correct — only the CSS was broken.

### New Files

| File | Purpose |
|------|---------|
| `postcss.config.js` | Enables Tailwind CSS processing via PostCSS |
| `src/lib/schemas.ts` | Zod validation schemas (Building, Space, Company) matching DB constraints exactly |
| `src/components/buildings/BuildingFormDialog.tsx` | Modal-based building form using react-hook-form + Zod |

### Modified Files

| File | Change |
|------|--------|
| `tailwind.config.js` | Full shadcn/ui theme with CSS variable colors, border-radius, animations |
| `src/index.css` | Added `@tailwind base/components/utilities` + shadcn `:root` CSS variables |
| `package.json` | Added `sonner`, `zod`, `react-hook-form`, `@hookform/resolvers` |
| `src/App.tsx` | Added sonner `<Toaster>` component for consistent toast notifications |
| `src/components/Toast.tsx` | Replaced custom toast system with sonner-backed shim (backward compatible) |
| `src/components/buildings/BuildingForm.tsx` | Rewritten as thin wrapper rendering BuildingFormDialog for route-based nav |
| `src/components/buildings/BuildingList.tsx` | Integrated BuildingFormDialog; removed separate company-picker dialog |
| `src/components/buildings/BuildingDetail.tsx` | Integrated BuildingFormDialog for inline edit; fixed back-link button |
| `src/components/buildings/SpaceForm.tsx` | Rewritten with react-hook-form + Zod; type-toggle uses shadcn Button |
| `src/components/DashboardOverview.tsx` | Replaced raw `.btn` buttons with shadcn `<Button>` |
| `src/components/admin/CompanyDetail.tsx` | Fixed back-link button → shadcn `<Button variant="ghost">` |
| `src/components/admin/UsersPage.tsx` | Replaced 2 raw `.btn` buttons with shadcn `<Button>` |
| `src/components/tickets/CreateTicketWizard.tsx` | Replaced 3 raw `.btn` buttons with shadcn `<Button>` + loading spinner |
| `src/routes/login.tsx` | Replaced raw submit button with shadcn `<Button>` + Loader2 spinner |

### Button Standardization

All action buttons now use `<Button>` from `@/components/ui/button`:

| Action | Variant | Example |
|--------|---------|---------|
| Primary actions | `default` | New Building, Save, Submit, Next |
| Destructive | `destructive` | Delete Building, Delete Space |
| Cancel/Secondary | `outline` | Cancel, Previous |
| Navigation/back | `ghost` | ← Buildings, ← Back |
| Link-style | `link` | View all → |

### Building CRUD: Complete End-to-End Flow

1. **BuildingList** → "New Building" button visible for `proroto_admin` and `pm_admin`
2. Click opens **BuildingFormDialog** (shadcn Dialog, react-hook-form + Zod)
3. For `proroto_admin`: company selector dropdown in the form
4. Zod validates: address (required), city (required), state (2 chars), ZIP (5+4 regex), phone format
5. Submit button disabled until form is valid + not loading
6. On submit → `create-building` edge function → sonner success toast → list refreshes
7. Edit flow: BuildingDetail → Edit button → same dialog, pre-filled → `update-building` edge function
8. Delete flow: BuildingDetail → Delete → AlertDialog confirmation → `delete-building` edge function

### Deployment

```bash
npm install   # installs sonner, zod, react-hook-form, @hookform/resolvers
npm run build # Tailwind now processes correctly via PostCSS
```

No edge function changes — v0.2.1 functions still current.

---

## v0.2.1 — Edge Functions + ErrorBoundary

---

## New Files

### Edge Functions (6 new)

All follow the established codebase pattern: `createUserClient(req)` → JWT pass-through → Zod `parseBody()` validation → RLS-enforced writes → `ok()`/`err()` response helpers.

| Function | Path | Purpose |
|----------|------|---------|
| `create-building` | `supabase/functions/create-building/index.ts` | Validated building creation with field whitelisting |
| `update-building` | `supabase/functions/update-building/index.ts` | Validated building update by ID |
| `delete-building` | `supabase/functions/delete-building/index.ts` | Safe delete with ticket/space dependency checks |
| `create-space` | `supabase/functions/create-space/index.ts` | Discriminated union validation (unit vs common_area) |
| `update-space` | `supabase/functions/update-space/index.ts` | Space update with type-switching validation |
| `delete-space` | `supabase/functions/delete-space/index.ts` | Safe delete with ticket/occupant dependency checks |

### Components

| File | Purpose |
|------|---------|
| `src/components/ErrorBoundary.tsx` | Global crash boundary with recovery UI |

### Documentation & Repo

| File | Purpose |
|------|---------|
| `LICENSE` | Proprietary license (Pro Roto, Inc.) |
| `docs/AUDIT_REPORT.md` | Full codebase audit as of Feb 9, 2026 |
| `CHANGELOG.md` | This file |

---

## Modified Files

### `src/App.tsx`
- Added `ErrorBoundary` import
- Wrapped entire app in `<ErrorBoundary>` (outside `<BrowserRouter>`)

### `src/lib/buildings.ts`
- **Building writes** (`createBuilding`, `updateBuilding`, `deleteBuilding`) now invoke edge functions via `supabase.functions.invoke()` instead of direct PostgREST
- **Space writes** (`createSpace`, `updateSpace`, `deleteSpace`) now invoke edge functions
- Added `invokeFunction<T>()` helper that parses the `ApiResponse<T>` envelope (`{ ok, data }` / `{ ok, error }`)
- **All reads unchanged** — still via PostgREST + RLS (no reason to change)
- **Occupant/entitlement CRUD unchanged** — still direct PostgREST (next phase)

### Removed
- `.env.local` — removed from package (contains production Supabase credentials)

---

## Deployment Steps

### 1. Deploy edge functions

```bash
supabase functions deploy create-building
supabase functions deploy update-building
supabase functions deploy delete-building
supabase functions deploy create-space
supabase functions deploy update-space
supabase functions deploy delete-space
```

### 2. Install dependencies (no new deps needed)
```bash
npm install
```

### 3. Type check
```bash
npm run typecheck
```

### 4. Build and deploy
```bash
npm run build
# Netlify auto-deploys from git push, or:
# netlify deploy --prod
```

---

## What's Still Direct PostgREST (Future Phase)

These entities still use direct PostgREST writes. They work correctly via RLS, but could be migrated to edge functions for validation consistency:

- `createOccupant` / `deleteOccupant`
- `createEntitlement` / `deleteEntitlement`
- Company create/update (in `lib/admin.ts`)

---

## Architecture Note

The edge functions use **User JWT pass-through** (not service_role):

```
Frontend → supabase.functions.invoke('create-building', { body })
         → Edge function: createUserClient(req)  ← JWT forwarded
         → parseBody(req, ZodSchema)              ← server-side validation
         → userClient.from('buildings').insert()  ← RLS enforces authorization
         → ok(building, 201)                      ← consistent response envelope
```

This matches the existing `create-ticket`, `update-ticket`, and `create-comment` functions exactly. RLS policies (from migration 00002) handle all authorization — no manual role/company checks needed in the function code.
