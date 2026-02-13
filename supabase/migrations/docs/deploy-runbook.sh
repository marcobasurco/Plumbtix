# PlumbTix — Deployment Runbook
# Run these commands from your local machine in the plumbtix project root.
# Each phase has a CHECKPOINT — do not proceed until it passes.

# ═══════════════════════════════════════════════════════════════════════════
# PHASE 1: SUPABASE CLOUD PROJECT
# ═══════════════════════════════════════════════════════════════════════════

# 1a. Go to https://supabase.com/dashboard → New Project
#     Name:     plumbtix
#     Password: <generate and SAVE this>
#     Region:   West US (closest to Bay Area)
#     Wait for project to finish provisioning (~2 min)

# 1b. Collect credentials from Settings → API
#     Fill in YOUR values below:

export PROJECT_REF="XXXXXXXXXXXXXXXX"                   # from project URL
export DB_PASSWORD="XXXXXXXXXXXXXXXX"                    # the one you saved
export SUPABASE_URL="https://${PROJECT_REF}.supabase.co"
export ANON_KEY="eyJhbG..."                              # Settings → API → anon public
export SERVICE_ROLE_KEY="eyJhbG..."                      # Settings → API → service_role secret

# 1c. Install CLI (skip if already installed)
brew install supabase/tap/supabase     # macOS
# npm install -g supabase              # alternative

# 1d. Login and link
supabase login
supabase link --project-ref $PROJECT_REF
# Enter DB_PASSWORD when prompted

# ── CHECKPOINT 1 ──
supabase projects list | grep $PROJECT_REF
# Should show your project. If not, re-run supabase link.


# ═══════════════════════════════════════════════════════════════════════════
# PHASE 2: DATABASE MIGRATIONS
# ═══════════════════════════════════════════════════════════════════════════

# 2a. Push all 6 migrations
supabase db push

# This applies:
#   00001 → Schema (tables, types, indexes)
#   00002 → Security (RLS, triggers, functions)
#   00003 → Storage bucket + policies
#   00004 → Seed (Pro Roto company)
#   00005 → Transition enforcement trigger
#   00006 → REVOKE ticket_comments from PostgREST

# ── CHECKPOINT 2 ──
# Go to Supabase Dashboard → SQL Editor → New Query → paste and run:

# SELECT COUNT(*) AS tables FROM pg_tables
#   WHERE schemaname = 'public'
#     AND tablename IN (
#       'companies','users','buildings','spaces','occupants',
#       'building_entitlements','invitations','tickets',
#       'ticket_attachments','ticket_comments','ticket_status_log');
# -- Must return: 11
#
# SELECT COUNT(*) AS policies FROM pg_policies WHERE schemaname = 'public';
# -- Must return: 41
#
# SELECT COUNT(*) AS triggers FROM pg_trigger
#   WHERE tgrelid IN (
#     SELECT oid FROM pg_class WHERE relnamespace = 'public'::regnamespace
#   ) AND NOT tgisinternal;
# -- Must return: 9
#
# SELECT has_table_privilege('authenticated', 'public.ticket_comments', 'SELECT');
# -- Must return: false
#
# SELECT id FROM storage.buckets WHERE id = 'ticket-attachments';
# -- Must return: 1 row
#
# SELECT name FROM public.companies WHERE slug = 'pro-roto';
# -- Must return: Pro Roto, Inc

# ALL 6 must pass. If any fail, check supabase db push output for errors.


# ═══════════════════════════════════════════════════════════════════════════
# PHASE 3: EDGE FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════

# 3a. Deploy all 8 functions
#     --no-verify-jwt is required because accept-invitation and claim-resident
#     use token-based auth (no JWT). Functions handle their own auth internally.

for fn in accept-invitation claim-resident create-comment create-ticket \
          get-ticket-comments register-attachment send-invitation update-ticket; do
  echo "── Deploying: $fn ──"
  supabase functions deploy "$fn" --no-verify-jwt
done

# ── CHECKPOINT 3 ──
supabase functions list
# All 8 should show status Active.
#
# Smoke test (should return 401 — no valid JWT):
curl -s -w "\nHTTP %{http_code}\n" \
  "$SUPABASE_URL/functions/v1/create-ticket" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer invalid" \
  -H "Content-Type: application/json" \
  -d '{}'
# Expected: {"ok":false,"error":...} with HTTP 401


# ═══════════════════════════════════════════════════════════════════════════
# PHASE 4: CREATE ADMIN USER
# ═══════════════════════════════════════════════════════════════════════════

