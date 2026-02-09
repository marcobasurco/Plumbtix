# PlumbTix Codebase Audit Report

**Date:** February 9, 2026  
**Repo:** Plumbtix (v0.2.0)  
**Live URL:** workorders.proroto.com  
**Hosting:** Netlify (SPA) + Supabase (DB, Auth, Edge Functions, Storage)

---

## Executive Summary

PlumbTix is a **well-architected, functional work-order portal** with solid foundations. The codebase is clean, well-commented, and follows consistent patterns. However, it is currently a **"v1 MVP"** — the core ticket lifecycle works, but several admin CRUD flows are incomplete, the frontend uses a hybrid CSS approach (custom CSS + partial Tailwind), and there are meaningful gaps in edge function coverage for building/space/company mutations. The app is production-deployed and functional for ticket creation/management, but not yet feature-complete for full property management operations.

---

## 1. Architecture Overview

### Stack
| Layer | Technology | Status |
|-------|-----------|--------|
| Frontend Framework | React 19 + Vite 6 + TypeScript 5.7 | ✅ Current |
| Routing | React Router v7 (BrowserRouter, nested Routes) | ✅ Working |
| Styling | Custom CSS (1,151 lines) + Tailwind v3 (partially used) + shadcn/ui primitives | ⚠️ Hybrid |
| Animation | Framer Motion 11 | ✅ Integrated |
| Charts | Recharts 2.15 | ✅ Dashboard only |
| Icons | Lucide React | ✅ Throughout |
| Auth | Supabase Auth (email/password) | ✅ Solid |
| Database | Supabase PostgreSQL (11 tables, 8 enums) | ✅ Well-designed |
| API (reads) | Supabase PostgREST with RLS | ✅ Working |
| API (writes) | Supabase Edge Functions (8 deployed) | ⚠️ Partial coverage |
| Storage | Supabase Storage (ticket attachments) | ✅ Working |
| Deploy | Netlify (SPA config, security headers) | ✅ Production |

### File Counts
- **Total source lines:** ~8,250 (frontend)
- **Components:** 30 files
- **Data/hooks/lib:** 9 files
- **Shared types:** 5 files
- **Edge functions:** 8 deployed
- **SQL migrations:** 7

---

## 2. What's Working Well

### ✅ Database Schema (Excellent)
The Postgres schema across 7 migrations is thorough and production-grade:
- 11 tables with proper FK constraints, cascading deletes, and check constraints
- 8 custom enums that enforce valid state transitions
- RLS policies for all 4 roles (proroto_admin, pm_admin, pm_user, resident)
- The `spaces` table has a smart CHECK constraint ensuring units have `unit_number` and common areas have `common_area_type`
- Ticket status log table provides full audit trail

### ✅ Shared Type System
Types in `/shared/types/` are meticulously mapped to the Postgres schema with column-by-column comments. This is best-in-class for a Supabase project. Enums include display labels.

### ✅ Auth System
The `AuthProvider` is well-implemented:
- Uses `onAuthStateChange` correctly (avoids double-fetch with INITIAL_SESSION)
- Fetches user profile from `public.users` via RLS self-read
- Exposes `role`, `companyId`, `session`, `profile`, `signIn`, `signOut`, `refreshProfile`
- Clean error handling

### ✅ Ticket Lifecycle (Most Complete Feature)
- **CreateTicketWizard** (662 lines) — A polished 6-step wizard: building → space → issue type → severity → details/files → confirm
- **TicketDetail** — View with status timeline, comments thread, attachments, action panel
- **TicketList** — With filters by status
- Edge functions for: `create-ticket`, `update-ticket`, `create-comment`, `get-ticket-comments`, `register-attachment`
- Attachment upload via Supabase Storage with 2-step pattern

### ✅ Dashboard Overview
- 4 metric cards (total tickets, open, buildings, spaces)
- Bar chart (tickets by status), pie chart (by severity), bar chart (by issue type)
- Recent activity feed
- Admin-only visibility

### ✅ Building CRUD (Frontend)
- BuildingList with search, card grid, skeleton loading, stagger animations
- BuildingForm with validation (state 2-letter, ZIP format, phone)
- BuildingDetail with spaces list, occupants, entitlements tabs
- SpaceForm with unit/common_area type switching
- OccupantList with invite token generation and claim link copy
- EntitlementManager for assigning pm_users to buildings

### ✅ Company Management
- CompanyList with create dialog
- CompanyDetail with edit dialog

### ✅ Deployment Config
- Netlify SPA fallback correctly configured
- Security headers (DENY framing, nosniff, referrer policy)
- Static asset caching with immutable hashes
- index.html set to always revalidate

---

## 3. Issues & Gaps

### 🔴 Critical: Building/Space/Company Mutations Missing Edge Functions

