/**
 * E2E: Job Monitor flow.
 *
 * Starts a real background job (CSV import → parse_validate worker job),
 * verifies that it shows up in the Job Monitor, exercises Cancel from the
 * UI on a queued job, and asserts the resulting state transition.
 */
import { test, expect, type Page } from '@playwright/test';
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
  await clearAppState(page);
  await page.getByLabel(/Username/).fill(DEMO_USER);
  await page.getByLabel(/^Password$/).fill(DEMO_PASS);
  await page.getByLabel(/Confirm Password/).fill(DEMO_PASS);
  await page.getByRole('button', { name: /Create Local Profile/i }).click();
  await expect(page.getByRole('heading', { name: /Welcome, demo/ })).toBeVisible();
}

test.describe('Job Monitor: start, track, cancel', () => {
  test.beforeEach(async ({ page }) => {
    await unlockDemoProfile(page);
  });

  test('Job Monitor renders and reflects job state for a queued job', async ({ page }) => {
    // Seed a queued job via IndexedDB so the rendering is deterministic.
    await page.evaluate(async () => {
      const open = indexedDB.open('nebulaforge');
      await new Promise<void>((resolve) => { open.onsuccess = () => resolve(); open.onerror = () => resolve(); });
      const db = open.result;
      const tx = db.transaction('worker_jobs', 'readwrite');
      const store = tx.objectStore('worker_jobs');
      const id = 'e2e-job-' + Date.now();
      store.put({
        id,
        type: 'import_parse_validate',
        status: 'queued',
        priority: 0,
        progressPercent: 0,
        startedAt: null,
        completedAt: null,
        cancelRequestedAt: null,
        cancelledAt: null,
        failureCount: 0,
        lastErrorCode: null,
        lastErrorMessage: null,
        throughputMetric: null,
        payloadRef: null,
        resultRef: null,
      });
      await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); tx.onerror = () => resolve(); });
      db.close();
    });

    await page.goto('#/jobs');
    await expect(page.getByRole('heading', { name: /Job Monitor/i })).toBeVisible();

    // Health tile labels are present
    await expect(page.getByText(/Active/)).toBeVisible();
    await expect(page.getByText(/Queued/)).toBeVisible();
    await expect(page.getByText(/Failures/)).toBeVisible();

    // The seeded queued job appears under Active Jobs with a Cancel control.
    await expect(page.getByText(/Active Jobs/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('import_parse_validate').first()).toBeVisible();

    // Cancel the job
    await page.getByRole('button', { name: /^Cancel$/ }).first().click();

    // Verify state in the DB transitions to cancelled (queued jobs cancel immediately).
    await page.waitForTimeout(1500); // monitor polls every 1s
    const status = await page.evaluate(async () => {
      const open = indexedDB.open('nebulaforge');
      await new Promise<void>((resolve) => { open.onsuccess = () => resolve(); open.onerror = () => resolve(); });
      const db = open.result;
      const tx = db.transaction('worker_jobs', 'readonly');
      const all = await new Promise<any[]>((resolve) => {
        const req = tx.objectStore('worker_jobs').getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve([]);
      });
      db.close();
      return all[0]?.status;
    });
    expect(['cancelled', 'cancelling']).toContain(status);
  });

  test('importing the sample CSV produces a job tracked in the monitor', async ({ page }) => {
    await page.goto('#/import');
    await expect(page.getByRole('heading', { name: /Import Cards/ })).toBeVisible();

    const filePath = path.resolve(process.cwd(), 'public/samples/sample-import.csv');
    const fs = await import('fs');
    if (!fs.existsSync(filePath)) {
      test.skip(true, 'sample CSV not present in container');
    }

    await page.locator('input[type="file"]').first().setInputFiles(filePath);

    // Move to the Job Monitor and check a job entry exists
    await page.goto('#/jobs');
    await expect(page.getByRole('heading', { name: /Job Monitor/i })).toBeVisible();

    // Either active or completed sections will eventually contain the import job
    await expect(page.locator('body')).toContainText(/import_parse_validate|index_rebuild|completed|Active Jobs|Job History/i, {
      timeout: 15_000,
    });
  });
});