# Seed only creates the Pro Roto company, NOT any auth users.
# You need to create the first proroto_admin manually.

# 4a. Go to Supabase Dashboard → Authentication → Users → Add User
#     Email:    admin@proroto.com  (or your actual email)
#     Password: <strong password>
#     Auto Confirm User: ✅ ON
#
#     COPY THE USER UID from the table — you need it below.

# 4b. Create the public.users record
#     Go to SQL Editor → New Query → paste (replace <USER_UID>):

# INSERT INTO public.users (id, email, full_name, role, company_id)
# VALUES (
#   '<USER_UID>',
#   'admin@proroto.com',
#   'Marco',
#   'proroto_admin',
#   '00000000-0000-0000-0000-000000000001'
# );

# ── CHECKPOINT 4 ──
# SELECT id, email, role, company_id FROM public.users
#   WHERE email = 'admin@proroto.com';
# Must return: 1 row, role = proroto_admin, company_id = 00000000-…-000000000001


# ═══════════════════════════════════════════════════════════════════════════
# PHASE 5: SUPABASE AUTH SETTINGS
# ═══════════════════════════════════════════════════════════════════════════

# 5a. Go to Authentication → URL Configuration:
#     Site URL:       https://workorders.proroto.com
#     Redirect URLs:  https://workorders.proroto.com/**
#
# 5b. (Temporary) If testing before DNS is ready, ALSO add:
#     http://localhost:5173/**
#     https://<your-netlify-subdomain>.netlify.app/**

# 5c. Authentication → Providers → ensure only Email is enabled.

# ── CHECKPOINT 5 ──
# Site URL shows https://workorders.proroto.com in the dashboard. ✓


# ═══════════════════════════════════════════════════════════════════════════
# PHASE 6: GIT + NETLIFY
# ═══════════════════════════════════════════════════════════════════════════

# 6a. Push to GitHub (if not already)
git init
git add .
git commit -m "PlumbTix v1.0 — Steps 0-7"
git remote add origin https://github.com/YOUR_ORG/plumbtix.git
git branch -M main
git push -u origin main

# 6b. Create Netlify site
#     Option A — Dashboard (easiest):
#       https://app.netlify.com → Add new site → Import existing project
#       Connect GitHub → select plumbtix repo
#       Build settings auto-detected from netlify.toml:
#         Build command:    npm ci && npm run build
#         Publish dir:      dist
#       Click Deploy site
#
#     Option B — CLI:
npm install -g netlify-cli
netlify login
netlify init      # "Create & configure a new site"

# 6c. Set environment variables
#
#     ┌──────────────────────────┬────────────────────────────────────────────┐
#     │ Key                      │ Value                                      │
#     ├──────────────────────────┼────────────────────────────────────────────┤
#     │ VITE_SUPABASE_URL        │ https://<PROJECT_REF>.supabase.co          │
#     │ VITE_SUPABASE_ANON_KEY   │ eyJhbG... (anon public key)               │
#     │ VITE_EDGE_BASE_URL       │ https://<PROJECT_REF>.supabase.co/functions/v1 │
#     │ NODE_VERSION             │ 20                                         │
#     └──────────────────────────┴────────────────────────────────────────────┘
#
#     ⚠️  CRITICAL: VITE_EDGE_BASE_URL must include /functions/v1 at the end.
#         The frontend appends /<function-name> to this base URL.
#         Example: https://abcdef.supabase.co/functions/v1/create-ticket
#
#     ⚠️  NEVER add SERVICE_ROLE_KEY to Netlify. It stays on Supabase only.

#     Via Dashboard:  Site settings → Environment variables → Add
#     Via CLI:
netlify env:set VITE_SUPABASE_URL "https://${PROJECT_REF}.supabase.co"
netlify env:set VITE_SUPABASE_ANON_KEY "$ANON_KEY"
netlify env:set VITE_EDGE_BASE_URL "https://${PROJECT_REF}.supabase.co/functions/v1"
netlify env:set NODE_VERSION "20"

# 6d. Redeploy (env vars are baked in at build time by Vite)
netlify deploy --build --prod

# ── CHECKPOINT 6 ──
# Site loads at https://<site>.netlify.app
curl -s -o /dev/null -w "HTTP %{http_code}" https://<site>.netlify.app
# Expected: 200

# SPA routing works
curl -s -o /dev/null -w "HTTP %{http_code}" https://<site>.netlify.app/admin/dispatch
# Expected: 200 (not 404)

# Security headers present
curl -sI https://<site>.netlify.app | grep -i "x-frame\|x-content-type"
# Expected: DENY, nosniff


