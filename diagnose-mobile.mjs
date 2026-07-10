import { chromium } from '@playwright/test';

const BASE = 'https://workorders.proroto.com';
const VW = 393, VH = 852; // iPhone 14 Pro, pinned explicitly

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: VW, height: VH }, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });

const pagesToCheck = ['/login', '/p/cc889c27-4f32-4bf7-980b-42111e84ee6e'];
if (process.env.E2E_EMAIL) {
  await page.goto(BASE + '/login');
  await page.fill('input[type="email"]', process.env.E2E_EMAIL);
  await page.fill('input[type="password"]', process.env.E2E_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard**', { timeout: 15000 }).catch(() => {});
  pagesToCheck.push('/dashboard', '/dashboard/tickets');
}

for (const path of pagesToCheck) {
  await page.goto(BASE + path, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); // render lazy bottom
  await page.waitForTimeout(800);
  const r = await page.evaluate(() => {
    const vw = 393; // device width — innerWidth lies when content inflates the layout viewport
    const reported = window.innerWidth;
    const wide = [];
    document.querySelectorAll('*').forEach((el) => {
      const b = el.getBoundingClientRect();
      if (b.right > vw + 1 && b.width > 40) {
        wide.push({ tag: el.tagName.toLowerCase(),
          cls: (el.className?.baseVal ?? el.className ?? '').toString().slice(0, 80),
          w: Math.round(b.width), right: Math.round(b.right) });
      }
    });
    return { vw, reported, wide: wide.slice(0, 15) };
  });
  const inflated = r.reported - r.vw;
  console.log(`\n=== ${path} — device ${r.vw}px, layout ${r.reported}px ${inflated > 1 ? `⚠ INFLATED +${inflated}px` : '✓'} — ${r.wide.length} elements past device edge ===`);
  r.wide.forEach((w) => console.log(`  ${w.w}px wide, right edge at ${w.right} → <${w.tag}> .${w.cls}`));
  await page.screenshot({ path: `mobile2-${path.replace(/[\/:?=]/g, '_')}.png`, fullPage: true });
}
await browser.close();
