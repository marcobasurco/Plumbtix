// PreToolUse hook for Write / Edit / MultiEdit — enforces two project rules:
//
//   1. Applied migrations are immutable. Any file under supabase/migrations/
//      that is already tracked by git cannot be edited; a new file must be
//      created instead (see /new-migration). Untracked (brand-new) migration
//      files can still be edited freely while they are being written.
//   2. Secrets files (.env*, supabase/.env*) are never written by Claude.
//
// Reads the tool call as JSON on stdin; prints a deny decision to block.

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

const filePath = String(input?.tool_input?.file_path ?? '');
if (!filePath) process.exit(0);

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const rel = path.relative(projectDir, path.resolve(projectDir, filePath)).replace(/\\/g, '/');

function deny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `[guard-edits] ${reason}`,
    },
  }));
  process.exit(0);
}

// Rule 2 — secrets
if (/^(\.env(\..+)?|supabase\/\.env(\..+)?)$/.test(rel) && !rel.endsWith('.example')) {
  deny(`${rel} holds secrets and is never edited by Claude. Ask Marco to change it.`);
}

// Rule 1 — applied migrations are immutable
if (/^supabase\/migrations\/\d{5}_.+\.sql$/.test(rel)) {
  let tracked = false;
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', rel], { cwd: projectDir, stdio: 'ignore' });
    tracked = true;
  } catch {
    tracked = false; // not tracked → new file being authored → allowed
  }
  if (tracked) {
    deny(`${rel} is an applied migration and is immutable. Create the next-numbered migration file instead (run /new-migration).`);
  }
}

process.exit(0);
