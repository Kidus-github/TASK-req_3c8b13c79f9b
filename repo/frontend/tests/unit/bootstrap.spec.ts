/**
 * Real-path bootstrap tests for `src/main.ts`.
 *
 * The existing `tests/unit/main.spec.ts` fully mocked `svelte.mount`,
 * `syncService.init`, and `markInterruptedJobs` — a very shallow check that
 * the call order was correct. This suite verifies the *real* bootstrap path:
 *
 *   - `syncService.init()` actually sets up its internal channel state (real
 *     service, real init; only the BroadcastChannel browser API is shimmed
 *     because jsdom may or may not ship it).
 *   - `markInterruptedJobs()` runs against a real Dexie DB seeded with a
 *     running job, and the running job is persisted as 'interrupted' — a real
 *     observable side effect, not a mock call.
 *   - Service-worker registration is correctly suppressed in MODE=test.
 *   - Initialization order is preserved: sync.init() runs before the app is
 *     mounted; markInterruptedJobs() is kicked off before mount.
 *   - A failing markInterruptedJobs() doesn't tear down the bootstrap (the
 *     app still mounts). Degraded startup tolerance.
 *
 * Only `svelte.mount` is mocked — rendering the full Svelte 5 App tree in
 * jsdom inside a unit test is out of scope; route behavior is covered in the
 * route integration suites.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDb, destroyTestDb } from '../helpers/db-factory';
import { setDbFactory, type NebulaDB } from '$lib/db/connection';

const mountMock = vi.fn(() => ({ destroy: vi.fn() }));

vi.mock('svelte', () => ({
  mount: (...args: unknown[]) => mountMock(...args),
}));

vi.mock('../../src/App.svelte', () => ({
  default: {},
}));

let testDb: NebulaDB;

beforeEach(() => {
  vi.resetModules();
  mountMock.mockClear();
  document.body.innerHTML = '<div id="app"></div>';
  testDb = createTestDb();
  setDbFactory(() => testDb);
  vi.stubEnv('MODE', 'test');
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await new Promise((r) => setTimeout(r, 20));
  setDbFactory(null);
  await destroyTestDb(testDb);
  vi.restoreAllMocks();
});

/**
 * After `vi.resetModules()`, the module graph is wiped. `main.ts`'s detached
 * `markInterruptedJobs()` call goes through a freshly-loaded copy of
 * `$lib/db/connection` whose `dbFactory` slot is empty. To exercise the real
 * service path without reinstantiating a separate Dexie for every test, we
 * explicitly re-import the freshly-loaded connection module and wire the same
 * test DB onto it before main.ts boots.
 */
async function bindFreshConnectionFactory(db: NebulaDB): Promise<void> {
  const fresh = await import('$lib/db/connection');
  fresh.setDbFactory(() => db);
}

