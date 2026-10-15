# Work Orders — Pro Roto Inc. Service Portal

Multi-tenant ticket system for plumbing/leak repair. Property management companies, HOAs, and commercial buildings submit work orders exclusively to Pro Roto, Inc.

**Production:** `https://workorders.proroto.com`

---

## Prerequisites

- Node.js v20+
- [Supabase CLI](https://supabase.com/docs/guides/cli/getting-started) v1.200+
- Docker Desktop (required by Supabase CLI for local Postgres)

---

## Quick Start

```bash
git clone <repo-url> work-orders && cd work-orders
npm install

# Start local Supabase
supabase start

# Apply all migrations (schema → RLS → storage → seed → transition trigger)
supabase db reset

# Copy env files and fill in values from `supabase start` output
cp .env.example .env.local
cp supabase/.env.example supabase/.env.local

# Start React dev server
npm run dev

# Start Edge Functions (separate terminal)
npm run functions:serve
```

---

## Verify Migrations

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  -f scripts/verify-migrations.sql
```

All checks should return `PASS`:

| Check | Expected |
|-------|----------|
| Tables | 11 |
| Enums | 8 |
| Indexes | 28 |
| RLS-enabled tables | 11 |
| RLS policies | 41 |
| Triggers | 9 (Section 5: 8 + additive: 1) |
| SECURITY DEFINER functions | 8 (Section 5: 7 + additive: 1) |
| Storage bucket | ticket-attachments (private) |
| Storage policies | 4 |
| Seed company | pro-roto |
| Transition trigger | trg_tickets_enforce_transition |

---

## Bootstrap First Admin

One-time setup after initial deployment:

1. Supabase Studio → Authentication → Add User (email + password)
2. Copy the generated UUID
3. Edit `scripts/bootstrap-first-admin.sql` with real values
4. Run in SQL Editor

---

## Migration Pipeline

All schema changes live in `supabase/migrations/` and are applied in order
(`supabase db push` against production, `supabase db reset` locally).

| Range | What it covers |
|-------|----------------|
| `00001`–`00004` | Base schema, RLS, storage bucket, seed company |
| `00005`–`00025` | Status-transition trigger, comment lockdown, RLS recursion fix, usage/subscriptions, realtime, storage policy rework, notifications (email / in-app / SMS), audit tables, full-text search, company logo, PM transitions, public sharing + column lock, technicians, ticket audit trail, rate limiting |
| `00026` | Captures objects that were created by hand in production (equipment, `spaces.label`, enum values) so a fresh database matches production |
| `00027` | Tenant-boundary hardening: identity-column protection on `users`, ticket delete/column rules, ticket-scoped storage policies, `security_invoker` analytics view, entitlement-aware equipment policies, helper-function guards |

**Rules**

1. Applied migrations are immutable — never edit a file that has reached production. Fix forward with a new file.
2. New migrations may replace earlier policies, triggers and functions freely (`DROP … IF EXISTS` + `CREATE`). The old "LOCKED sections" rule is retired; it produced workarounds instead of fixes.
3. Never change the schema in the dashboard. If it happens, run `supabase db diff` and commit the result before anything else.
4. The database is the authorization layer. Edge functions validate for friendly errors; RLS, grants and triggers enforce.
5. `scripts/verify-migrations.sql` only covers `00001`–`00005`; the verification queries at the end of each later migration file are the current checks.

---

## Project Structure

```
work-orders/
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   │   ├── 00001_section4_schema.sql           🔒
│   │   ├── 00002_section5_security.sql         🔒
│   │   ├── 00003_section6_storage.sql          🔒
│   │   ├── 00004_section7_seed.sql             🔒
│   │   └── 00005_additive_transition_trigger.sql  ✅
│   ├── functions/                   Edge Functions (Deno) — Step 2
│   │   └── .shared/                 Shared code across functions
│   └── .env.example
├── shared/types/
│   ├── index.ts                     Barrel export
│   ├── enums.ts                     8 Postgres enums as TS types
│   ├── database.ts                  Row types for 11 tables
│   ├── transitions.ts               Status transition matrix
│   └── api.ts                       Edge Function contracts
├── src/                             React SPA — Steps 3–7
├── scripts/
│   ├── verify-migrations.sql
│   └── bootstrap-first-admin.sql
├── package.json
├── tsconfig.json
├── vite.config.ts
├── netlify.toml
└── .gitignore
```

---

## Architecture

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite + React Router |
| API (mutations) | Supabase Edge Functions (Deno) |
| API (reads) | Supabase PostgREST (RLS-scoped) |
| Database | PostgreSQL 15 with RLS |
| Auth | Supabase Auth (email/password, magic link) |
| Storage | Private bucket: `ticket-attachments` |
| Hosting | Netlify (`workorders.proroto.com`) |

### Critical Design Decisions

1. **`ticket_comments` reads go through Edge Function only** — RLS (locked) does not filter `is_internal`. Edge Function filters internal comments for non-proroto roles.

2. **Status transitions enforced at DB level** — `trg_tickets_enforce_transition` (migration 00005) rejects invalid transitions even if PostgREST is called directly. Edge Functions validate first for friendly errors.

3. **Two-step attachment upload** — Client uploads binary to Storage, then calls `register-attachment` Edge Function to create the metadata row.

### Roles

| Role | Scope | Ticket Transitions |
|------|-------|-------------------|
| `proroto_admin` | All companies | Full lifecycle |
| `pm_admin` | Own company | Cancel (early stages), approve/decline (waiting_approval) |
| `pm_user` | Entitled buildings | Same as pm_admin |
| `resident` | Own space | None (create + comment only) |

---

## Commands

```bash
supabase start                 # Start local Supabase
supabase db reset              # Drop + reapply all migrations
supabase functions serve       # Run Edge Functions locally
npm run dev                    # React dev server (port 5173)
npm run build                  # Production build
npm run typecheck              # TypeScript check
supabase stop                  # Stop local Supabase
```

---

## License

Proprietary — Pro Roto, Inc.
