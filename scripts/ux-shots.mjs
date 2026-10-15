// =============================================================================
// PlumbTix — UX screenshot capture
// =============================================================================
// Logs in and captures full-page screenshots of the app at phone and desktop
// widths (light and, optionally, dark) so Claude Code can review real screens.
//
// Usage (from the repo root):
//   node scripts/ux-shots.mjs                    # local dev server, light theme
//   node scripts/ux-shots.mjs --dark             # add dark-theme captures
//   node scripts/ux-shots.mjs --routes=/admin,/admin/tickets
//   node scripts/ux-shots.mjs --base=https://workorders.proroto.com
//
// Environment:
//   UX_BASE_URL          base URL (default http://localhost:5173; --base overrides)
//   E2E_ADMIN_EMAIL      login email    (same names the e2e tests use)
//   E2E_ADMIN_PASSWORD   login password
//
// One-time setup on a new machine:  npx playwright install chromium
// Output: .claude/ux-shots/<route>__<viewport>__<theme>.png + index.md
// The output folder is git-ignored — screenshots contain real data.
// =============================================================================

import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);

const BASE = String(args.base || process.env.UX_BASE_URL || 'http://localhost:5173').replace(/\/$/, '');
const EMAIL = process.env.E2E_ADMIN_EMAIL;
const PASSWORD = process.env.E2E_ADMIN_PASSWORD;
const OUT = path.resolve('.claude/ux-shots');

const DEFAULT_ROUTES = [
  '/login',
  '/admin',
  '/admin/tickets',
  '/admin/tickets/new',
  '/admin/buildings',
  '/admin/companies',
  '/admin/users',
  '/admin/dispatch',
  '/admin/technicians',
  '/admin/analytics',
  '/admin/reports',
  '/admin/import',
  '/settings',
];
const routes = args.routes ? String(args.routes).split(',').map((r) => r.trim()).filter(Boolean) : DEFAULT_ROUTES;

const VIEWPORTS = {
  phone: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  desktop: { width: 1280, height: 800, deviceScaleFactor: 1 },
};
const THEMES = args.dark ? ['light', 'dark'] : ['light'];

function slug(route) {
  return route === '/' ? 'home' : route.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-');
}

async function reachable(url) {
  try {
    const res = await fetch(url, { method: 'GET' });
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await reachable(BASE))) {
    console.error(`Cannot reach ${BASE}.\n  • For local review: run \`npm run dev\` in another terminal first.\n  • For production: pass --base=https://workorders.proroto.com`);
    process.exit(1);
  }

  const isPublic = (r) => /^\/(login|forgot-password|reset-password|accept-invite|claim|p\/)/.test(r);
  const needsLogin = routes.some((r) => !isPublic(r));
  if (needsLogin && (!EMAIL || !PASSWORD)) {
    console.error('Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD in the environment to capture signed-in screens.\n  PowerShell:  $env:E2E_ADMIN_EMAIL="you@proroto.com"; $env:E2E_ADMIN_PASSWORD="..."');
    process.exit(1);
  }

  mkdirSync(OUT, { recursive: true });
  for (const f of readdirSync(OUT)) if (f.endsWith('.png') || f === 'index.md') unlinkSync(path.join(OUT, f));

  let browser;
  try {
    browser = await chromium.launch();
  } catch (e) {
    console.error('Chromium is not installed for Playwright. Run once:  npx playwright install chromium\n', e.message);
    process.exit(1);
  }

  const index = [`# UX screenshots — ${new Date().toISOString()}`, '', `Base: ${BASE}`, ''];

  for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
    for (const theme of THEMES) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.isMobile, hasTouch: !!vp.hasTouch, deviceScaleFactor: vp.deviceScaleFactor, colorScheme: theme });
      await context.addInitScript((t) => { try { localStorage.setItem('plumbtix-theme', t); } catch { /* ignore */ } }, theme);
      const page = await context.newPage();
      await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme });

      index.push(`## ${vpName} · ${theme} (${vp.width}×${vp.height})`, '');

      // Public screens first — once signed in, /login redirects to the dashboard.
      const publicRoutes = routes.filter(isPublic);
      const authRoutes = routes.filter((r) => !isPublic(r));

      const capture = async (route) => {
        const file = `${slug(route)}__${vpName}__${theme}.png`;
        try {
          await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
          await page.waitForTimeout(600); // let skeletons resolve and realtime settle
          await page.screenshot({ path: path.join(OUT, file), fullPage: true });
          index.push(`- ${route} → ${file}`);
          console.log(`✓ ${vpName.padEnd(7)} ${theme.padEnd(5)} ${route}`);
        } catch (e) {
          index.push(`- ${route} → FAILED: ${e.message.split('\n')[0]}`);
          console.log(`✗ ${vpName.padEnd(7)} ${theme.padEnd(5)} ${route}: ${e.message.split('\n')[0]}`);
        }
      };

      for (const route of publicRoutes) await capture(route);

      if (authRoutes.length > 0) {
        await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
        await page.fill('#email', EMAIL);
        await page.fill('#password', PASSWORD);
        await page.click('button[type="submit"]');
        try {
          await page.waitForURL(/\/(admin|dashboard|my)(\/|$)/, { timeout: 20000 });
        } catch {
          console.error(`Login did not reach a dashboard at ${vpName}/${theme}. Check the credentials.`);
          await browser.close();
          process.exit(1);
        }
      }

      for (const route of authRoutes) await capture(route);
      index.push('');
      await context.close();
    }
  }

  await browser.close();
  writeFileSync(path.join(OUT, 'index.md'), index.join('\n'));
  console.log(`\nSaved to ${OUT}  (see index.md)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
