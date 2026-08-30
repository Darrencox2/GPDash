// The anonymous entry path. Every visitor who is not signed in walks it, and
// it is assembled from middleware redirects that are easy to break while
// changing something else.
import { test, expect } from '@playwright/test';

test.describe('anonymous routing', () => {
  test('root sends an anonymous visitor to the login page', async ({ page }) => {
    await page.goto('/');
    // / -> /v4 -> /v4/login
    await expect(page).toHaveURL(/\/v4\/login$/);
  });

  test('the login form renders its fields', async ({ page }) => {
    await page.goto('/v4/login');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"], input[type="submit"]').first()).toBeVisible();
  });

  test('the dashboard is not reachable without a session', async ({ page }) => {
    await page.goto('/v4/dashboard');
    await expect(page).not.toHaveURL(/\/v4\/dashboard$/);
  });

  test('no console errors on the login page', async ({ page }) => {
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/v4/login');
    await page.waitForLoadState('networkidle');

    // A CSP violation surfaces here, which is the point: this is the test
    // that would have caught fast refresh being blocked by the policy.
    expect(errors, `console errors:\n${errors.join('\n')}`).toHaveLength(0);
  });
});
