---
name: new-migration
description: Create the next numbered Supabase migration file for a schema, policy, trigger, function, or storage change, following PlumbTix rules (idempotent, additive, verification queries). Use whenever the database must change.
argument-hint: [what the migration should do]
---

Create a new migration for: $ARGUMENTS

Delegate the writing to the **migration-author** subagent with that request.
When it returns:

1. Show me the file path and a 3–5 line summary of what it changes.
2. Apply the companion changes it listed (`shared/types/database.ts`,
   `shared/types/enums.ts`, edge functions, frontend, transition-matrix copies)
   and add a line under the next version heading in `CHANGELOG.md`.
3. Run `npm run typecheck`.
4. Remind me that the migration is not applied until `/deploy` runs
   `supabase db push`.

Never edit an existing file in `supabase/migrations/`; the guard-edits hook
will block it, and the fix is always a new file.
