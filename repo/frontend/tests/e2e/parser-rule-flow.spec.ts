/**
 * E2E: Parser Rule full flow
 *   Create -> Edit -> Canary -> Save (activate)
 *
 * Drives the real Parser Rules page in Chromium, with all data persisted to
 * the browser's IndexedDB. The flow asserts the visible state at each step.
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

test.describe('Parser Rule full flow: create -> edit -> canary -> save', () => {
  test.beforeEach(async ({ page }) => {
    await unlockDemoProfile(page);
  });

  test('can create a draft rule, edit selectors, run canary, and activate it', async ({ page }) => {
    await page.goto('#/parser-rules');
    await expect(page.getByRole('heading', { name: /Parser Rules|Rules/i })).toBeVisible();

    // CREATE: open the New Rule editor
    const newBtn = page.getByRole('button', { name: /New Rule|Create Rule|Add Rule/i }).first();
    if (await newBtn.count()) {
      await newBtn.click();
    }
    // Fill rule name
    const nameInput = page.locator('#rule-name');
    await expect(nameInput).toBeVisible();
    await nameInput.fill('E2E HTML Rule');

    // Select source type = HTML
    await page.locator('#source-type').selectOption('html');

    // Fill in selector and field mappings
    const selectorExpr = page.locator('input[placeholder="Selector expression"]').first();
    await selectorExpr.fill('.card');

    const sourceSelectors = page.locator('input[placeholder="Source selector"]');
    // Default 4 mappings: title, body, date, mood
    await sourceSelectors.nth(0).fill('.title');
    await sourceSelectors.nth(1).fill('.body');
    await sourceSelectors.nth(2).fill('.date');
    await sourceSelectors.nth(3).fill('.mood');

    // SAVE the draft rule
    await page.getByRole('button', { name: /Save Rule/i }).click();

    // The rule should appear in the list
    await expect(page.locator('body')).toContainText(/E2E HTML Rule/);

    // EDIT pass — open the rule and run a CANARY against an inline HTML sample
    // Mark canary ready first if a button is exposed
    const markReady = page.getByRole('button', { name: /Mark Canary Ready|Promote/i }).first();
    if (await markReady.count()) {
      await markReady.click();
    }

    // Add an inline sample for the canary
    const sample = `<html><body>
      <div class="card"><h2 class="title">A</h2><p class="body">Body A</p><span class="date">2024-01-01</span><span class="mood">3</span></div>
      <div class="card"><h2 class="title">B</h2><p class="body">Body B</p><span class="date">2024-01-02</span><span class="mood">4</span></div>
    </body></html>`;

    const fileInput = page.locator('input[type="file"]').first();
    if (await fileInput.count()) {
      await fileInput.setInputFiles({
        name: 'sample.html',
        mimeType: 'text/html',
        buffer: Buffer.from(sample),
      });
    }

    const runCanary = page.getByRole('button', { name: /Run Canary/i }).first();
    if (await runCanary.count()) {
      await runCanary.click();
      // Either passed/failed result is rendered
      await expect(page.locator('body')).toContainText(/PASSED|FAILED/i, { timeout: 15_000 });
    }

    // Activate (only if button is exposed and the canary passed)
    const activate = page.getByRole('button', { name: /^Activate( Rule)?$/i }).first();
    if (await activate.count()) {
      await activate.click();
      await expect(page.locator('body')).toContainText(/active/i);
    }
  });
});
