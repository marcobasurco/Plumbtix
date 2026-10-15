# PlumbTix — project guide for Claude Code

Multi-tenant work-order portal for Pro Roto, Inc. (California C-36 plumbing contractor).
Property management companies, HOAs, and healthcare facilities submit plumbing tickets;
Pro Roto dispatches technicians. Production: https://workorders.proroto.com.
First enterprise customer being onboarded: Stanford Health Care (~150 California properties).

## Stack

- Frontend: React 19 + Vite + TypeScript + Tailwind/shadcn, deployed by Netlify from `main`.
- Backend: Supabase — Postgres 15 with RLS, Storage, Auth, 26 Deno edge functions in `supabase/functions/`.
- Shared types in `shared/types/` (hand-maintained; mirror the schema exactly).
- Supabase project ref: `cqrzgwqarziggggujiha` (Pro plan). Netlify site: lively-muffin-a6ceea.

## Commands

```
npm run dev            # Vite dev server (needs .env.local — see .env.example)
npm run typecheck      # tsc --noEmit
npm run lint           # eslint src/ shared/
npm test               # vitest
npm run build          # tsc -b && vite build
supabase migration list                    # local vs remote migration history
supabase db push                           # apply new migrations to production
supabase functions deploy --no-verify-jwt  # deploy all edge functions
```

CI (`.github/workflows/ci.yml`) runs lint, typecheck, tests and build on every PR. Edge functions auto-deploy from `main` when `supabase/functions/**` or `config.toml` change. Migrations are applied manually with `supabase db push` from a developer machine (Docker not required).

## Roles

`proroto_admin` (platform owner, all companies) · `pm_admin` (full access within own company) · `pm_user` (read buildings only where entitled via `building_entitlements`; full ticket rights there) · `resident` (own space only; no status transitions). Residents/occupants are an HOA concept — healthcare customers use the PM roles only.

## Security invariants — do not weaken

The database is the authorization layer. Edge functions validate first for friendly errors; RLS, grants and triggers are what actually enforce. Anything an edge function forbids must also be impossible through PostgREST or the Storage API.

