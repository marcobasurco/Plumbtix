# Work Orders — Step 2 Verification Checklist (v2 — Post-Fixes)

## Changes in This Revision

| Fix | What Changed | Files Affected |
|-----|-------------|----------------|
| **FIX 1** | Migration 00006 REVOKES ALL on ticket_comments for anon/authenticated. PostgREST cannot touch this table. | `00006_revoke_ticket_comments_postgrest.sql`, `get-ticket-comments/index.ts`, `create-comment/index.ts`, `update-ticket/index.ts` |
| **FIX 2** | create-comment rejects `is_internal=true` from non-proroto with 403 (was: silent override) | `create-comment/index.ts`, `shared/types/api.ts` |
| **FIX 3** | send-invitation returns `{ invitation }` only, no invite_url (matches api.ts contract) | `send-invitation/index.ts` |
| **HARDENING** | Role lookup uses `get_user_role()` RPC via user JWT. Service role only where required. | `_shared/auth.ts`, `update-ticket/index.ts`, `get-ticket-comments/index.ts`, `create-comment/index.ts`, `send-invitation/index.ts` |

---

## How to Run Locally

```bash
# 1. Start local Supabase
supabase start
supabase db reset

# 2. Note the output keys:
#    API URL:          http://127.0.0.1:54321
#    anon key:         eyJ...
#    service_role key: eyJ...
#    DB URL:           postgresql://postgres:postgres@127.0.0.1:54322/postgres

# 3. Create supabase/.env.local:
cat > supabase/.env.local << 'EOF'
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
SUPABASE_ANON_KEY=<anon_key>
APP_URL=http://localhost:5173
EOF

# 4. Run verification SQL (16 checks, all must PASS):
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  -f scripts/verify-migrations.sql

# 5. Serve Edge Functions:
supabase functions serve --env-file ./supabase/.env.local
```

---

## Required Proofs (5 Tests)

### Pre-requisite: Bootstrap test users

```bash
# Set vars (replace with your output from `supabase start`):
ANON_KEY="<anon_key>"
SERVICE_KEY="<service_role_key>"
API="http://127.0.0.1:54321"

# --- Create proroto_admin user ---
ADMIN_AUTH=$(curl -s "$API/auth/v1/signup" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@proroto.com","password":"testpass123"}')
ADMIN_ID=$(echo $ADMIN_AUTH | jq -r '.user.id')
echo "Admin auth id: $ADMIN_ID"

# Insert public.users (via service role):
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

# Get admin JWT:
ADMIN_JWT=$(curl -s "$API/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@proroto.com","password":"testpass123"}' \
  | jq -r '.access_token')
echo "Admin JWT: $ADMIN_JWT"

# --- Create PM company + PM user ---
PM_COMPANY_ID=$(curl -s "$API/rest/v1/companies" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"name":"Test PM Co","slug":"test-pm-co"}' \
  | jq -r '.[0].id')
echo "PM Company: $PM_COMPANY_ID"

PM_AUTH=$(curl -s "$API/auth/v1/signup" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"pm@example.com","password":"testpass123"}')
PM_ID=$(echo $PM_AUTH | jq -r '.user.id')

curl -s "$API/rest/v1/users" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"id\": \"$PM_ID\",
    \"email\": \"pm@example.com\",
    \"full_name\": \"Test PM\",
    \"role\": \"pm_admin\",
    \"company_id\": \"$PM_COMPANY_ID\"
  }"

PM_JWT=$(curl -s "$API/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"pm@example.com","password":"testpass123"}' \
  | jq -r '.access_token')
echo "PM JWT: $PM_JWT"

# --- Create building + space for tickets ---
BUILDING_ID=$(curl -s "$API/rest/v1/buildings" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "{
    \"company_id\": \"$PM_COMPANY_ID\",
    \"address_line1\": \"123 Main St\",
    \"city\": \"Redwood City\",
    \"state\": \"CA\",
    \"zip\": \"94063\"
  }" | jq -r '.[0].id')
echo "Building: $BUILDING_ID"

SPACE_ID=$(curl -s "$API/rest/v1/spaces" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "{
    \"building_id\": \"$BUILDING_ID\",
    \"space_type\": \"unit\",
    \"unit_number\": \"101\"
  }" | jq -r '.[0].id')
echo "Space: $SPACE_ID"

# --- Create a ticket (as admin) ---
TICKET_ID=$(curl -s -X POST "$API/functions/v1/create-ticket" \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d "{
    \"building_id\": \"$BUILDING_ID\",
    \"space_id\": \"$SPACE_ID\",
    \"issue_type\": \"drain_clog\",
    \"severity\": \"standard\",
    \"description\": \"Kitchen sink is slow\"
  }" | jq -r '.data.ticket.id')
echo "Ticket: $TICKET_ID"
```

