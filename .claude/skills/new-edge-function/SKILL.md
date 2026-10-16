---
name: new-edge-function
description: Scaffold a new Supabase edge function for PlumbTix with the project's auth, validation, response and background-work conventions, plus the frontend API wrapper and shared types. Use when a new server-side write or privileged read is needed.
argument-hint: <function-name> [what it does]
---

Scaffold an edge function: $ARGUMENTS

Read `supabase/functions/update-ticket/index.ts` and
`supabase/functions/create-entitlement/index.ts` first as reference
implementations, then create:

1. `supabase/functions/<name>/index.ts` with the standard header comment
   (route, auth, which client and why), `handleCors`, method guard,
   `createUserClient(req)` + `getAuthenticatedUserId`, role check via
   `getCallerRole` when the function is role-restricted, a zod schema with
   `parseBody`, RLS-scoped reads/writes via the user client, and responses
   through `_shared/response.ts`. Use `createServiceClient()` only for a
   documented reason, and `runInBackground()` for any email/SMS work after
   the response.
2. Request/response types in `shared/types/api.ts`.
3. A typed wrapper in `src/lib/api.ts` using `callEdge`.
4. A `[functions.<name>]` entry in `supabase/config.toml` **only** if the
   function must be reachable without a JWT (`verify_jwt = false`), with a
   comment saying why; otherwise no entry.
5. A `CHANGELOG.md` line.

Then explain in a few lines which RLS policies the function relies on and
whether a migration is needed. Do not deploy — that is `/deploy`.
