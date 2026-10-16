---
name: deploy
description: Walk through the PlumbTix production deploy checklist — CI status, migration history, supabase db push, edge-function deploy, post-deploy verification. Only run when Marco asks to deploy.
disable-model-invocation: true
allowed-tools: Bash(git *) Bash(gh *) Bash(npx supabase@latest migration list*) Bash(supabase migration list*) Read
---

Run the PlumbTix deploy checklist. Stop and ask before every step that
changes production; never skip a step because an earlier one looked fine.

1. **Branch state.** `git status` must be clean and `git log origin/main..HEAD`
   empty — we deploy only what is merged to `main`. If the current branch is
   not merged, say so and stop; merging happens on GitHub through a PR.
2. **CI.** `gh run list --branch main --limit 3` — the latest "CI/CD" run on
   `main` must be green. If "Deploy Edge Functions" ran on this commit, note
   its result.
3. **Migrations.** `npx supabase@latest migration list`. Explain the table:
   files only in Local are pending. If anything is only in Remote, or Remote
   is empty, stop and report — history needs repair before pushing.
4. **Push migrations** (ask first): `npx supabase@latest db push`. Paste the
   output. If it errors, stop; do not retry blindly.
5. **Edge functions.** They deploy automatically from `main` when
   `supabase/functions/**` or `config.toml` changed. Confirm the GitHub run
   succeeded; only if it failed, ask before running
   `npx supabase@latest functions deploy --no-verify-jwt`. If a function
   folder was deleted, remind me to delete it in Supabase and to remove its
   `[functions.<name>]` entry from `config.toml`.
6. **Verify.** Print the verification queries from the end of each pushed
   migration file for me to run in the SQL Editor, plus the standing app
   walk-through: log in → Settings → save phone → create a ticket with a
   photo → open it → Print/PDF → check the notification email arrived.
7. **Record.** Suggest the `CHANGELOG.md` version bump if not already done.

Finish with a short table: step, result, anything pending.
