// PostToolUse hook for Write / Edit / MultiEdit — runs ESLint (with --fix) on
// the TypeScript file that was just changed, so style problems are corrected
// immediately and real lint errors are fed back to Claude to fix.
//
// Scope: src/ and shared/ only (the same scope as `npm run lint` and CI).
// Edge functions are Deno and are not covered by the repo's ESLint config.
//
// Exit 0  → nothing to report.
// Exit 2  → remaining lint errors; stderr is shown to Claude as feedback.
// If node_modules is missing (no `npm install` yet), the hook does nothing.

import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
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
const abs = path.resolve(projectDir, filePath);
const rel = path.relative(projectDir, abs).replace(/\\/g, '/');

if (!/^(src|shared)\/.+\.(ts|tsx)$/.test(rel)) process.exit(0);
if (!existsSync(abs)) process.exit(0);

const eslintJs = path.join(projectDir, 'node_modules', 'eslint', 'bin', 'eslint.js');
if (!existsSync(eslintJs)) process.exit(0); // dependencies not installed; skip quietly

const result = spawnSync(process.execPath, [eslintJs, '--fix', '--no-warn-ignored', abs], {
  cwd: projectDir,
  encoding: 'utf8',
});

if (result.status === 0) process.exit(0);

const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
process.stderr.write(`[lint-file] ESLint reported problems in ${rel} after --fix:\n${output}\n`);
process.exit(2);
