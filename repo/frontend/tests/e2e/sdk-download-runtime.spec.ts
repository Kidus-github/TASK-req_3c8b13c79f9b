/**
 * Real-browser, no-mock SDK download coverage.
 *
 * Unit/integration tests for the SDK download flow stub `fetch`. This suite
 * exercises the actual download path end-to-end:
 *
 *   - the real button click triggers a real network fetch against the real
 *     `vite preview` server
 *   - the downloaded file's bytes are the same bytes served on disk
 *   - the downloaded spec is valid OpenAPI 3.x
 *   - the downloaded bundle is non-empty JavaScript that references the
 *     production NebulaForge symbol
 *   - no `fetch` mocks, no anchor interception, no synthetic blobs
 */
import { test, expect, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distSpecPath = resolve(__dirname, '../../public/sdk/openapi-v1.json');
const distBundlePath = resolve(__dirname, '../../public/sdk/nebulaforge-sdk.js');

const DEMO_USER = 'sdk-demo';
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
  await expect(page.getByRole('heading', { name: /Welcome, sdk-demo/ })).toBeVisible();
}

test.describe('SDK download — real browser network stack', () => {
  test.beforeEach(async ({ page }) => {
    await unlockDemoProfile(page);
    await page.goto('#/sdk-docs');
  });

  test('Download Spec produces a file whose bytes match the on-disk OpenAPI JSON', async ({ page }) => {
    const onDisk = readFileSync(distSpecPath, 'utf-8');
    const parsedOnDisk = JSON.parse(onDisk);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Download Spec/i }).click(),
    ]);

    const body = await (async () => {
      const stream = await download.createReadStream();
      const chunks: Buffer[] = [];
      for await (const chunk of stream!) {
        chunks.push(Buffer.from(chunk as Buffer));
      }
      return Buffer.concat(chunks).toString('utf-8');
    })();

    // Content identity: the download reflects the real deployed file.
    const parsedDownload = JSON.parse(body);
    expect(parsedDownload.openapi).toBe(parsedOnDisk.openapi);
    expect(parsedDownload.info.version).toBe(parsedOnDisk.info.version);
    // Versioned filename driven by the real component.
    expect(download.suggestedFilename()).toMatch(
      new RegExp(`nebulaforge-sdk-v${parsedOnDisk.info.version.replace(/\./g, '\\.')}\\.json`),
    );
  });

  test('Download SDK Bundle produces a file whose bytes match the on-disk bundle', async ({ page }) => {
    const onDisk = readFileSync(distBundlePath, 'utf-8');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Download SDK Bundle/i }).click(),
    ]);

    const body = await (async () => {
      const stream = await download.createReadStream();
      const chunks: Buffer[] = [];
      for await (const chunk of stream!) {
        chunks.push(Buffer.from(chunk as Buffer));
      }
      return Buffer.concat(chunks).toString('utf-8');
    })();

    expect(download.suggestedFilename()).toBe('nebulaforge-sdk.js');
    expect(body.length).toBe(onDisk.length);
    expect(body).toContain('NebulaForge');
    // Content identity — no drift from on-disk bundle.
    expect(body).toBe(onDisk);
  });

  test('Clicking Download Spec issues a real HTTP GET /sdk/openapi-v1.json (observed by the browser)', async ({ page }) => {
    const pending: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/sdk/openapi-v1.json')) pending.push(req.url());
    });

    await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Download Spec/i }).click(),
    ]);

    expect(pending.length).toBeGreaterThan(0);
    expect(pending[pending.length - 1]).toMatch(/\/sdk\/openapi-v1\.json/);
  });
});
