# Work Orders Changelog

## [0.9.0] — Token-Based Public Sharing + Local QR Generation (July 2026)

### Security — Public Ticket Access Overhaul
- **Migration 00021**: `public_token` (random UUID, UNIQUE) + `public_enabled` (default `false`) columns on `tickets`, plus a partial lookup index on enabled rows. Purely additive — no locked-section changes.
- **`get-public-ticket` rewritten**: resolves by `?token=<public_token>` and requires `public_enabled = true`. Knowing a ticket's primary-key UUID no longer grants public access. Revoked/unknown tokens return an identical 404 (no information leak).
- **New Edge Function `toggle-public-sharing`**: proroto_admin + pm_admin enable/disable sharing per ticket. Reads AND writes via caller JWT — existing tickets RLS is the enforcement layer, no service role. Supports `regenerate` to rotate the token and burn all previously shared links.
- ⚠️ **Breaking (deliberate)**: previously printed `/p/<ticket_id>` QR codes and links stop working. Sharing is now opt-in per ticket; re-enable and reprint where needed. An optional backfill statement (commented out in migration 00021) can restore public access for all existing tickets with new revocable URLs.

### Security — QR Codes No Longer Leak to Third Parties
- Replaced `api.qrserver.com` remote QR generation with the `qrcode` npm library. QR codes are now generated in-browser as base64 data URLs — ticket URLs never leave the client, and PDF generation works offline.
- QR block on the printed work order renders **only when public sharing is enabled** (with the token URL, not the ticket id). Otherwise it's omitted.
- Deleted dead `TicketReport.tsx` (unreferenced since the v0.8.1 PDF print rewrite; contained the last remaining qrserver call).

### Added — Public Sharing UI
- **`SharingCard`** in the ticket detail sidebar (proroto_admin + pm_admin): on/off switch, copy-link button, monospace link display, and "New link" (token regeneration with confirm dialog).
- `TicketDetailRow` / shared `Ticket` type extended with `public_token` / `public_enabled`.
- New API client wrapper `togglePublicSharing()` + shared request/response types.

### Fixed
- **Public ticket view URL bug**: `public-ticket.tsx` appended `/functions/v1` to `VITE_EDGE_BASE_URL`, which already contains it (same convention as `callEdge`), producing `/functions/v1/functions/v1/…`. The public view now uses the same base-URL convention as the rest of the app.

### Configuration
- New optional env var `VITE_PUBLIC_APP_URL` — base URL for share links and printed QR codes (falls back to `window.location.origin`). Set to `https://workorders.proroto.com` in production.
- Dependencies: `qrcode@^1.5.4`, `@types/qrcode@^1.5.5`. Version bumped to 0.9.0.

### Netlify — Deployment Hardening
- **Per-context env**: `VITE_PUBLIC_APP_URL` pinned to `https://workorders.proroto.com` in production context only; deploy previews fall back to their own origin so preview QR codes never point at (or leak from) production.
- **Secrets scanning**: `SECRETS_SCAN_OMIT_KEYS` whitelists the VITE_* values that are public by design (anon key, URLs), preventing Netlify's scanner from failing builds when it finds them in the compiled bundle.
- **Security headers**: added HSTS; added a Content-Security-Policy in **Report-Only** mode tuned for the actual stack (Supabase REST/Realtime/Storage, unpkg ffmpeg WASM, blob workers, data-URL QR codes, Sentry). Flip to enforcing after a clean observation window.
- **Public pages unindexable**: `/p/*` and `/t/*` send `X-Robots-Tag: noindex, nofollow, noarchive` + `Cache-Control: no-store`; new `public/robots.txt` disallows all crawling of the portal.
- **Service worker fix**: `/sw.js` now `max-age=0, must-revalidate` — previously uncached-by-accident, but with no explicit header a CDN default could pin users to a stale app shell for up to 24h after deploys.
- **Build**: Node 20 pinned; npm flags quieted. Note: no `package-lock.json` is committed — commit one and switch the build command to `npm ci` for reproducible builds.


## [0.7.0] — Twilio SMS Notifications (February 2026)

