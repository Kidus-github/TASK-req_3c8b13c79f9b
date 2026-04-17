import { test, expect, Page } from '@playwright/test';

const DEMO_USER = 'demo';
const DEMO_PASS = 'demopass1';

async function clearAppState(page: Page) {
  await page.goto('/');
  await page.evaluate(async () => {
    try { window.localStorage.clear(); } catch {}
    try { window.sessionStorage.clear(); } catch {}
    const dbs = ((await (indexedDB as any).databases?.()) ?? []) as { name?: string }[];
    await Promise.all(
      dbs.filter((d) => d.name).map(
        (d) =>
          new Promise<void>((resolve) => {
            const req = indexedDB.deleteDatabase(d.name as string);
            req.onsuccess = () => resolve();
            req.onerror = () => resolve();
            req.onblocked = () => resolve();
          })
      )
    );
  });
  await page.reload();
}

async function unlockDemoProfile(page: Page) {
  await clearAppState(page);
  await page.getByLabel(/Username/).fill(DEMO_USER);
  await page.getByLabel(/^Password$/).fill(DEMO_PASS);
  await page.getByLabel(/Confirm Password/).fill(DEMO_PASS);
  await page.getByRole('button', { name: /Create Local Profile/i }).click();
  await expect(page.getByRole('heading', { name: /Welcome, demo/ })).toBeVisible();
}

test.describe('main route navigation', () => {
  test.beforeEach(async ({ page }) => {
    await unlockDemoProfile(page);
  });

  test('visits every main route without an access-denied toast', async ({ page }) => {
    const routes: Array<{ path: string; heading: RegExp }> = [
      { path: '#/cards', heading: /^Cards$/ },
      { path: '#/import', heading: /Import Cards/ },
      { path: '#/search', heading: /^Search$/ },
      { path: '#/starmap', heading: /stars|Star Map/i },
      { path: '#/voyage', heading: /Voyage Mission/ },
      { path: '#/backup', heading: /Backup & Restore/ },
      { path: '#/parser-rules', heading: /Parser/ },
      { path: '#/sdk-docs', heading: /Star Map SDK/ },
      { path: '#/jobs', heading: /Job Monitor/ },
      { path: '#/settings', heading: /Settings/ },
    ];

    for (const { path, heading } of routes) {
      await page.goto(path);
      // Either a heading with that text shows OR the page content includes it.
      const loc = page.getByRole('heading', { name: heading }).first();
      if (await loc.count()) {
        await expect(loc).toBeVisible();
      } else {
        await expect(page.locator('body')).toContainText(heading);
      }
      // No access-denied toast for any route.
      await expect(page.getByText('Access denied')).toHaveCount(0);
    }
  });

  test('Settings theme selection is reflected on the documentElement', async ({ page }) => {
    await page.goto('#/settings');
    await page.locator('#theme').selectOption('light');
    await expect(page.locator('html')).toHaveClass(/theme-light/);
    await page.locator('#theme').selectOption('dark');
    await expect(page.locator('html')).toHaveClass(/theme-dark/);
  });
});