1. `users.role`, `company_id`, `email`, `id` cannot change from an end-user session (`trg_protect_user_identity`, 00027). `pm_admin` may move *other* staff between `pm_admin`/`pm_user` in their own company only. `INSERT`/`DELETE` on `users` are revoked from `authenticated`; accounts are created only by `accept-invitation` / `claim-resident` (service role).
2. Tickets: `DELETE` revoked from `authenticated`. `trg_protect_ticket_columns` mirrors `update-ticket`: `quote_amount`/`invoice_number` are Pro Roto-only; technician/scheduling fields are `proroto_admin`/`pm_admin` only; identity fields immutable. `ticket_audit_log` is `ON DELETE RESTRICT` — history is never cascaded away.
3. Storage `ticket-attachments`: a file is accessible exactly when its ticket is visible to the caller (policies `ticket_files_*` use `EXISTS (SELECT 1 FROM public.tickets WHERE id::text = split_part(name,'/',2))`, evaluated under the caller's own RLS). Path convention `tickets/{ticket_id}/{filename}`. Never widen these to `bucket_id = ...` alone.
4. `ticket_comments` has all PostgREST privileges revoked (00006); reads/writes go through `get-ticket-comments` / `create-comment`, which filter `is_internal`.
5. Public sharing columns (`public_token`, `public_enabled`) are writable only via `toggle-public-sharing` (service role; trigger 00022).
6. Views must be `security_invoker = true` and revoked from `anon` (`v_company_analytics`).
7. Status transitions: the matrix lives in THREE places that must stay identical — `enforce_ticket_status_transition()` (latest version in migration 00020), `TRANSITION_MATRIX` in `supabase/functions/update-ticket/index.ts`, and `shared/types/transitions.ts`. Product decision (Oct 2026): PMs may NOT cancel tickets; only Pro Roto cancels.
8. Password policy (12+ chars, upper/lower/digit/symbol) is set in the Supabase dashboard and mirrored in `supabase/functions/_shared/validation.ts` (`PasswordSchema`), `src/lib/password.ts`, and `supabase/config.toml`. Change all four together.
9. Public self-signup is OFF in the dashboard and in `config.toml`. Do not re-enable.
10. Email templates (`_shared/email-templates.ts`) HTML-escape every user-controlled value. Keep using `esc()` / `escMultiline()`.
11. Notification work after a response goes through `runInBackground()` (`_shared/background.ts`, `EdgeRuntime.waitUntil`). Never leave an un-awaited promise for email/SMS.

## Migrations

- Files in `supabase/migrations/`, numbered `000NN_description.sql`. Next number: 00028.
- Applied migrations are immutable. Fix forward with a new file. New migrations may `DROP POLICY IF EXISTS` / `CREATE POLICY` to replace earlier policies — the old "LOCKED sections" rule is retired.
- Never change the schema in the Supabase dashboard. If it happens, run `supabase db diff` and commit the result before any other work.
- Write migrations idempotently (`IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP ... IF EXISTS`). End each with commented verification queries.
- Every SECURITY DEFINER function sets `search_path`. Helper functions used in policies (`get_user_role`, `get_user_company_id`, `is_pm_admin`, `is_proroto_admin`, `has_building_entitlement`, `get_company_building_ids`, `get_resident_space_ids`, `get_resident_building_ids`) are the way to avoid RLS recursion — use them instead of subqueries on `buildings`/`spaces`.
- Changing any table also means updating `shared/types/database.ts` and, if an enum, `shared/types/enums.ts`.

## Edge function conventions

- Validate input with zod (`_shared/validation.ts`), use `createUserClient(req)` so RLS applies; use `createServiceClient()` only where a comment explains why (onboarding flows, `ticket_comments`, public ticket, sharing toggle).
- Return through `_shared/response.ts` (`ok`, `err`, `unauthorized`, `forbidden`, `notFound`, `serverError`). Never leak internal error text.
- Each function handles its own JWT; all deploy with `--no-verify-jwt`. Adding a function: create the folder, add `[functions.<name>]` in `config.toml` only if it needs `verify_jwt = false` semantics documented there, and remove the config entry when deleting a function (a stale entry breaks every deploy).
- Pin remote imports to exact versions.

## Frontend conventions

- Direct PostgREST writes are sanctioned exceptions only: `equipment` CRUD, notification `read_at`, self-profile updates (phone, SMS flag), and the Import page's `users`/`occupants` updates. Everything else goes through an edge function via `src/lib/api.ts`.
- Three route trees: `/admin/*` (proroto_admin), `/dashboard/*` (pm roles), `/my/*` (resident). Guard with `RoleGate`.
- The `notifications` table uses `read_at` (timestamp), not a boolean.

## Deploying a change

1. Branch from `main`, open a PR; CI must be green.
2. Merge. Netlify and the function workflow deploy automatically.
3. If the PR contains migrations: `supabase migration list` then `supabase db push`.
4. Verify with the queries at the end of the migration file and a quick app walk-through (login → Settings save → ticket with photo → PDF).

## Roadmap context (Oct 2026)

Phase 1: Auth SMTP via Resend (password resets), tenant-isolation (RLS) test suite in CI, staging Supabase project, MFA/SSO scoping with Stanford IT, CORS allowlist, rate-limiter client IP.
Phase 2 (healthcare fit): facility model (floor/wing/room, facility type, department, cost center, access/ICRA flags), SLA acknowledgment + escalation, PO/NTE/approval records, technician mobile role, per-site reporting.
Full assessment: see the "production-readiness-assessment" doc in the ProRoto ticket system Project on claude.ai.

## Claude Code setup in this repo

- `.claude/settings.json` — permissions (safe git/npm/supabase reads pre-approved; `.env*` unreadable), hooks, stable update channel.
- `.claude/hooks/` — `guard-bash.mjs` blocks destructive shell/SQL commands; `guard-edits.mjs` blocks edits to applied migrations and secrets; `lint-file.mjs` runs ESLint --fix after each TypeScript edit.
- `.claude/agents/` — `security-reviewer`, `code-reviewer`, `migration-author` subagents.
- `.claude/skills/` — slash commands `/new-migration`, `/deploy`, `/security-review`, `/new-edge-function`, `/check-matrix`.
- `.mcp.json` — Supabase MCP server (hosted, OAuth), scoped to this project and read-only: use it to inspect production schema, policies and logs; never to change data. Authenticate once with `/mcp` → supabase → Authenticate.