### Added — SMS Notification Infrastructure
- **Migration 00017**: `sms_notifications_enabled` column on users + `sms_log` audit table with RLS
- **Edge Function `send-sms`**: Direct SMS sending endpoint (proroto_admin only)
- **Shared `_shared/sms.ts`**: Twilio REST API integration with E.164 validation, sandbox mode, and audit logging
- **Shared `_shared/notifications.ts`**: Updated with SMS dispatch for emergency and completion events

### Added — SMS Triggers
- **Emergency ticket → SMS to PMs**: When a new emergency work order is created, all property managers for the building's company receive an SMS alert (always, no opt-in required)
- **Ticket completed → SMS to resident**: When a ticket status changes to `completed`, the ticket creator receives an SMS if they have `sms_notifications_enabled = true`
- All SMS logged to `sms_log` table for audit and debugging
- Sandbox mode (`TWILIO_SANDBOX=true`) logs SMS instead of sending

### Added — Settings Page
- **`/settings` route** available to all roles (admin, PM, resident)
- Account summary card (name, email, role badge)
- SMS Notifications card with phone input (E.164 validation + US format auto-normalization) and opt-in toggle
- Role-specific messaging: residents see opt-in toggle, PMs see "emergency alerts always enabled" info, admins see env var note
- Save via Supabase RLS-protected update with toast feedback
- Settings accessible from user dropdown menu in header

### Added — Short Ticket Links
- `/t/:ticketId` redirect route for SMS/email ticket links → resolves to role-appropriate dashboard ticket detail

### Added — shadcn/ui Switch Component
- `src/components/ui/switch.tsx` — Radix Switch primitive with Tailwind styling

### Changed
- `create-ticket` and `update-ticket` edge functions now fetch creator `id` for SMS recipient resolution
- `getCompanyPMEmails()` and `getTicketCreator()` now return `phone` and `sms_notifications_enabled` fields
- `TicketContext.created_by` interface extended with `id` field
- `User` TypeScript interface updated with `sms_notifications_enabled: boolean`
- Version bumped to 0.7.0

## [0.4.0] — SaaS MVP Polish (February 10, 2026)

### Added — Subscription & Billing Foundation
- **Migration 00010**: `company_subscriptions` table with tier enum (free/starter/professional/enterprise)
- Subscription status tracking (active/past_due/cancelled/trialing)
- Per-tier limits: max_buildings, max_users, max_tickets_mo, max_storage_mb
- Stripe integration prep columns (stripe_customer_id, stripe_subscription_id)
- Auto-create subscription trigger on new company creation
- RLS: proroto_admin full access, pm_admin reads own company
- Realtime enabled for company_subscriptions table

### Added — Analytics Dashboard
- **`/admin/analytics` route** — full platform analytics page (proroto_admin only)
- KPI cards: MRR, companies, users, open tickets, monthly volume
- Ticket volume area chart (6-month trend)
- Issue type horizontal bar chart, severity donut, status breakdown bars
- Per-company subscription & utilization table with tier badges
- Utilization progress bars (buildings/users/tickets vs tier limits)
- Navigation: "Analytics" added to admin sidebar

### Polished — Ticket Detail Page
- Converted from raw CSS objects to Tailwind + shadcn/ui Cards
- Mobile-responsive: single-column stack on small screens
- Skeleton loading state with proper hierarchy
- Info rows with icons, dividers, and consistent spacing
- Clickable phone/email links for contacts

### Security Posture (unchanged)
- ✅ Zero direct PostgREST mutations (20 edge functions)
- ✅ 41+ RLS policies including new subscription policies
- ✅ JWT validation in every edge function
- ✅ Realtime subscriptions on 12 components

---

# Work Orders v0.3.0 — Changelog

**Date:** February 9, 2026

## v0.3.0 — SaaS MVP: Zero PostgREST Mutations + Realtime + Analytics

### Highlight: Zero Direct PostgREST Mutations

Every write operation in the entire app now goes through a validated edge function. There are **zero** direct `.insert()`, `.update()`, or `.delete()` calls in the frontend data layer. Reads still use PostgREST + RLS for performance.

### New Edge Functions (6 new, 20 total)

| Function | Purpose |
|----------|---------|
| `create-company` | Validated company creation, slug uniqueness check |
| `update-company` | Validated company update, duplicate slug protection |
| `create-occupant` | Add tenant/homeowner to space, server-side invite token |
| `delete-occupant` | Remove occupant with open-ticket safety check |
| `create-entitlement` | Grant pm_user building access, duplicate protection |
| `delete-entitlement` | Revoke pm_user building access |