---

### PROOF 1: PostgREST SELECT on ticket_comments FAILS for authenticated user

```bash
# Direct PostgREST read attempt (as PM):
curl -s "$API/rest/v1/ticket_comments?ticket_id=eq.$TICKET_ID" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $PM_JWT"

# Expected: HTTP 403 or error with "permission denied for table ticket_comments"
# The response should NOT contain any comment rows.

# Also test as anon (no JWT):
curl -s "$API/rest/v1/ticket_comments" \
  -H "apikey: $ANON_KEY"

# Expected: Same — 403 or permission denied.
```

### PROOF 2: Edge Function get-ticket-comments STILL WORKS

```bash
# Admin creates an internal comment first:
curl -s -X POST "$API/functions/v1/create-comment" \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d "{\"ticket_id\": \"$TICKET_ID\", \"comment_text\": \"Internal: premium rate\", \"is_internal\": true}"
echo ""

# Admin creates a public comment:
curl -s -X POST "$API/functions/v1/create-comment" \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d "{\"ticket_id\": \"$TICKET_ID\", \"comment_text\": \"Scheduled for Monday\"}"
echo ""

# Admin reads — should see BOTH comments (2):
curl -s "$API/functions/v1/get-ticket-comments?ticket_id=$TICKET_ID" \
  -H "Authorization: Bearer $ADMIN_JWT" | jq '.data.comments | length'
# Expected: 2

# Verify admin sees is_internal=true:
curl -s "$API/functions/v1/get-ticket-comments?ticket_id=$TICKET_ID" \
  -H "Authorization: Bearer $ADMIN_JWT" \
  | jq '[.data.comments[] | .is_internal]'
# Expected: [true, false]

# PM reads — should see ONLY the public one (1):
curl -s "$API/functions/v1/get-ticket-comments?ticket_id=$TICKET_ID" \
  -H "Authorization: Bearer $PM_JWT" | jq '.data.comments | length'
# Expected: 1

# PM sees NO is_internal=true in response:
curl -s "$API/functions/v1/get-ticket-comments?ticket_id=$TICKET_ID" \
  -H "Authorization: Bearer $PM_JWT" \
  | jq '[.data.comments[] | .is_internal]'
# Expected: [false]
```

### PROOF 3: create-comment with is_internal=true returns 403 for PM

```bash
# PM tries is_internal=true → should get 403:
curl -s -X POST "$API/functions/v1/create-comment" \
  -H "Authorization: Bearer $PM_JWT" \
  -H "Content-Type: application/json" \
  -d "{\"ticket_id\": \"$TICKET_ID\", \"comment_text\": \"PM sneaky internal\", \"is_internal\": true}"

# Expected response:
# {
#   "ok": false,
#   "error": {
#     "code": "FORBIDDEN",
#     "message": "Only Pro Roto admins can create internal comments. Remove the is_internal flag or set it to false."
#   }
# }

# Verify HTTP status is 403:
curl -s -o /dev/null -w "%{http_code}" -X POST "$API/functions/v1/create-comment" \
  -H "Authorization: Bearer $PM_JWT" \
  -H "Content-Type: application/json" \
  -d "{\"ticket_id\": \"$TICKET_ID\", \"comment_text\": \"PM sneaky internal\", \"is_internal\": true}"
# Expected: 403
```

### PROOF 4: proroto_admin CAN create internal comment

```bash
# Admin creates internal comment → should succeed (201):
curl -s -X POST "$API/functions/v1/create-comment" \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d "{\"ticket_id\": \"$TICKET_ID\", \"comment_text\": \"Admin internal note\", \"is_internal\": true}"

# Expected:
# { "ok": true, "data": { "comment": { ..., "is_internal": true, ... } } }

# Verify HTTP status is 201:
curl -s -o /dev/null -w "%{http_code}" -X POST "$API/functions/v1/create-comment" \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d "{\"ticket_id\": \"$TICKET_ID\", \"comment_text\": \"Another internal\", \"is_internal\": true}"
# Expected: 201
```

### PROOF 5: PM can create PUBLIC comment (is_internal omitted defaults false)

