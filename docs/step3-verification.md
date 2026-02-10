# Work Orders — Step 3 Verification: React Auth Layer + Routing

## Delivered Files (17 files)

| File | Lines | Purpose |
|------|-------|---------|
| **Lib (core)** | | |
| `src/lib/supabaseClient.ts` | 26 | Singleton Supabase client (anon key only) |
| `src/lib/api.ts` | 200 | Edge Function fetch wrapper with JWT auth, typed responses |
| `src/lib/auth.tsx` | 153 | AuthProvider: session, profile, role, companyId, signIn/signOut |
| **Components** | | |
| `src/components/RoleGate.tsx` | 42 | Role-based content gate + roleHome() helper |
| `src/components/Loading.tsx` | 6 | Minimal loading indicator |
| `src/components/ErrorBanner.tsx` | 48 | Dismissable error banner |
| **Routes** | | |
| `src/routes/login.tsx` | 81 | Email/password login with redirect |
| `src/routes/accept-invite.tsx` | 133 | PM onboarding (token → Edge Function → session) |
| `src/routes/claim-account.tsx` | 113 | Resident onboarding (token → Edge Function → session) |
| `src/routes/protected.tsx` | 30 | Route guard (session + profile required) |
| `src/routes/dashboard-admin.tsx` | 30 | Admin placeholder |
| `src/routes/dashboard-pm.tsx` | 30 | PM placeholder |
| `src/routes/dashboard-resident.tsx` | 27 | Resident placeholder |
| **App** | | |
| `src/App.tsx` | 79 | Router: public + protected routes, RoleGate wiring |
| `src/main.tsx` | 8 | Entry point |
| `src/index.css` | 129 | Minimal functional styles |
| `src/vite-env.d.ts` | 12 | Vite env type declarations |

---

## Checkpoint 3.1 — Project Wiring + Supabase Client + Router Skeleton

### Files
- `package.json` — React 19, react-router-dom 7, @supabase/supabase-js 2.49
- `vite.config.ts` — `@/` and `@shared/` aliases, dev proxy for `/functions`
- `tsconfig.json` — Matching path aliases
- `.env.example` — Template for VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_EDGE_BASE_URL
- `netlify.toml` — SPA fallback `/* → /index.html` (200)
- `index.html` — Root mount point
- `src/main.tsx` — StrictMode + createRoot
- `src/lib/supabaseClient.ts` — Client with anon key, autoRefreshToken, persistSession
- `src/App.tsx` — Full router structure

### How to verify
```bash
cd work-orders
cp .env.example .env.local
# Fill in values from `supabase start`
npm install
npm run dev
```

### Expected
- Vite starts on http://localhost:5173
- Navigating to `/` redirects to `/login`
- `/admin`, `/dashboard`, `/my` all redirect to `/login` (no session)
- `/accept-invite` without `?token=` shows "Invalid Invitation"
- `/claim-account` without `?token=` shows "Invalid Link"
- `/nonexistent` redirects to `/`
- No console errors about missing env vars (if .env.local filled)

### Security notes
- `supabaseClient.ts` uses only `VITE_SUPABASE_ANON_KEY` — service role never in frontend
- `detectSessionInUrl: false` — prevents token leakage via URL hash

---

## Checkpoint 3.2 — Login Flow + Profile Fetch + Role-Based Redirect

### Files
- `src/lib/auth.tsx` — AuthProvider with full lifecycle
- `src/routes/login.tsx` — Login form
- `src/routes/dashboard-admin.tsx` / `dashboard-pm.tsx` / `dashboard-resident.tsx` — Placeholders

### How to verify
```bash
# Terminal 1: Supabase
supabase start
supabase db reset

# Terminal 2: Edge Functions
supabase functions serve --env-file ./supabase/.env.local

# Terminal 3: Frontend
npm run dev
```