### Realtime Subscriptions

Live updates across the entire app — no manual refresh needed:

| Component | Tables Subscribed | Effect |
|-----------|-------------------|--------|
| `TicketList` | tickets, comments, attachments | Auto-refreshes when any ticket changes |
| `TicketDetail` | tickets (filtered), comments (filtered) | Live status changes and new comments |
| `BuildingList` | buildings, spaces, occupants | Auto-refreshes on any building CRUD |
| `BuildingDetail` | spaces (filtered), occupants | Live space/occupant updates |
| `DashboardOverview` | tickets, comments, attachments | Live metric updates |

Implementation: Generic `useRealtime` hook with 100ms debounce, per-table filters, enable/disable control. Convenience wrappers `useRealtimeTickets` and `useRealtimeBuildings`.

### Per-Company Analytics (proroto_admin)

New "Company Breakdown" table on the dashboard showing per-company:
buildings, spaces, users, open tickets, total tickets.

Powered by `v_company_analytics` database view (migration 00008).

### Usage Tracking (Billing Prep)

New `company_usage_monthly` table with auto-incrementing ticket counts via trigger. Includes `fn_snapshot_company_usage()` for periodic snapshots of building/space/user/storage counts. RLS ensures pm_admins see only their own company's usage.

### Database Migrations (2 new)

| Migration | Purpose |
|-----------|---------|
| `00008_usage_tracking.sql` | `company_usage_monthly` table, ticket tracking trigger, snapshot function, `v_company_analytics` view |
| `00009_enable_realtime.sql` | Enables Supabase Realtime publication for 8 key tables |

### Files Changed

**New Edge Functions:** `create-company`, `update-company`, `create-occupant`, `delete-occupant`, `create-entitlement`, `delete-entitlement`

**New Frontend:**
- `src/hooks/useRealtime.ts` — Generic realtime subscription hook + convenience wrappers

**Modified Frontend:**
- `src/lib/admin.ts` — Company CRUD now uses edge functions
- `src/lib/buildings.ts` — Occupant + entitlement CRUD now uses edge functions; removed `parseRLSError`
- `src/lib/dashboard.ts` — Added `CompanyAnalyticsRow` type + `companyBreakdown` in metrics
- `src/components/DashboardOverview.tsx` — Company breakdown table + realtime
- `src/components/tickets/TicketList.tsx` — Realtime subscription
- `src/components/tickets/TicketDetail.tsx` — Realtime subscription (filtered)
- `src/components/buildings/BuildingList.tsx` — Realtime subscription
- `src/components/buildings/BuildingDetail.tsx` — Realtime subscription (filtered)

### Deployment

```bash
# 1. Deploy new edge functions
supabase functions deploy create-company --no-verify-jwt
supabase functions deploy update-company --no-verify-jwt
supabase functions deploy create-occupant --no-verify-jwt
supabase functions deploy delete-occupant --no-verify-jwt
supabase functions deploy create-entitlement --no-verify-jwt
supabase functions deploy delete-entitlement --no-verify-jwt

# 2. Run new migrations
supabase db push

# 3. Build and deploy frontend
npm install && npm run build
```

### Architecture After v0.3.0

```
Frontend (React + Vite + shadcn/ui)
  ├── READS:  PostgREST + User JWT + RLS (fast, cacheable)
  ├── WRITES: Edge Functions + Zod validation + RLS (secure, validated)
  └── LIVE:   Supabase Realtime subscriptions (debounced, filtered)

Edge Functions (20 total)
  ├── All use User JWT pass-through (no service_role on mutations)
  ├── Zod server-side validation on every write
  ├── Consistent { ok, data } / { ok, error } response envelope
  └── CORS headers on all responses

Database (Postgres 15)
  ├── 12 tables (11 + company_usage_monthly)
  ├── 43 RLS policies (41 + 2 new for usage table)
  ├── Ticket status enforcement trigger
  ├── Usage tracking trigger (fn_track_ticket_usage)
  ├── v_company_analytics view
  └── Realtime publication on 8 tables
```

---

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
