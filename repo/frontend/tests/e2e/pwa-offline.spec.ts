/**
 * Real-browser PWA runtime coverage.
 *
 * Unit tests cover the service-worker script's handler logic in isolation.
 * This suite exercises the *actual* browser Service Worker lifecycle against
 * the production bundle served by `vite preview`:
 *
 *   - the page registers the service worker at runtime
 *   - the service worker activates and controls the page
 *   - the service worker populates its cache via the real Cache API
 *   - after going fully offline, the app shell still loads (cache-first)
 *   - after going fully offline, cached static assets (manifest, OpenAPI
 *     spec) still return 200
 */
import { test, expect, Page } from '@playwright/test';

async function waitForActiveServiceWorker(page: Page, timeoutMs = 15_000): Promise<void> {
  // Wait until navigator.serviceWorker.controller is set AND the registration
  // has an active worker. First load isn't controlled until reload, so we
  // reload once the registration is ready.
  await page.waitForFunction(
    async () => {
      if (!('serviceWorker' in navigator)) return false;
      const reg = await navigator.serviceWorker.getRegistration();
      return !!reg && !!reg.active && reg.active.state === 'activated';
    },
    null,
    { timeout: timeoutMs },
  );
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, {
    timeout: timeoutMs,
  });
}

test.describe('PWA — real Service Worker runtime', () => {
  test('registers a service worker and populates the app-shell cache', async ({ page }) => {
    await page.goto('/');
    await waitForActiveServiceWorker(page);

    const cacheState = await page.evaluate(async () => {
      const names = await caches.keys();
      const current = names.find((n) => n.startsWith('nebulaforge-'));
      if (!current) return { names, keys: [] as string[] };
      const c = await caches.open(current);
      const reqs = await c.keys();
      return { names, current, keys: reqs.map((r) => new URL(r.url).pathname) };
    });

    expect(cacheState.names.some((n) => n.startsWith('nebulaforge-'))).toBe(true);
    // The app shell cache includes at least the known shell entries.
    expect(cacheState.keys).toEqual(
      expect.arrayContaining(['/', '/index.html', '/manifest.webmanifest']),
    );
  });

  test('after going offline, the app shell still serves 200 (cache-first fallback)', async ({ page, context }) => {
    await page.goto('/');
    await waitForActiveServiceWorker(page);

    // Warm the runtime cache by visiting a couple of routes so their HTML
    // and assets are persisted.
    await page.goto('#/cards');
    await page.waitForLoadState('networkidle');

    await context.setOffline(true);
    try {
      const resp = await page.goto('/');
      expect(resp, 'offline navigation returned a response').not.toBeNull();
      expect(resp!.status()).toBe(200);
      // The body still contains the app shell.
      const html = await page.content();
      expect(html).toContain('<div id="app">');
    } finally {
      await context.setOffline(false);
    }
  });

  test('after going offline, cached static assets (manifest, OpenAPI spec) still return 200', async ({ page, context, request }) => {
    await page.goto('/');
    await waitForActiveServiceWorker(page);

    // Force the service worker to serve these paths by fetching through the
    // controlled page, which warms them into the runtime cache.
    await page.evaluate(async () => {
      await Promise.all([
        fetch('/manifest.webmanifest').then((r) => r.blob()),
        fetch('/sdk/openapi-v1.json').then((r) => r.blob()),
      ]);
    });

    await context.setOffline(true);
    try {
      const results = await page.evaluate(async () => {
        async function probe(url: string) {
          try {
            const r = await fetch(url);
            return { ok: r.ok, status: r.status };
          } catch (e) {
            return { ok: false, status: 0, error: String(e) };
          }
        }
        return {
          manifest: await probe('/manifest.webmanifest'),
          spec: await probe('/sdk/openapi-v1.json'),
        };
      });

      expect(results.manifest.status).toBe(200);
      expect(results.spec.status).toBe(200);
    } finally {
      await context.setOffline(false);
    }
  });
});
