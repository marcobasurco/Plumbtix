---
name: security-review
description: Run the security-reviewer subagent on the current branch's changes (or on files/paths given as arguments) to catch tenant-isolation and privilege-escalation issues before a PR. Use before merging anything that touches migrations, edge functions, or data access.
argument-hint: [optional: files, paths, or "main...HEAD"]
---

Use the **security-reviewer** subagent to review: $ARGUMENTS

If no arguments were given, review `git diff main...HEAD` plus untracked
files. Present its findings table unchanged, then — for each Critical or High
finding — propose the concrete fix as a diff and ask whether to apply it.
Do not apply security fixes without confirmation.