```bash
# PM creates comment without is_internal → should succeed (201):
curl -s -X POST "$API/functions/v1/create-comment" \
  -H "Authorization: Bearer $PM_JWT" \
  -H "Content-Type: application/json" \
  -d "{\"ticket_id\": \"$TICKET_ID\", \"comment_text\": \"PM public comment\"}"

# Expected: { "ok": true, "data": { "comment": { ..., "is_internal": false, ... } } }

# PM creates comment with explicit is_internal=false → should succeed (201):
curl -s -X POST "$API/functions/v1/create-comment" \
  -H "Authorization: Bearer $PM_JWT" \
  -H "Content-Type: application/json" \
  -d "{\"ticket_id\": \"$TICKET_ID\", \"comment_text\": \"PM explicit public\", \"is_internal\": false}"

# Expected: 201, is_internal: false
```

---

## Security Checklist

| # | Check | Mechanism | Status |
|---|-------|-----------|--------|
| 1 | PostgREST cannot SELECT ticket_comments | Migration 00006 REVOKE ALL for anon/authenticated | ✅ |
| 2 | PostgREST cannot INSERT ticket_comments | Migration 00006 REVOKE ALL for anon/authenticated | ✅ |
| 3 | Internal comments never leak to PM | get-ticket-comments filters is_internal; PostgREST blocked | ✅ |
| 4 | Internal comments never leak to resident | get-ticket-comments filters; RLS also filters; PostgREST blocked | ✅ |
| 5 | PM cannot create internal comments | create-comment returns 403; PostgREST INSERT blocked | ✅ |
| 6 | Resident cannot create internal comments | create-comment returns 403; PostgREST INSERT blocked | ✅ |
| 7 | PM cannot set execution statuses | update-ticket validates against transition matrix | ✅ |
| 8 | PM cannot modify restricted fields | update-ticket checks ADMIN_ONLY_FIELDS | ✅ |
| 9 | Resident cannot change ticket status | Transition matrix has no entries for resident | ✅ |
| 10 | Transition matrix matches DB trigger | update-ticket mirrors migration 00005 exactly | ✅ |
| 11 | Service role key never exposed to client | Only used server-side in Edge Functions | ✅ |
| 12 | Tokens/passwords never logged | Excluded from console.log in all functions | ✅ |
| 13 | Auth rollback on failure | accept-invitation/claim-resident delete auth user if INSERT fails | ✅ |
| 14 | api.ts contract matches all responses | send-invitation returns `{invitation}` only; no invite_url | ✅ |

---

## Service Role Usage Audit

| Function | Service Role? | What For | Justification |
|----------|--------------|----------|---------------|
| accept-invitation | **YES** | Create auth.users + insert public.users | No JWT exists (token-based onboarding) |
| claim-resident | **YES** | Create auth.users + insert public.users + update occupant | No JWT exists (token-based onboarding) |
| create-ticket | **NO** | — | User JWT + RLS for all operations |
| update-ticket | **Conditional** | INSERT into ticket_comments (decline_reason) | Migration 00006 revoked ALL from authenticated |
| get-ticket-comments | **YES** | SELECT from ticket_comments + users | Migration 00006 revoked ALL from authenticated |
| create-comment | **YES** | INSERT into ticket_comments | Migration 00006 revoked ALL from authenticated |
| register-attachment | **NO** | — | User JWT + RLS for all operations |
| send-invitation | **YES** | Cross-company duplicate email checks | Need visibility across all companies |

Role lookups in all authenticated functions use `get_user_role()` RPC via user JWT (SECURITY DEFINER function, no service role).

---

## File Summary

| File | Lines | Changed In This Revision |
|------|-------|--------------------------|
| `_shared/cors.ts` | 18 | — |
| `_shared/supabase.ts` | 79 | — |
| `_shared/response.ts` | 78 | — |
| `_shared/auth.ts` | 89 | ✅ Added RPC-based `getCallerRole()`, `getCallerCompanyId()` |
| `_shared/validation.ts` | 42 | — |
| `accept-invitation/index.ts` | 181 | — |
| `claim-resident/index.ts` | 168 | — |
| `create-ticket/index.ts` | 166 | — |
| `update-ticket/index.ts` | 237 | ✅ RPC role lookup; service role only for decline comment |
| `get-ticket-comments/index.ts` | 129 | ✅ Service role for comments; RPC for role; user JWT ticket gate |
| `create-comment/index.ts` | 100 | ✅ Rejects is_internal=true with 403; service role for INSERT |
| `register-attachment/index.ts` | 116 | — |
| `send-invitation/index.ts` | 140 | ✅ Removed invite_url; RPC for role/company lookup |
| `migrations/00006_*.sql` | 71 | ✅ NEW — REVOKE ALL on ticket_comments |
| `scripts/verify-migrations.sql` | 130 | ✅ Added V12–V16 for 00006 |
| `shared/types/api.ts` | 112 | ✅ Updated is_internal comment |
| **Total** | **~1,900** | |