Bootstrap a test user (run against local DB):
```bash
ANON_KEY="<anon_key from supabase start>"
API="http://127.0.0.1:54321"

# Create auth user
ADMIN_AUTH=$(curl -s "$API/auth/v1/signup" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@proroto.com","password":"testpass123"}')
ADMIN_ID=$(echo $ADMIN_AUTH | jq -r '.user.id')

# Insert public.users (via service role)
SERVICE_KEY="<service_role key from supabase start>"
curl -s "$API/rest/v1/users" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"id\": \"$ADMIN_ID\",
    \"email\": \"admin@proroto.com\",
    \"full_name\": \"Marco Admin\",
    \"role\": \"proroto_admin\",
    \"company_id\": \"00000000-0000-0000-0000-000000000001\"
  }"
```

### Test steps
1. Go to `http://localhost:5173/login`
2. Enter `admin@proroto.com` / `testpass123` → click Sign In
3. Should redirect to `/admin`
4. Dashboard shows "Marco Admin · admin@proroto.com" with Admin badge
5. Click Sign Out → redirects to `/login`
6. Try navigating to `/admin` directly → redirects to `/login`

### Auth flow internals
1. `signIn()` calls `supabase.auth.signInWithPassword()`
2. `onAuthStateChange` fires `SIGNED_IN` event with session
3. `handleSession()` fetches profile: `supabase.from('users').select('*').eq('id', userId).single()`
4. Profile contains `role: 'proroto_admin'` → context updated
5. `LoginPage` detects `session && role` → `Navigate` to `roleHome('proroto_admin')` = `/admin`

### Security notes
- Profile fetch uses user JWT + `users_read_own` RLS policy (self-read only)
- No service role involved in profile fetch
- `ProtectedRoute` checks both `session` AND `profile` before rendering children
- Failed login shows friendly "Invalid email or password" (not raw Supabase error)

---

## Checkpoint 3.3 — Accept-Invite + Claim-Account Screens

### Files
- `src/routes/accept-invite.tsx` — PM onboarding form
- `src/routes/claim-account.tsx` — Resident onboarding form
- `src/lib/api.ts` — `acceptInvitation()` and `claimResident()` wrappers

### How to verify: Accept Invitation
```bash
# Create PM company + send invitation (as admin):
PM_COMPANY_ID=<from step2 bootstrap>

# Get admin JWT:
ADMIN_JWT=$(curl -s "$API/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@proroto.com","password":"testpass123"}' \
  | jq -r '.access_token')

# Send invitation via Edge Function:
INVITE=$(curl -s -X POST "$API/functions/v1/send-invitation" \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d "{
    \"company_id\": \"$PM_COMPANY_ID\",
    \"email\": \"pm@example.com\",
    \"name\": \"Jane PM\",
    \"role\": \"pm_admin\"
  }")
TOKEN=$(echo $INVITE | jq -r '.data.invitation.token')
echo "Visit: http://localhost:5173/accept-invite?token=$TOKEN"
```

### Test steps (accept-invite)
1. Visit the URL with token
2. Fill in: Full Name = "Jane PM", Email = "pm@example.com", Password = "testpass123"
3. Click "Create Account"
4. Success message shows → redirects to `/dashboard` after 1.5s
5. PM dashboard shows "Jane PM · Property Manager Admin"

### Test steps (claim-account)
1. Requires an occupant with invite_token in DB (created by admin in later steps)
2. Visit `/claim-account?token=<occupant_invite_token>`
3. Fill in email (must match occupant record) + password
4. Redirects to `/my` on success

### Security notes
- Both screens call Edge Functions with `requireAuth: false` — the token IS the credential
- Edge Functions create the auth.users record + public.users record
- Edge Functions return session tokens → `supabase.auth.setSession()` hydrates the client
- After setSession, `onAuthStateChange` fires → profile loads → redirect happens

---

## Checkpoint 3.4 — Protected Routing + RoleGate + Placeholders

### Files
- `src/routes/protected.tsx` — Layout route guard
- `src/components/RoleGate.tsx` — Role-based content gate

### Route protection matrix

