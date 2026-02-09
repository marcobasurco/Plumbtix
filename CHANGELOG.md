# PlumbTix v0.2.1 — Changelog

**Date:** February 9, 2026

## Summary

This release closes the mutation consistency gap (buildings and spaces now use edge functions instead of direct PostgREST), adds crash protection via a global ErrorBoundary, and includes repo hygiene items (LICENSE, audit report, `.env.local` removal).

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
