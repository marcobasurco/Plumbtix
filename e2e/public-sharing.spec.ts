// =============================================================================
// PlumbTix — E2E Test: Public Ticket Sharing
// =============================================================================
import { test, expect } from '@playwright/test';

const UNKNOWN_TOKEN = '00000000-0000-4000-8000-000000000000';

test.describe('Public Ticket Sharing — always-on', () => {
  test('unknown token shows "Work Order Not Found"', async ({ page }) => {
    await page.goto(`/p/${UNKNOWN_TOKEN}`);
    await expect(page.getByRole('heading', { name: 'Work Order Not Found' })).toBeVisible({ timeout: 10000 });
  });

  test('not-found view offers sign-in link without requiring login', async ({ page }) => {
    await page.goto(`/p/${UNKNOWN_TOKEN}`);
    await expect(page).toHaveURL(new RegExp(`/p/${UNKNOWN_TOKEN}`));
    await expect(page.locator('text=Sign in to PlumbTix')).toBeVisible();
  });

  test('malformed token renders not-found, not a crash', async ({ page }) => {
    await page.goto('/p/not-a-real-token');
    await expect(page.getByRole('heading', { name: 'Work Order Not Found' })).toBeVisible({ timeout: 10000 });
  });

  test('not-found page exposes no sensitive labels', async ({ page }) => {
    await page.goto(`/p/${UNKNOWN_TOKEN}`);
    await expect(page.getByRole('heading', { name: 'Work Order Not Found' })).toBeVisible({ timeout: 10000 });
    const body = (await page.locator('body').innerText()).toLowerCase();
    expect(body).not.toContain('gate code');
    expect(body).not.toContain('quote');
    expect(body).not.toContain('invoice');
  });
});

test.describe('Public Ticket Sharing — live token', () => {
  const token = process.env.E2E_PUBLIC_TOKEN;
  test.skip(!token, 'Set E2E_PUBLIC_TOKEN to run happy-path tests');

  test('shared ticket renders its work order number without login', async ({ page }) => {
    await page.goto(`/p/${token}`);
    await expect(page.locator('h1:has-text("Work Order #")')).toBeVisible({ timeout: 10000 });
  });

  test('shared ticket hides gate codes and pricing', async ({ page }) => {
    await page.goto(`/p/${token}`);
    await expect(page.locator('h1:has-text("Work Order #")')).toBeVisible({ timeout: 10000 });
    const body = (await page.locator('body').innerText()).toLowerCase();
    expect(body).not.toContain('gate code');
    expect(body).not.toContain('quote amount');
    expect(body).not.toContain('invoice number');
  });
});
