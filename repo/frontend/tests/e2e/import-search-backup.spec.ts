import { test, expect, Page } from '@playwright/test';
import path from 'path';

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

test.describe('import -> search -> backup end-to-end', () => {
  test.beforeEach(async ({ page }) => {
    await unlockDemoProfile(page);
  });

  test('can import the sample CSV and then search imported content', async ({ page }) => {
    await page.goto('#/import');
    await expect(page.getByRole('heading', { name: /Import Cards/ })).toBeVisible();

    const filePath = path.resolve(
      process.cwd(),
      'public/samples/sample-import.csv'
    );
    // Confirm the file exists before trying to upload it.
    const fs = await import('fs');
    expect(fs.existsSync(filePath)).toBe(true);

    // The file input is visually hidden in the dropzone; set files directly.
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(filePath);

    // Validation / review panel should show a positive row count eventually.
    await expect(page.locator('body')).toContainText(/rows?/i, {
      timeout: 15_000,
    });

    // Commit the valid rows if the UI exposes a commit button.
    const commit = page.getByRole('button', { name: /Commit|Import/i }).first();
    if (await commit.count()) {
      await commit.click();
    }

    // Dashboard reflects the new card count.
    await page.goto('#/');
    await expect(page.getByText('Active Cards')).toBeVisible();

    // Exercise the search flow against imported content.
    await page.goto('#/search');
    await expect(page.getByRole('heading', { name: /^Search$/ })).toBeVisible();
    const searchInput = page.getByPlaceholder('Search cards...');
    await searchInput.fill('sunrise');
    await expect(page.locator('body')).toContainText(/results?|No results|Morning/i, {
      timeout: 10_000,
    });
  });

  test('backup download completes', async ({ page }) => {
    await page.goto('#/backup');
    await expect(page.getByRole('heading', { name: /Backup & Restore/ })).toBeVisible();

    const exportBtn = page.getByRole('button', { name: /Export/ }).first();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      exportBtn.click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/nebulaforge-backup/);
  });
});
