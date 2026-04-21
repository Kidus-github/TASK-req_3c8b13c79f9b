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

test.describe('SDK Docs download flow', () => {
  test.beforeEach(async ({ page }) => {
    await unlockDemoProfile(page);
    await page.goto('#/sdk-docs');
  });

  test('serves the OpenAPI spec under /sdk/openapi-v1.json', async ({ page, request }) => {
    const res = await request.get('/sdk/openapi-v1.json');
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.info ?? json.openapi ?? json.swagger).toBeTruthy();
  });

  test('serves the SDK bundle under /sdk/nebulaforge-sdk.js with a JS content-type and a NebulaForge-exporting body', async ({ request }) => {
    const res = await request.get('/sdk/nebulaforge-sdk.js');
    expect(res.status()).toBe(200);
    const ct = res.headers()['content-type'] ?? '';
    expect(ct).toMatch(/javascript|ecmascript/i);
    const body = await res.text();
    expect(body.length).toBeGreaterThan(0);
    expect(body).toMatch(/NebulaForge/);
  });

  test('Download Spec triggers a file download', async ({ page }) => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Download Spec/i }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/nebulaforge-sdk-v\d+\.\d+\.\d+\.json/);
  });

  test('Download SDK Bundle triggers a file download', async ({ page }) => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Download SDK Bundle/i }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/nebulaforge-sdk\.js/);
  });
});
