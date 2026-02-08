# PlumbTix — Pro Roto Work Orders Portal

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
git clone <repo-url> plumbtix && cd plumbtix
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

| File | Source | Status |
|------|--------|--------|
| `00001_section4_schema.sql` | Section 4 | 🔒 LOCKED |
| `00002_section5_security.sql` | Section 5 | 🔒 LOCKED |
| `00003_section6_storage.sql` | Section 6 | 🔒 LOCKED |
| `00004_section7_seed.sql` | Section 7 | 🔒 LOCKED |
| `00005_additive_transition_trigger.sql` | New | ✅ ADDITIVE |

**Rules:** Never modify 00001–00004. New migrations are numbered 00006+, additive only.

---

## Project Structure

```
plumbtix/
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
