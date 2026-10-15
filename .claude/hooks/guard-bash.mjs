// PreToolUse hook for Bash — blocks commands that would be destructive to the
// repo or to the PRODUCTION Supabase project. Cross-platform (Node), so it
// behaves the same under Git Bash and PowerShell.
//
// Claude Code passes the tool call as JSON on stdin; printing a
// permissionDecision "deny" blocks the call and shows the reason to Claude.

import { readFileSync } from 'node:fs';

let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0); // unreadable input → no decision
}

const command = String(input?.tool_input?.command ?? '');

const RULES = [
  [/\brm\s+-\S*r/i,
    'Recursive delete is blocked. Delete specific files explicitly, or ask Marco.'],
  [/\bgit\s+push\b[^|;&]*(\s--force\b|\s-f\b|\s--force-with-lease\b)/,
    'Force push is blocked. Rebase onto main and push normally, or ask Marco.'],
  [/\bgit\s+(reset\s+--hard|checkout\s+--\s+\.|clean\s+-\S*f)/,
    'Discarding working-tree changes is blocked. Stash or commit instead.'],
  [/\bgit\s+(commit|push)\b[^|;&]*--no-verify/,
    '--no-verify is blocked; hooks and CI are part of the workflow.'],
  [/\bsupabase(@\S+)?\s+db\s+reset\b[^|;&]*--linked/,
    '`supabase db reset --linked` would wipe the PRODUCTION database. Local reset only.'],
  [/\bsupabase(@\S+)?\s+(projects\s+delete|functions\s+delete|db\s+dump\b[^|;&]*--data-only)/,
    'This Supabase operation is manual-only. Ask Marco to run it.'],
  [/\b(TRUNCATE|DROP\s+(TABLE|SCHEMA|DATABASE|POLICY|TRIGGER|FUNCTION))\b/i,
    'Destructive SQL from the shell is blocked. Put it in a reviewed migration file (see /new-migration).'],
  [/\bsupabase(@\S+)?\s+(sql|db\s+query)\b[^|;&]*\b(DELETE|UPDATE|INSERT)\b/i,
    'Data changes against the linked database must go through a migration or Marco.'],
];

for (const [pattern, reason] of RULES) {
  if (pattern.test(command)) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `[guard-bash] ${reason}`,
      },
    }));
    process.exit(0);
  }
}

process.exit(0); // no decision → normal permission flow
