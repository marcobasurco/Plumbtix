---
name: ux-audit
description: Capture real screenshots of PlumbTix (phone + desktop, light/dark) with Playwright and have the ux-reviewer subagent critique them for usability, hierarchy, consistency, accessibility and mobile fit. Use for a full UX review of the app or specific routes.
argument-hint: [--routes=/admin,/admin/tickets] [--dark] [--base=https://workorders.proroto.com]
allowed-tools: Bash(node scripts/ux-shots.mjs*) Bash(npm run dev*) Bash(npx playwright install*) Read Glob Grep
---

Run a UX audit: $ARGUMENTS

1. **Capture.** Run `node scripts/ux-shots.mjs $ARGUMENTS`. The script needs:
   - a reachable app: `npm run dev` running in another terminal (local
     changes) or `--base=https://workorders.proroto.com` (production);
   - `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` set in the environment for
     signed-in screens (PowerShell: `$env:E2E_ADMIN_EMAIL="…"`);
   - Chromium for Playwright, once per machine: `npx playwright install chromium`.
   If it fails, show the script's message and the exact command to fix it;
   do not guess around it.
2. **Review.** Delegate to the **ux-reviewer** subagent: "Review the
   screenshots listed in `.claude/ux-shots/index.md`, phone first." Present
   its report unchanged.
3. **Act.** For the top 3 changes, show the concrete code change for each
   (file, what changes, why) and ask which to implement. After implementing,
   re-run the capture for the affected routes so the before/after can be
   compared.

Screenshots contain real customer data and are git-ignored; never commit
them or paste them into PRs.