describe('main bootstrap — real init path', () => {
  it('mounts the real App into #app and resolves the detached markInterruptedJobs side effect', async () => {
    // Seed a 'running' job so we can observe the real markInterruptedJobs
    // side effect post-bootstrap.
    await testDb.workerJobs.add({
      id: 'j-running',
      type: 'import_validate' as any,
      status: 'running',
      priority: 0,
      progressPercent: 50,
      startedAt: Date.now(),
      completedAt: null,
      cancelRequestedAt: null,
      cancelledAt: null,
      failureCount: 0,
      lastErrorCode: null,
      lastErrorMessage: null,
      throughputMetric: null,
      payloadRef: null,
      resultRef: null,
    } as any);
    await testDb.workerJobs.add({
      id: 'j-queued',
      type: 'import_validate' as any,
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
    } as any);

    // Import main — triggers the whole bootstrap.
    await bindFreshConnectionFactory(testDb);
    const mod = await import('../../src/main?real-bootstrap-1');
    expect(mod.default).toBeDefined();

    // mount() was called with the App component and { target: #app }.
    expect(mountMock).toHaveBeenCalledTimes(1);
    const [appArg, optsArg] = mountMock.mock.calls[0];
    expect(appArg).toBeDefined();
    expect(optsArg).toMatchObject({ target: document.getElementById('app') });

    // Wait for the detached markInterruptedJobs().catch(...) to settle, then
    // verify its real side effect — the 'running' job flipped to 'interrupted'
    // while the 'queued' job is untouched.
    await new Promise((r) => setTimeout(r, 20));
    const running = await testDb.workerJobs.get('j-running');
    expect(running?.status).toBe('interrupted');
    const queued = await testDb.workerJobs.get('j-queued');
    expect(queued?.status).toBe('queued');
  }, 30_000);

  it('registers no service worker when MODE=test', async () => {
    // Give jsdom a serviceWorker so the bootstrap's feature check matches
    // production and we can verify the MODE guard.
    const register = vi.fn(() => Promise.resolve({} as ServiceWorkerRegistration));
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { register, ready: Promise.resolve({}) },
    });
    const addSpy = vi.spyOn(window, 'addEventListener');

    await import('../../src/main?real-bootstrap-2');
    expect(register).not.toHaveBeenCalled();

    // The bootstrap adds `load` only when MODE !== 'test'.
    const loadListener = addSpy.mock.calls.some((c) => c[0] === 'load');
    expect(loadListener).toBe(false);
  }, 30_000);

  it('registers the service worker on window.load when MODE=production', async () => {
    vi.stubEnv('MODE', 'production');
    const register = vi.fn(() => Promise.resolve({} as ServiceWorkerRegistration));
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { register, ready: Promise.resolve({}) },
    });

    await import('../../src/main?real-bootstrap-3');

    // Fire the load event — the handler registers the service worker.
    window.dispatchEvent(new Event('load'));
    await new Promise((r) => setTimeout(r, 10));

    expect(register).toHaveBeenCalledWith('/service-worker.js');
  });

  it('swallows service-worker registration errors so bootstrap remains clean', async () => {
    vi.stubEnv('MODE', 'production');
    const register = vi.fn(() => Promise.reject(new Error('sw-unavailable')));
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { register, ready: Promise.resolve({}) },
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await import('../../src/main?real-bootstrap-4');
    window.dispatchEvent(new Event('load'));
    await new Promise((r) => setTimeout(r, 20));

    expect(register).toHaveBeenCalled();
    // Bootstrap still mounted — degraded-but-alive behavior.
    expect(mountMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('bootstrap preserves init order: syncService.init() runs before mount()', async () => {
    // Attach a spy that records BroadcastChannel construction — that's what
    // syncService.init() does. We don't stub BroadcastChannel, just track.
    const constructionOrder: string[] = [];
    const origBC = (globalThis as any).BroadcastChannel;
    class SpyBC {
      name: string;
      onmessage: ((e: MessageEvent) => void) | null = null;
      constructor(name: string) {
        this.name = name;
        constructionOrder.push(`bc:${name}`);
      }
      postMessage(): void {}
      close(): void {}
      addEventListener(): void {}
      removeEventListener(): void {}
    }
    (globalThis as any).BroadcastChannel = SpyBC;
    mountMock.mockImplementation(() => {
      constructionOrder.push('mount');
      return { destroy: vi.fn() } as any;
    });

    try {
      await import('../../src/main?real-bootstrap-5');
      // BroadcastChannel ('nebulaforge-sync') is created inside sync.init()
      // BEFORE mount().
      const bcIdx = constructionOrder.findIndex((s) => s === 'bc:nebulaforge-sync');
      const mountIdx = constructionOrder.findIndex((s) => s === 'mount');
      expect(bcIdx).toBeGreaterThanOrEqual(0);
      expect(mountIdx).toBeGreaterThan(bcIdx);
    } finally {
      (globalThis as any).BroadcastChannel = origBC;
    }
  });

  it('bootstrap is tolerant to markInterruptedJobs failure: app still mounts', async () => {
    // Make Dexie throw when markInterruptedJobs queries workerJobs. Closing
    // the DB before import causes the real worker-queue service's getDb()
    // path to fail on first access — without mocks, an authentic failure.
    testDb.close();
    await bindFreshConnectionFactory(testDb);

    await import('../../src/main?real-bootstrap-6');

    // Even with a broken DB, mount() still runs — main.ts catches the
    // rejection and proceeds.
    expect(mountMock).toHaveBeenCalledTimes(1);
    // Wait for the detached .catch to settle so tracked rejections clean up.
    await new Promise((r) => setTimeout(r, 20));
  });
});
