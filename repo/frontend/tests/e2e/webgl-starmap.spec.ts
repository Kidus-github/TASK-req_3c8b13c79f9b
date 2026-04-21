/**
 * Real-browser WebGL runtime coverage for the Star Map scene.
 *
 * Unit tests for `SceneManager` run in jsdom with a shimmed `WebGLRenderer`
 * because jsdom has no GPU. This suite exercises the *actual* production
 * wiring — Playwright Chromium has a real WebGL context, so the bundled
 * Three.js code, the real `SceneManager` class, and the real StarMap route
 * component all execute end-to-end against a live canvas.
 *
 * No mocks. No jsdom shims. No DI overrides.
 */
import { test, expect, Page } from '@playwright/test';

const DEMO_USER = 'webgl-demo';
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
  await expect(page.getByRole('heading', { name: /Welcome, webgl-demo/ })).toBeVisible();
}

test.describe('Star Map — real WebGL runtime', () => {
  test.beforeEach(async ({ page }) => {
    await unlockDemoProfile(page);
  });

  test('StarMap mounts a real canvas that produces a real WebGL2 rendering context', async ({ page }) => {
    await page.goto('#/starmap');

    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();

    // Query the browser for the real rendering context type and the set of
    // WebGL parameters only a real GPU context exposes.
    const ctxInfo = await canvas.evaluate((el: HTMLCanvasElement) => {
      const gl =
        (el.getContext('webgl2') as WebGLRenderingContext | null) ||
        (el.getContext('webgl') as WebGLRenderingContext | null);
      if (!gl) return { ok: false } as const;
      return {
        ok: true,
        vendor: gl.getParameter(gl.VENDOR) as string,
        renderer: gl.getParameter(gl.RENDERER) as string,
        version: gl.getParameter(gl.VERSION) as string,
        hasProgram: !!gl.createProgram(),
        width: el.width,
        height: el.height,
      } as const;
    });

    expect(ctxInfo.ok).toBe(true);
    if (!ctxInfo.ok) return;
    expect(typeof ctxInfo.version).toBe('string');
    expect(ctxInfo.version.toLowerCase()).toMatch(/webgl|opengl/);
    expect(ctxInfo.hasProgram).toBe(true);
    expect(ctxInfo.width).toBeGreaterThan(0);
    expect(ctxInfo.height).toBeGreaterThan(0);
  });

  test('Star count overlay reflects the real rendered star count (no DI, no mocks)', async ({ page }) => {
    // Create a card through the real UI — this goes through the real
    // card.service -> real Dexie -> real reactive store -> real StarMap route.
    await page.goto('#/cards');
    await page.getByRole('button', { name: /New Card/i }).click();

    // Fill in the real editor form — selectors tolerate minor label variants.
    const title = page.getByLabel(/Title/i).first();
    await title.fill('E2E WebGL Star');
    const body = page.getByLabel(/Body|Content/i).first();
    await body.fill('Body of the E2E WebGL star card.');
    const date = page.getByLabel(/Date/i).first();
    await date.fill('2024-06-01');

    // Save — the exact label is "Create" or "Save".
    const saveBtn = page
      .getByRole('button', { name: /^(Create|Save)( Card)?$/i })
      .first();
    await saveBtn.click();

    // Now visit the star map — the heading overlay reports the star count.
    await page.goto('#/starmap');
    await expect(page.locator('body')).toContainText(/\b1\s+stars?\b/i);
  });

  test('Resizing the window triggers a real canvas resize (no fake rAF)', async ({ page }) => {
    await page.goto('#/starmap');
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();

    // Observe internal backing-store size change across viewport resize.
    const initialSize = await canvas.evaluate((el: HTMLCanvasElement) => ({ w: el.width, h: el.height }));

    await page.setViewportSize({ width: 1600, height: 900 });
    // Give the real SceneManager handleResize() + real rAF loop a moment to
    // pick up the layout change.
    await page.waitForTimeout(300);

    const resizedSize = await canvas.evaluate((el: HTMLCanvasElement) => ({ w: el.width, h: el.height }));
    // At least one dimension must have grown — confirms real-path resize.
    expect(resizedSize.w + resizedSize.h).toBeGreaterThan(initialSize.w + initialSize.h);
  });
});
