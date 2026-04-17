/**
 * E2E: Backup full round-trip.
 *
 * 1. Create a card.
 * 2. Export a backup.
 * 3. Wipe IndexedDB.
 * 4. Re-create the demo profile.
 * 5. Restore from the captured backup.
 * 6. Verify the original card reappears (data integrity check).
 */
import { test, expect, type Page } from '@playwright/test';

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
        (d) => new Promise<void>((resolve) => {
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
  await page.getByLabel(/Username/).fill(DEMO_USER);
  await page.getByLabel(/^Password$/).fill(DEMO_PASS);
  await page.getByLabel(/Confirm Password/).fill(DEMO_PASS);
  await page.getByRole('button', { name: /Create Local Profile/i }).click();
  await expect(page.getByRole('heading', { name: /Welcome, demo/ })).toBeVisible();
}

test.describe('Backup full round-trip', () => {
  test('export -> wipe -> restore preserves the original card', async ({ page }) => {
    await clearAppState(page);
    await unlockDemoProfile(page);

    // Step 1: create a card
    await page.goto('#/cards');
    await page.getByRole('button', { name: /New Card/i }).click();
    await page.locator('#card-title').fill('Backup Roundtrip Card');
    await page.locator('#card-body').fill('Original body for roundtrip');
    await page.locator('#card-mood').fill('4');
    await page.getByRole('button', { name: /^Save$/i }).click();
    await expect(page.locator('body')).toContainText(/Backup Roundtrip Card/);

    // Step 2: export a backup file
    await page.goto('#/backup');
    await expect(page.getByRole('heading', { name: /Backup & Restore/ })).toBeVisible();
    const exportBtn = page.getByRole('button', { name: /^Export Backup$/ }).first();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      exportBtn.click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/nebulaforge-backup/);
    const filePath = await download.path();
    expect(filePath).toBeTruthy();

    // Step 3: wipe everything (simulating a fresh device)
    await clearAppState(page);

    // Step 4: re-register the demo profile
    await unlockDemoProfile(page);

    // Step 5: import the backup file
    await page.goto('#/backup');
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(filePath as string);
    await expect(page.getByText(/Backup validated successfully/i)).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: /^Restore$/ }).click();
    await expect(page.getByText(/Restore complete/i)).toBeVisible({ timeout: 10_000 });

    // Step 6: confirm the original card is present
    await page.goto('#/cards');
    await expect(page.locator('body')).toContainText(/Backup Roundtrip Card/, { timeout: 10_000 });
  });
});
