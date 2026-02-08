# PlumbTix — Step-by-Step Deployment Guide

## Overview

```
┌─────────────────┐         ┌──────────────────────────────────┐
│   Netlify CDN   │         │      Supabase Cloud              │
│                 │         │                                  │
│  Static SPA     │  HTTPS  │  ┌─────────────┐  ┌──────────┐  │
│  (React/Vite)   │ ──────▶ │  │ PostgREST   │  │ Auth     │  │
│                 │         │  │ (REST API)  │  │ (JWT)    │  │
│  dist/          │         │  └─────────────┘  └──────────┘  │
│  index.html     │         │  ┌─────────────┐  ┌──────────┐  │
│  assets/        │         │  │ Edge Funcs  │  │ Storage  │  │
└─────────────────┘         │  │ (8 funcs)   │  │ (bucket) │  │
                            │  └─────────────┘  └──────────┘  │
    workorders.             │  ┌─────────────────────────────┐ │
    proroto.com             │  │ PostgreSQL + RLS + Triggers  │ │
                            │  └─────────────────────────────┘ │
                            └──────────────────────────────────┘
```

---

## Phase 1: Supabase Project

### Step 1.1 — Create Supabase Project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Click **New Project**
3. Settings:
   - **Name:** `plumbtix`
   - **Database Password:** generate a strong password (save it — you'll need it)
   - **Region:** `us-west-1` (closest to Bay Area)
   - **Plan:** Free tier is fine to start; Pro for production
4. Wait for project to provision (~2 minutes)

### Step 1.2 — Collect Project Credentials

After project is ready, go to **Settings → API**:

```bash
# Save these — you'll need them throughout
PROJECT_REF="your-project-ref"          # e.g. abcdefghijklmnop
SUPABASE_URL="https://${PROJECT_REF}.supabase.co"
ANON_KEY="eyJhbGciOiJIUzI1NiIs..."      # anon / public key
SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIs..." # service_role key (keep secret!)
```

**Where to find these:**
- **Project URL** → Settings → API → Project URL
- **Anon Key** → Settings → API → Project API keys → `anon` `public`
- **Service Role Key** → Settings → API → Project API keys → `service_role` `secret`

### Step 1.3 — Install Supabase CLI

```bash
# macOS
brew install supabase/tap/supabase

# Or via npm (any OS)
npm install -g supabase

# Verify
supabase --version
```

### Step 1.4 — Link Local Project to Cloud

```bash
cd /path/to/plumbtix

# Login to Supabase
supabase login

# Link to your cloud project
supabase link --project-ref $PROJECT_REF
# Enter your database password when prompted
```

---

## Phase 2: Database Migrations

### Step 2.1 — Apply All Migrations

```bash
# Push all 6 migrations to production
supabase db push
```

This applies in order:
1. `00001_section4_schema.sql` — tables, types, indexes, constraints
2. `00002_section5_security.sql` — RLS policies, triggers, helper functions
3. `00003_section6_storage.sql` — `ticket-attachments` storage bucket + policies
4. `00004_section7_seed.sql` — Pro Roto company seed
5. `00005_additive_transition_trigger.sql` — status transition enforcement
6. `00006_revoke_ticket_comments_postgrest.sql` — REVOKE on ticket_comments

### Step 2.2 — Verify Migrations

Go to **Supabase Dashboard → SQL Editor** and run:

```sql
-- Tables exist (11 expected)
SELECT COUNT(*) FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'companies','users','buildings','spaces','occupants',
    'building_entitlements','invitations','tickets',
    'ticket_attachments','ticket_comments','ticket_status_log'
  );
-- Expected: 11

-- RLS policies (41 expected)
SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public';
-- Expected: 41

-- Triggers (9 expected: Section 5's 8 + migration 00005's 1)
SELECT COUNT(*) FROM pg_trigger
  WHERE tgrelid IN (
    SELECT oid FROM pg_class WHERE relnamespace = 'public'::regnamespace
  ) AND NOT tgisinternal;
-- Expected: 9

-- ticket_comments locked from PostgREST
SELECT has_table_privilege('authenticated', 'public.ticket_comments', 'SELECT');
-- Expected: false

-- Storage bucket exists
SELECT id, public, file_size_limit FROM storage.buckets
WHERE id = 'ticket-attachments';
-- Expected: 1 row, public=false, file_size_limit=10485760

-- Pro Roto seed company exists
SELECT id, name, slug FROM public.companies WHERE slug = 'pro-roto';
-- Expected: 1 row, id = '00000000-0000-0000-0000-000000000001'
```

**All 6 queries must pass before continuing.**

---

## Phase 3: Edge Functions

### Step 3.1 — Deploy All Edge Functions

```bash
# Deploy all 8 functions at once
supabase functions deploy accept-invitation
supabase functions deploy claim-resident
supabase functions deploy create-comment
supabase functions deploy create-ticket
supabase functions deploy get-ticket-comments
supabase functions deploy register-attachment
supabase functions deploy send-invitation
supabase functions deploy update-ticket
```

Or deploy all in a loop:

```bash
for fn in accept-invitation claim-resident create-comment create-ticket \
          get-ticket-comments register-attachment send-invitation update-ticket; do
  echo "Deploying $fn..."
  supabase functions deploy "$fn" --no-verify-jwt
  echo ""
done
```

> **Note:** `--no-verify-jwt` tells Supabase not to enforce JWT at the gateway level. The functions handle their own JWT verification internally via `getAuthenticatedUserId()`. Some functions (accept-invitation, claim-resident) use token-based auth without a JWT, so gateway-level enforcement would block them.

### Step 3.2 — Verify Edge Functions

```bash
# List deployed functions
supabase functions list
```

You should see all 8 functions with status `Active`.

Quick smoke test (should return 401 — no JWT provided):

```bash
curl -s -w "\nHTTP %{http_code}\n" \
  -X POST "$SUPABASE_URL/functions/v1/create-ticket" \
  -H "Authorization: Bearer invalid"
# Expected: 401 Unauthorized
```

---

## Phase 4: Create Admin User

The seed data creates the Pro Roto company but NOT any auth users. You need to create the first admin manually.

### Step 4.1 — Create Auth User

**Option A — Supabase Dashboard (recommended):**

1. Go to **Authentication → Users → Add User → Create New User**
2. Enter:
   - **Email:** `admin@proroto.com` (or your email)
   - **Password:** strong password
   - **Auto Confirm User:** ✅ checked
3. Copy the generated **User UID** (you'll need it for the next step)

**Option B — CLI:**

```bash
# Via SQL Editor in Supabase Dashboard
-- This only creates the auth user. You still need the public.users INSERT below.
```

### Step 4.2 — Create Public User Record

Go to **SQL Editor** and run (replace `<USER_UID>` with the UUID from Step 4.1):

```sql
INSERT INTO public.users (id, email, full_name, role, company_id)
VALUES (
  '<USER_UID>',                              -- from auth.users
  'admin@proroto.com',                        -- must match auth email
  'Marco',                                    -- your name
  'proroto_admin',                            -- admin role
  '00000000-0000-0000-0000-000000000001'      -- Pro Roto company (from seed)
);
```

### Step 4.3 — Verify Admin Access

```sql
-- Confirm the user record exists and has correct role
SELECT id, email, full_name, role, company_id
FROM public.users
WHERE email = 'admin@proroto.com';
-- Expected: 1 row, role = 'proroto_admin'
```

---

## Phase 5: Supabase Auth Configuration

### Step 5.1 — Configure Auth Settings

Go to **Authentication → URL Configuration**:

| Setting | Value |
|---------|-------|
| **Site URL** | `https://workorders.proroto.com` |
| **Redirect URLs** | `https://workorders.proroto.com/**` |

> If testing before domain is live, temporarily add `http://localhost:5173/**` and your Netlify preview URL.

### Step 5.2 — Email Templates (Optional)

Go to **Authentication → Email Templates** and customize:
- **Confirm signup** — not currently used (email confirmations disabled)
- **Reset password** — update if you plan to offer password reset
- **Invite user** — not used (PlumbTix has its own invitation system via Edge Functions)

### Step 5.3 — Disable Unused Auth Providers

Go to **Authentication → Providers** and ensure only **Email** is enabled (Google, GitHub, etc. should be disabled unless you plan to use them).

---

## Phase 6: Git Repository + Netlify

### Step 6.1 — Push to Git

```bash
cd /path/to/plumbtix

# Initialize if not already
git init
git add .
git commit -m "PlumbTix v1.0 — Steps 0-7 complete"

# Push to GitHub (create repo first at github.com)
git remote add origin https://github.com/YOUR_ORG/plumbtix.git
git branch -M main
git push -u origin main
```

### Step 6.2 — Create Netlify Site

**Option A — Netlify Dashboard (recommended):**

1. Go to [app.netlify.com](https://app.netlify.com)
2. Click **Add new site → Import an existing project**
3. Connect to GitHub → select `plumbtix` repo
4. Build settings (auto-detected from `netlify.toml`):
   - **Build command:** `npm ci && npm run build`
   - **Publish directory:** `dist`
5. Click **Deploy site**

**Option B — Netlify CLI:**

```bash
# Install
npm install -g netlify-cli

# Login
netlify login

# Initialize (in project root)
netlify init
# Select: "Create & configure a new site"
# Team: your team
# Site name: plumbtix (or auto-generate)
```

### Step 6.3 — Set Environment Variables

In **Netlify → Site settings → Environment variables**, add:

| Key | Value |
|-----|-------|
| `VITE_SUPABASE_URL` | `https://<PROJECT_REF>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIs...` (anon key) |
| `VITE_EDGE_BASE_URL` | `https://<PROJECT_REF>.supabase.co` |
| `NODE_VERSION` | `20` |

> **NEVER add `SERVICE_ROLE_KEY` to Netlify.** It stays in Supabase only.

Or via CLI:

```bash
netlify env:set VITE_SUPABASE_URL "https://<ref>.supabase.co"
netlify env:set VITE_SUPABASE_ANON_KEY "eyJ..."
netlify env:set VITE_EDGE_BASE_URL "https://<ref>.supabase.co"
netlify env:set NODE_VERSION "20"
```

### Step 6.4 — Trigger Redeploy

After setting env vars, trigger a new deploy (env vars are build-time for Vite):

```bash
netlify deploy --build --prod
```

Or in the dashboard: **Deploys → Trigger deploy → Deploy site**.

---

## Phase 7: Custom Domain

### Step 7.1 — Add Domain in Netlify

1. Go to **Domain management → Add custom domain**
2. Enter: `workorders.proroto.com`
3. Netlify will show the required DNS record

### Step 7.2 — Create DNS Record

At your DNS provider (Cloudflare, GoDaddy, Namecheap, etc.):

```
Type:   CNAME
Name:   workorders
Target: <your-site-name>.netlify.app
TTL:    Auto
```

If using **Cloudflare**: set proxy status to **DNS only** (gray cloud). Netlify manages its own TLS.

### Step 7.3 — Wait for SSL

Netlify auto-provisions a Let's Encrypt certificate after DNS propagates (usually 1–10 minutes, can take up to 24 hours for propagation).

Check status: **Domain management → HTTPS** → should show "Your site has HTTPS enabled."

### Step 7.4 — Force HTTPS

In **Domain management → HTTPS**: enable **Force HTTPS** (redirects HTTP to HTTPS automatically).

---

## Phase 8: Verification

### Step 8.1 — Basic Load Test

```bash
# Site loads
curl -s -o /dev/null -w "HTTP %{http_code}" https://workorders.proroto.com
# Expected: 200

# SPA routing works (any path returns index.html)
curl -s -o /dev/null -w "HTTP %{http_code}" https://workorders.proroto.com/admin/dispatch
# Expected: 200

# Security headers present
curl -sI https://workorders.proroto.com | grep -E "X-Frame|X-Content|Referrer"
# Expected: DENY, nosniff, strict-origin-when-cross-origin
```

### Step 8.2 — Login Test

1. Open `https://workorders.proroto.com`
2. Should redirect to `/login`
3. Enter admin email + password from Phase 4
4. Should redirect to `/admin`
5. All 5 tabs visible: Tickets, Buildings, Companies, Users, Dispatch

### Step 8.3 — Edge Function Connectivity

1. Go to **Users** tab → click **+ Invite User**
2. Fill in: Company = Pro Roto, Name = Test, Email = test@test.com, Role = PM Admin
3. Click **Send Invitation**
4. If green success box appears → Edge Functions are working
5. If error → check:
   - Is `VITE_EDGE_BASE_URL` set correctly?
   - Are Edge Functions deployed? (`supabase functions list`)
   - Check Supabase **Logs → Edge Functions** for errors

### Step 8.4 — Storage Connectivity

1. Create a ticket with a photo attachment
2. If upload succeeds → Storage bucket + policies are working
3. If fails → check:
   - Storage bucket exists: `SELECT * FROM storage.buckets`
   - Storage policies exist: `SELECT * FROM storage.policies WHERE bucket_id = 'ticket-attachments'`

### Step 8.5 — Full Workflow Smoke Test

| Step | Action | Pass? |
|------|--------|-------|
| 1 | Login as admin | ☐ |
| 2 | Companies tab → see Pro Roto | ☐ |
| 3 | Users tab → send invitation | ☐ |
| 4 | Buildings tab → create building | ☐ |
| 5 | Tickets tab → create ticket with attachment | ☐ |
| 6 | Dispatch tab → move ticket New → Scheduled | ☐ |
| 7 | Click ticket → view detail, add comment | ☐ |
| 8 | Status timeline shows all transitions | ☐ |

---

## Troubleshooting

### "Missing VITE_SUPABASE_URL" error on site load

Environment variables not set in Netlify, or deploy wasn't triggered after setting them. Redeploy.

### CORS errors in browser console

Edge Functions include CORS headers via `_shared/cors.ts`. If you see CORS errors:
- Verify `VITE_EDGE_BASE_URL` matches the actual Supabase URL exactly
- Check that Edge Functions are deployed and active

### 404 on direct URL navigation

The SPA redirect in `netlify.toml` should handle this. If not:
- Verify `netlify.toml` is in the project root
- Verify the `[[redirects]]` block exists with `status = 200`
- Check Netlify deploy logs for redirect rules

### "permission denied for table ticket_comments"

This is **correct behavior**. Migration 00006 revokes PostgREST access. Comments must go through Edge Functions (`get-ticket-comments`, `create-comment`).

### Edge Function returns 500

Check **Supabase Dashboard → Logs → Edge Functions**. Common issues:
- Missing environment variables (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY) — these are auto-set for deployed Edge Functions
- Import errors from `esm.sh` — check Deno compatibility

### Build fails on Netlify

```bash
# Test locally first
npm ci && npm run build
```

Common issues:
- TypeScript errors: `npm run typecheck`
- Node version: ensure `NODE_VERSION=20` is set in Netlify env
- Missing dependencies: check `package-lock.json` is committed
