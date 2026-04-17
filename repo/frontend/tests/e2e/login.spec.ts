import { test, expect } from '@playwright/test';

const DEMO_USER = 'demo';
const DEMO_PASS = 'demopass1';

async function clearAppState(page: import('@playwright/test').Page) {
  // Wipe IndexedDB, localStorage, and sessionStorage so each test runs against
  // a genuinely fresh profile state.
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

test.describe('login gate and unlock flow', () => {
  test('boots into the local profile gate', async ({ page }) => {
    await clearAppState(page);
    await expect(page.getByRole('heading', { name: /NebulaForge/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Create Local Profile/i })).toBeVisible();
  });

  test('creating the demo profile unlocks the Dashboard', async ({ page }) => {
    await clearAppState(page);
    await page.getByLabel(/Username/).fill(DEMO_USER);
    await page.getByLabel(/^Password$/).fill(DEMO_PASS);
    await page.getByLabel(/Confirm Password/).fill(DEMO_PASS);
    await page.getByRole('button', { name: /Create Local Profile/i }).click();

    await expect(page.getByRole('heading', { name: /Welcome, demo/ })).toBeVisible();
    await expect(page.getByText('Active Cards')).toBeVisible();
  });

  test('unlocks an existing profile on next visit', async ({ page }) => {
    // Seed profile through the UI first.
    await clearAppState(page);
    await page.getByLabel(/Username/).fill(DEMO_USER);
    await page.getByLabel(/^Password$/).fill(DEMO_PASS);
    await page.getByLabel(/Confirm Password/).fill(DEMO_PASS);
    await page.getByRole('button', { name: /Create Local Profile/i }).click();
    await expect(page.getByRole('heading', { name: /Welcome, demo/ })).toBeVisible();

    // Simulate a fresh visit: reload and make sure the gate now shows Unlock,
    // not Create.
    await page.reload();
    await expect(page.getByRole('button', { name: /^Unlock$/ })).toBeVisible();

    await page.getByLabel(/Username/).fill(DEMO_USER);
    await page.getByLabel(/^Password$/).fill(DEMO_PASS);
    await page.getByRole('button', { name: /^Unlock$/ }).click();

    await expect(page.getByRole('heading', { name: /Welcome, demo/ })).toBeVisible();
  });

  test('wrong password keeps the user on the gate', async ({ page }) => {
    await clearAppState(page);
    await page.getByLabel(/Username/).fill(DEMO_USER);
    await page.getByLabel(/^Password$/).fill(DEMO_PASS);
    await page.getByLabel(/Confirm Password/).fill(DEMO_PASS);
    await page.getByRole('button', { name: /Create Local Profile/i }).click();
    await expect(page.getByRole('heading', { name: /Welcome, demo/ })).toBeVisible();

    await page.reload();
    await page.getByLabel(/Username/).fill(DEMO_USER);
    await page.getByLabel(/^Password$/).fill('wrongpass1');
    await page.getByRole('button', { name: /^Unlock$/ }).click();
    // Still on the login gate — no Welcome heading.
    await expect(page.getByRole('heading', { name: /Welcome, demo/ })).toHaveCount(0);
  });
});