| Route | Required Auth | Required Role | Redirect on Deny |
|-------|:---:|---|---|
| `/login` | No | — | If logged in → role home |
| `/accept-invite?token=` | No | — | — |
| `/claim-account?token=` | No | — | — |
| `/admin/*` | Yes | `proroto_admin` | → role home |
| `/dashboard/*` | Yes | `pm_admin`, `pm_user` | → role home |
| `/my/*` | Yes | `resident` | → role home |
| `/` | — | — | → role home or `/login` |
| `/*` (catch-all) | — | — | → `/` |

### Test: Cross-role access denial
1. Log in as `admin@proroto.com` (proroto_admin)
2. Navigate to `/dashboard` → should redirect to `/admin`
3. Navigate to `/my` → should redirect to `/admin`
4. Sign out → navigate to `/admin` → redirects to `/login`

### How `ProtectedRoute` works
```
<Route element={<ProtectedRoute />}>
  <Route path="/admin/*" element={<RoleGate allowed={['proroto_admin']}>...} />
  <Route path="/dashboard/*" element={<RoleGate allowed={['pm_admin','pm_user']}>...} />
  <Route path="/my/*" element={<RoleGate allowed={['resident']}>...} />
</Route>
```

1. `ProtectedRoute` (Outlet layout) checks `session` + `profile`
   - No session → `Navigate` to `/login` with `state.from`
   - No profile → shows loading
2. `RoleGate` checks `role` against `allowed` list
   - Mismatch → redirects to `roleHome(role)` (the user's OWN dashboard)

### Security notes
- `ProtectedRoute` preserves intended destination in `location.state.from`
- After login, `LoginPage` reads `state.from` and redirects there
- `RoleGate` never shows content to wrong role — redirect happens before render
- No flash of unauthorized content (loading states during checks)

---

## API Wrapper Security Summary (`src/lib/api.ts`)

| Edge Function | Auth | Method | Frontend Wrapper |
|---|---|---|---|
| accept-invitation | Token (no JWT) | POST | `acceptInvitation()` |
| claim-resident | Token (no JWT) | POST | `claimResident()` |
| create-ticket | JWT | POST | `createTicket()` |
| update-ticket | JWT | PATCH | `updateTicket()` |
| get-ticket-comments | JWT | GET | `getTicketComments()` |
| create-comment | JWT | POST | `createComment()` |
| register-attachment | JWT | POST | `registerAttachment()` |
| send-invitation | JWT | POST | `sendInvitation()` |

- `callEdge()` auto-attaches `Authorization: Bearer` from current session
- `apikey` header always sent (required by Supabase Kong gateway)
- Handles non-JSON responses (Kong error pages)
- Consistent error shape: `{ ok: false, error: { code, message, status } }`
- NO_SESSION error returned if JWT required but not present

---

## Overall Security Audit

| # | Check | Status |
|---|-------|--------|
| 1 | No service_role key in frontend code | ✅ |
| 2 | ticket_comments never queried via PostgREST | ✅ |
| 3 | Comments read via get-ticket-comments Edge Function only | ✅ |
| 4 | Comments written via create-comment Edge Function only | ✅ |
| 5 | Profile fetch uses user JWT + RLS self-read | ✅ |
| 6 | Protected routes require session + profile | ✅ |
| 7 | Role-based access enforced by RoleGate | ✅ |
| 8 | Login error messages don't leak details | ✅ |
| 9 | Token onboarding uses requireAuth: false | ✅ |
| 10 | Session tokens stored by supabase-js (not custom storage) | ✅ |
| 11 | Vite proxy for /functions only active in dev | ✅ |
| 12 | Netlify SPA fallback configured | ✅ |

---

## Build & Deploy

```bash
# Local build test
npm run build
# Output in dist/

# Netlify: workorders.proroto.com
# Set env vars in Netlify dashboard:
#   VITE_SUPABASE_URL=https://<project>.supabase.co
#   VITE_SUPABASE_ANON_KEY=<anon_key>
#   VITE_EDGE_BASE_URL=https://<project>.supabase.co/functions/v1
```