The frontend calls `supabase.from('buildings').insert(...)` directly via PostgREST for building CRUD. Per your architecture spec, **mutations should go through edge functions**. There are no edge functions for:
- `create-building`
- `update-building`
- `delete-building`
- `create-space` / `update-space` / `delete-space`
- `create-company` / `update-company`
- `create-occupant` / `delete-occupant`
- `create-entitlement` / `delete-entitlement`

**Impact:** This works because RLS INSERT/UPDATE/DELETE policies are in place, but it means validation is purely client-side. The upgrade spec mentions edge functions for all mutations, but they don't exist yet. The current approach (direct PostgREST writes) is actually fine for now since RLS enforces authorization, but you lose server-side validation.

### 🟡 Tailwind Configuration is Incomplete

`tailwind.config.js` is a bare skeleton:
```js
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: { extend: {} },
  plugins: [],
};
```

The heavy lifting is done by a **1,151-line custom CSS file** (`src/index.css`). This creates a hybrid situation where:
- shadcn/ui components use Tailwind classes
- Layout (sidebar, header, content area) uses custom CSS classes (`.app-shell`, `.sidebar`, `.content-area`, etc.)
- Some components use Tailwind utilities, others use custom CSS

This isn't broken, but it means Tailwind's design system (colors, spacing, etc.) isn't configured to match the custom tokens, leading to potential inconsistencies.

### 🟡 No Form Validation Library

Forms use manual validation with custom `validateForm()` functions and a `useFormValidation` hook. This works but:
- No Zod or similar schema validation
- No react-hook-form integration
- Validation logic is duplicated between BuildingForm, SpaceForm, etc.
- No match against DB constraints beyond basic field-level checks

### 🟡 Routing Structure Creates Role Silos

The app uses 3 separate route trees:
- `/admin/*` → `proroto_admin`
- `/dashboard/*` → `pm_admin`, `pm_user`
- `/my/*` → `resident`

This means identical components (BuildingList, TicketList) are rendered under different URL prefixes depending on role. Navigation links, back buttons, and relative paths all need to account for this, adding complexity. A unified route tree with role-gating would be simpler.

### 🟡 No Supabase Realtime

Tickets, comments, and status changes don't use Supabase Realtime subscriptions. Users must manually refresh to see updates from other users.

### 🟡 Missing UI Features

- **Users page** (`UsersPage.tsx`, 294 lines) — Lists users but no invite flow from this page
- **Dispatch board** (`DispatchBoard.tsx`, 398 lines) — Exists but limited functionality
- **No toast system integration with mutations** — Toasts exist but aren't consistently used on all CRUD operations
- **No error boundaries** — `ErrorBanner` exists but no React ErrorBoundary wrapper
- **No loading skeletons for Dashboard** — Dashboard uses `<Loading />` spinner instead of skeletons

### 🟢 Minor Issues

- `tailwind.config.js` uses Windows-style `\r\n` line endings (likely from cross-platform dev)
- `.env.local` is included in the zip (should be gitignored — it is in `.gitignore` but was packaged anyway)
- Some components import `type ChangeEvent` explicitly instead of inline `React.ChangeEvent` — consistent but verbose
- `DashboardLayout` title prop is accepted but unused (`_title`)

---

## 4. Component Inventory

### Core Layout
| File | Lines | Purpose | Quality |
|------|-------|---------|---------|
| `DashboardLayout.tsx` | 186 | Sidebar + header shell | ✅ Good |
| `DashboardOverview.tsx` | 425 | Stats cards + charts | ✅ Good |
| `App.tsx` | 50 | Root router | ✅ Clean |

### Buildings (Most Complete CRUD)
| File | Lines | Purpose | Quality |
|------|-------|---------|---------|
| `BuildingList.tsx` | 260 | Card grid + search + company picker | ✅ Good |
| `BuildingForm.tsx` | 390 | Create/Edit with validation | ✅ Good |
| `BuildingDetail.tsx` | 431 | Tabbed detail with spaces/occupants/entitlements | ✅ Good |
| `SpaceForm.tsx` | 226 | Unit/common area form | ✅ Good |
| `OccupantList.tsx` | 241 | List with invite/claim flow | ✅ Good |
| `EntitlementManager.tsx` | 186 | Assign pm_users to buildings | ✅ Good |
| `lib/buildings.ts` | 444 | All building/space/occupant/entitlement data ops | ✅ Thorough |

### Tickets
| File | Lines | Purpose | Quality |
|------|-------|---------|---------|
| `CreateTicketWizard.tsx` | 662 | 6-step wizard | ✅ Excellent |
| `TicketDetail.tsx` | 259 | Full ticket view | ✅ Good |
| `TicketList.tsx` | 131 | List with status filters | ✅ Basic |
| `ActionPanel.tsx` | 247 | Status/severity/assignment updates | ✅ Good |
| `CommentsThread.tsx` | 190 | Comments with internal flag | ✅ Good |
| `AttachmentsList.tsx` | 92 | File list with download | ✅ Basic |
| `StatusTimeline.tsx` | 88 | Audit log timeline | ✅ Good |
| `TicketFilters.tsx` | 50 | Status/severity filter bar | ✅ Basic |
| `StatusBadge.tsx` / `SeverityBadge.tsx` | — | Colored status/severity pills | ✅ Good |