# ═══════════════════════════════════════════════════════════════════════════
# PHASE 7: CUSTOM DOMAIN
# ═══════════════════════════════════════════════════════════════════════════

# 7a. Netlify → Domain management → Add custom domain
#     Enter: workorders.proroto.com

# 7b. DNS record (at your registrar / Cloudflare / wherever proroto.com DNS lives):
#
#     Type:   CNAME
#     Name:   workorders
#     Target: <site>.netlify.app
#     TTL:    Auto
#
#     If using Cloudflare: set proxy to "DNS only" (gray cloud).
#     Netlify handles its own TLS.

# 7c. Wait for SSL (1–10 min usually)
#     Netlify → Domain management → HTTPS
#     Should say "Your site has HTTPS enabled"

# 7d. Enable Force HTTPS in that same HTTPS section.

# ── CHECKPOINT 7 ──
curl -s -o /dev/null -w "HTTP %{http_code}" https://workorders.proroto.com
# Expected: 200
curl -s -o /dev/null -w "HTTP %{http_code}" https://workorders.proroto.com/login
# Expected: 200


# ═══════════════════════════════════════════════════════════════════════════
# PHASE 8: END-TO-END VERIFICATION
# ═══════════════════════════════════════════════════════════════════════════

# Open https://workorders.proroto.com in browser.
# Run through this checklist:

# [ ] 8.1  /login page loads
# [ ] 8.2  Login with admin@proroto.com → redirects to /admin
# [ ] 8.3  5 tabs visible: Tickets, Buildings, Companies, Users, Dispatch
# [ ] 8.4  Companies tab → shows "Pro Roto, Inc" card
# [ ] 8.5  Users tab → shows your admin user in table
# [ ] 8.6  Users tab → "+ Invite User" → select Pro Roto, fill form, send
#           → green success box with token and accept URL
#           (this proves Edge Functions are connected)
# [ ] 8.7  Buildings tab → "+ Add Building" → create a test building
#           (this proves PostgREST + RLS is working)
# [ ] 8.8  Add a space to the building (unit or common area)
# [ ] 8.9  Tickets tab → create a ticket with a photo attachment
#           (this proves Storage bucket + upload + Edge Function create-ticket)
# [ ] 8.10 Ticket detail → add a comment
#           (this proves create-comment + get-ticket-comments Edge Functions)
# [ ] 8.11 Dispatch tab → see ticket in "New" column → click "→ Scheduled"
#           (this proves update-ticket Edge Function + transition matrix)
# [ ] 8.12 Open browser console → no red errors

# If any step fails, see TROUBLESHOOTING below.


# ═══════════════════════════════════════════════════════════════════════════
# TROUBLESHOOTING
# ═══════════════════════════════════════════════════════════════════════════

# ── "Missing VITE_SUPABASE_URL" on page load ──
# Env vars not set or deploy wasn't triggered after setting them.
# Fix: verify env vars in Netlify dashboard → Trigger deploy → Deploy site.

# ── CORS errors in browser console ──
# VITE_EDGE_BASE_URL doesn't match actual Supabase URL.
# Fix: compare exact URL. Must include /functions/v1 suffix.

# ── Login works but tickets/buildings show empty ──
# RLS is working correctly — your public.users record might be missing.
# Fix: verify SELECT * FROM public.users WHERE id = '<your-auth-uid>'

# ── "permission denied for table ticket_comments" ──
# This is CORRECT. Migration 00006 blocks PostgREST access.
# Comments go through Edge Functions only.

# ── Edge Function returns 500 ──
# Check: Supabase Dashboard → Logs → Edge Functions
# Common: import_map or Deno resolution issues.
# Fix: redeploy the function: supabase functions deploy <name> --no-verify-jwt

# ── Invitation send fails ──
# Check: is company_id correct? Is the email already in users or invitations?
# Check: Supabase → Logs → Edge Functions → send-invitation logs

# ── 404 on direct URL navigation (e.g. /admin/dispatch) ──
# SPA redirect not working. Verify netlify.toml is in repo root.
# Verify the [[redirects]] block has status = 200.

# ── SSL not provisioning ──
# DNS hasn't propagated yet. Check: dig workorders.proroto.com CNAME
# If using Cloudflare, ensure proxy is OFF (DNS only / gray cloud).

# ── Build fails on Netlify ──
# Test locally first: npm ci && npm run build
# Check NODE_VERSION=20 is set in Netlify env vars.
# Check package-lock.json is committed to git.
