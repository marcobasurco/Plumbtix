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
| `00028` | Only Pro Roto dispatches: technician/scheduling columns `proroto_admin`-only; PM transitions reduced to information triage (approvals by phone) |
| `00029` | "Somewhere else" location: `tickets.location_note` + an "Other / not listed" catch-all space per building (trigger + backfill) |
| `00030` | Emergency acknowledgement + on-call escalation: `on_call_roster`, `ticket_escalation_log`, acknowledgement/escalation columns and triggers on `tickets`, pg_cron job calling `escalate-emergencies` every minute (URL + secret from Vault) |
| `00031` | Phone standard: `normalize_phone()`, cleanup to E.164 with `phone_cleanup_log`, normalizing triggers + CHECK constraints on every phone column |

**Phone numbers** are stored as E.164 (`+16505551234`) everywhere and shown as
`(650) 555-1234`. Use `normalizePhone` / `formatPhone` / `telHref` from
`shared/phone.ts` (browser) or `_shared/phone.ts` (edge) and the `PhoneInput`
component; never write a phone column from raw text.

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
| `proroto_admin` | All companies | Full lifecycle; only role that schedules, assigns technicians, cancels, records quote approvals (taken by phone), and sets quote/invoice |
| `pm_admin` | Own company | `new → needs_info`, `needs_info → new` only. No scheduling, assignment, approval or cancel — only Pro Roto dispatches (migration 00028). Invites Admins/Staff and sets Staff building access from the Team page |
| `pm_user` | Entitled buildings | `needs_info → new` ("I've added the info") only |
| `resident` | Own space | None (create + comment only) |

---

## Auth Emails (password reset, email change)

Supabase's built-in mailer allows only a few emails per hour per project. Auth
emails therefore go through **Resend** — the same sender as the app's own
notifications — configured in `supabase/config.toml` under `[auth.email.smtp]`
with branded templates in `supabase/templates/`.

Push it to production (needs `RESEND_API_KEY` in the shell):

```powershell
$env:RESEND_API_KEY = "re_xxxxxxxxx"
npx supabase@latest config push
```

Or set the same values by hand: Dashboard → Authentication → Emails → **SMTP
Settings** (host `smtp.resend.com`, port `465`, user `resend`, password = the
Resend API key, sender `notifications@proroto.com` / "Pro Roto Work Orders"),
and paste each template from `supabase/templates/` under **Email Templates**.

Test: Login → "Forgot password?" → the email arrives from
`notifications@proroto.com` within seconds and the link opens `/reset-password`.
Resend → Logs shows it as `auth` traffic alongside the app's emails.

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