### Admin
| File | Lines | Purpose | Quality |
|------|-------|---------|---------|
| `CompanyList.tsx` | 190 | List + create dialog | ✅ Good |
| `CompanyDetail.tsx` | 252 | Detail + edit dialog | ✅ Good |
| `UsersPage.tsx` | 294 | User list + role management | ⚠️ Read-only |
| `DispatchBoard.tsx` | 398 | Ticket dispatch view | ⚠️ Partial |

### Edge Functions (8 deployed)
| Function | Lines | Purpose |
|----------|-------|---------|
| `create-ticket` | 166 | Create ticket with validation |
| `update-ticket` | 231 | Update status/severity/assignment |
| `create-comment` | 118 | Add comment to ticket |
| `get-ticket-comments` | 140 | Fetch comments with author joins |
| `register-attachment` | 116 | Register uploaded file metadata |
| `send-invitation` | 153 | Email PM invitation |
| `accept-invitation` | 181 | Accept PM invite + create user |
| `claim-resident` | 168 | Resident claims occupant token |

---

## 5. Security Assessment

| Area | Status | Notes |
|------|--------|-------|
| RLS Policies | ✅ | All 4 roles scoped correctly per table |
| Auth | ✅ | Supabase Auth, no service key in frontend |
| Edge Functions | ✅ | Validate JWT, check role, use service role for writes |
| CORS | ✅ | Edge functions have shared CORS handler |
| Input Validation | ⚠️ | Client-side only for building/space/company (no edge functions) |
| XSS | ✅ | React handles escaping; no dangerouslySetInnerHTML |
| CSRF | ✅ | JWT-based auth, no cookies for auth |
| Headers | ✅ | Netlify config sets X-Frame-Options, CSP, etc. |
| Secrets | ⚠️ | `.env.local` included in zip (has real Supabase keys) |

**⚠️ Important:** The `.env.local` file in the zip contains your production Supabase URL and anon key. While the anon key is designed to be public (security comes from RLS), you should still be careful about distributing it. Consider rotating keys if this zip was shared outside trusted channels.

---

## 6. Recommendations (Priority Order)

### P0 — Fix Now
1. **Remove `.env.local` from any shared packages** — It contains your production Supabase credentials
2. **Add React ErrorBoundary** — App currently has no crash protection; a single rendering error takes down the whole app

### P1 — Next Sprint
3. **Decide on mutation strategy** — Either commit to edge functions for all writes (create `create-building`, `update-building`, etc.) OR accept that direct PostgREST + RLS is your pattern and document it. The hybrid approach (edge functions for tickets, PostgREST for buildings) is confusing.
4. **Unify the CSS approach** — Either migrate fully to Tailwind (move the 1,151 CSS lines into Tailwind config + utility classes) OR keep custom CSS but remove Tailwind from the build. The current hybrid works but makes maintenance harder.
5. **Add Supabase Realtime** for ticket updates — Multiple users may be viewing the same ticket.

### P2 — Near-Term
6. **Consolidate routing** — Consider a single route tree with role-gating middleware instead of 3 separate trees (`/admin`, `/dashboard`, `/my`). This simplifies navigation logic significantly.
7. **Add Zod + react-hook-form** — Replace manual validation with schema-based validation that mirrors DB constraints.
8. **Complete the Users page** — Add invite flow directly from the users list.
9. **Add loading skeletons** to Dashboard and Ticket views (currently using spinner).

### P3 — Polish
10. **Tailwind config alignment** — If keeping Tailwind, configure theme tokens to match your custom CSS design system (colors, spacing, shadows).
11. **Accessibility audit** — Add ARIA labels, keyboard navigation, focus management in modals.
12. **Mobile polish** — Sidebar works on mobile but some views (BuildingDetail tabs, DispatchBoard) could be tighter.

---

## 7. Codebase Health Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| **Architecture** | 8/10 | Clean separation, good patterns, minor routing complexity |
| **Type Safety** | 9/10 | Excellent shared types, mirrors Postgres exactly |
| **Auth/Security** | 8/10 | Solid RLS + JWT flow, edge functions for sensitive ops |
| **Code Quality** | 8/10 | Well-commented, consistent style, good error messages |
| **Feature Completeness** | 6/10 | Tickets excellent, buildings good, admin partial |
| **UI/UX Polish** | 6/10 | Functional but hybrid CSS approach, some rough edges |
| **Test Coverage** | 0/10 | No tests found |
| **Documentation** | 7/10 | Good inline comments, UPGRADE.md, deployment docs |

**Overall: 6.5/10** — A solid MVP with excellent foundations that needs feature completion and UI unification to become a polished product.
