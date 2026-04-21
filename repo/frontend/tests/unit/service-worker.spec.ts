/**
 * Runtime tests for `public/service-worker.js`.
 *
 * The existing PWA coverage (`tests/unit/pwa-assets.spec.ts`) only verified
 * the file *exists* and contains certain strings. This suite actually
 * executes the real service-worker script against a hand-rolled Cache /
 * FetchEvent / Clients environment so every runtime path is exercised:
 *
 *   - install handler: opens the `nebulaforge-v1` cache and adds the full
 *     app shell; a single failing asset is swallowed (best-effort).
 *   - activate handler: purges every cache whose name is NOT the current
 *     version; `clients.claim()` is invoked.
 *   - fetch handler:
 *       * non-GET requests are bypassed;
 *       * cross-origin GETs are bypassed;
 *       * navigation requests use network-first and populate the cache;
 *       * navigation requests fall back to the cached index.html when the
 *         network throws;
 *       * static asset GETs use cache-first;
 *       * on cache miss, successful fetches are persisted to the cache;
 *       * non-200 responses are NOT persisted;
 *       * on network error with no cached copy, the handler yields the
 *         cached value (which is undefined — i.e. does not throw).
 *
 * The real script is evaluated via `new Function('self', scriptText)(fakeSelf)`
 * so the production file is the code under test — not a ported copy.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const swPath = resolve(__dirname, '../../public/service-worker.js');
const swScript = readFileSync(swPath, 'utf-8');

// -------------------- Fake Cache + CacheStorage --------------------

class FakeCache {
  store: Map<string, { resp: FakeResponse; body: string }> = new Map();
  constructor(private fetcher: (url: string) => Promise<FakeResponse>) {}

  async match(key: string | { url: string }): Promise<FakeResponse | undefined> {
    const url = typeof key === 'string' ? key : key.url;
    return this.store.get(url)?.resp;
  }

  async add(url: string): Promise<void> {
    const res = await this.fetcher(url);
    if (!res || !res.ok) throw new Error(`cache.add failed: ${url}`);
    this.store.set(url, { resp: res, body: res._body });
  }

  async put(key: string | { url: string }, resp: FakeResponse): Promise<void> {
    const url = typeof key === 'string' ? key : key.url;
    this.store.set(url, { resp, body: resp._body });
  }

  async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  keys(): string[] {
    return [...this.store.keys()];
  }
}

class FakeCacheStorage {
  caches: Map<string, FakeCache> = new Map();
  constructor(private fetcher: (url: string) => Promise<FakeResponse>) {}

  async open(name: string): Promise<FakeCache> {
    let c = this.caches.get(name);
    if (!c) {
      c = new FakeCache(this.fetcher);
      this.caches.set(name, c);
    }
    return c;
  }

  async keys(): Promise<string[]> {
    return [...this.caches.keys()];
  }

  async delete(name: string): Promise<boolean> {
    return this.caches.delete(name);
  }

  async match(key: string | { url: string }): Promise<FakeResponse | undefined> {
    const url = typeof key === 'string' ? key : key.url;
    for (const c of this.caches.values()) {
      const hit = await c.match(url);
      if (hit) return hit;
    }
    return undefined;
  }
}

// -------------------- Fake Request + Response + Event --------------------

class FakeResponse {
  status: number;
  ok: boolean;
  _body: string;
  constructor(body: string, status = 200) {
    this._body = body;
    this.status = status;
    this.ok = status >= 200 && status < 300;
  }
  clone(): FakeResponse {
    return new FakeResponse(this._body, this.status);
  }
}

interface FakeRequest {
  url: string;
  method: string;
  mode: 'navigate' | 'cors' | 'no-cors' | 'same-origin';
}

function req(url: string, opts: Partial<FakeRequest> = {}): FakeRequest {
  return {
    url,
    method: opts.method ?? 'GET',
    mode: opts.mode ?? 'cors',
  };
}

class FakeFetchEvent {
  type = 'fetch';
  request: FakeRequest;
  _respondWith: Promise<FakeResponse | undefined> | null = null;
  _waitUntil: Promise<unknown>[] = [];
  constructor(request: FakeRequest) {
    this.request = request;
  }
  respondWith(p: Promise<FakeResponse | undefined> | FakeResponse | undefined): void {
    this._respondWith = Promise.resolve(p as any);
  }
  waitUntil(p: Promise<unknown>): void {
    this._waitUntil.push(Promise.resolve(p));
  }
}

class FakeLifecycleEvent {
  type: string;
  _waitUntil: Promise<unknown>[] = [];
  constructor(type: string) {
    this.type = type;
  }
  waitUntil(p: Promise<unknown>): void {
    this._waitUntil.push(Promise.resolve(p));
  }
}

// -------------------- Self Harness --------------------

interface SwSelf {
  location: { origin: string };
  caches: FakeCacheStorage;
  addEventListener: (type: string, cb: (event: unknown) => void) => void;
  skipWaiting: () => void;
  clients: { claim: () => Promise<void> };
  fetch: ReturnType<typeof vi.fn>;
  _handlers: Record<string, (event: unknown) => void>;
  _skipWaitingCount: number;
  _claimCount: number;
}

function buildSelf(fetchImpl: (url: string) => Promise<FakeResponse>): SwSelf {
  const handlers: Record<string, (event: unknown) => void> = {};
  const fetchMock = vi.fn((req: FakeRequest | string) => {
    const url = typeof req === 'string' ? req : req.url;
    return fetchImpl(url);
  });
  const self: SwSelf = {
    location: { origin: 'http://localhost' },
    caches: new FakeCacheStorage((url) => fetchImpl(url)),
    addEventListener(type, cb) {
      handlers[type] = cb;
    },
    skipWaiting() {
      self._skipWaitingCount++;
    },
    clients: {
      async claim() {
        self._claimCount++;
      },
    },
    fetch: fetchMock,
    _handlers: handlers,
    _skipWaitingCount: 0,
    _claimCount: 0,
  };
  return self;
}

function loadSw(self: SwSelf): void {
  // Execute the real service-worker.js source against our harness. We must
  // also expose `caches` and `fetch` via closure variables, because the
  // script uses unqualified `caches.open` and `fetch`.
  // Using `new Function(...)(self, caches, fetch)` ensures the script's
  // global look-ups resolve to our fakes.
  const fn = new Function(
    'self',
    'caches',
    'fetch',
    'URL',
    `"use strict";\n${swScript}\n`,
  );
  fn(self, self.caches, self.fetch, URL);
}

// -------------------- Tests --------------------

let sw: SwSelf;

beforeEach(() => {
  // Default fetch impl: every shell URL succeeds with a dummy body.
  sw = buildSelf(async (url) => new FakeResponse(`body:${url}`, 200));
  loadSw(sw);
});

describe('service-worker install handler', () => {
  it('opens nebulaforge-v1 and populates every app-shell URL', async () => {
    const event = new FakeLifecycleEvent('install');
    sw._handlers.install!(event);
    await Promise.all(event._waitUntil);

    const cache = await sw.caches.open('nebulaforge-v1');
    const keys = cache.keys();
    // APP_SHELL defined in the script.
    expect(keys).toEqual(
      expect.arrayContaining([
        '/',
        '/index.html',
        '/manifest.webmanifest',
        '/favicon.svg',
        '/icons/icon-192.png',
        '/icons/icon-512.png',
        '/sdk/openapi-v1.json',
      ]),
    );
    expect(keys.length).toBe(7);
    expect(sw._skipWaitingCount).toBe(1);
  });

  it('swallows individual asset failures so install never aborts', async () => {
    const failing = '/icons/icon-192.png';
    sw = buildSelf(async (url) => {
      if (url === failing) throw new Error('missing asset');
      return new FakeResponse('ok', 200);
    });
    loadSw(sw);

    const event = new FakeLifecycleEvent('install');
    sw._handlers.install!(event);
    await expect(Promise.all(event._waitUntil)).resolves.toBeDefined();

    const cache = await sw.caches.open('nebulaforge-v1');
    expect(cache.keys()).not.toContain(failing);
    // But the other assets were still cached.
    expect(cache.keys()).toContain('/index.html');
  });
});

describe('service-worker activate handler', () => {
  it('deletes every cache whose name is not the current version and claims clients', async () => {
    // Seed two stale caches.
    await sw.caches.open('nebulaforge-v0');
    await sw.caches.open('some-other-cache');
    await sw.caches.open('nebulaforge-v1');

    const event = new FakeLifecycleEvent('activate');
    sw._handlers.activate!(event);
    await Promise.all(event._waitUntil);

    const remaining = await sw.caches.keys();
    expect(remaining).toEqual(['nebulaforge-v1']);
    expect(sw._claimCount).toBe(1);
  });

  it('is a no-op when only the current cache exists', async () => {
    await sw.caches.open('nebulaforge-v1');
    const event = new FakeLifecycleEvent('activate');
    sw._handlers.activate!(event);
    await Promise.all(event._waitUntil);
    expect(await sw.caches.keys()).toEqual(['nebulaforge-v1']);
  });
});

describe('service-worker fetch handler — bypass cases', () => {
  it('ignores non-GET requests (does not call respondWith)', () => {
    const event = new FakeFetchEvent(req('http://localhost/api', { method: 'POST' }));
    sw._handlers.fetch!(event);
    expect(event._respondWith).toBeNull();
  });

  it('ignores cross-origin GETs (does not call respondWith)', () => {
    const event = new FakeFetchEvent(req('http://other.example/foo'));
    sw._handlers.fetch!(event);
    expect(event._respondWith).toBeNull();
  });
});

describe('service-worker fetch handler — navigation requests (network-first)', () => {
  it('on successful network: serves the network response AND populates the cache', async () => {
    const fresh = new FakeResponse('<html>fresh</html>', 200);
    sw = buildSelf(async () => fresh);
    loadSw(sw);

    const event = new FakeFetchEvent(req('http://localhost/dashboard', { mode: 'navigate' }));
    sw._handlers.fetch!(event);

    const res = await event._respondWith!;
    expect(res).toBe(fresh);

    // Give the detached `caches.open(...).then(put)` a microtask to flush.
    await new Promise((r) => setTimeout(r, 5));
    const cache = await sw.caches.open('nebulaforge-v1');
    expect((await cache.match('http://localhost/dashboard'))?._body).toBe('<html>fresh</html>');
  });

  it('on network failure: falls back to the cached response for that URL', async () => {
    sw = buildSelf(async () => {
      throw new Error('offline');
    });
    loadSw(sw);

    // Seed the cache with an entry for this navigation URL.
    const cache = await sw.caches.open('nebulaforge-v1');
    const cached = new FakeResponse('<html>cached-dashboard</html>', 200);
    await cache.put('http://localhost/dashboard', cached);

    const event = new FakeFetchEvent(req('http://localhost/dashboard', { mode: 'navigate' }));
    sw._handlers.fetch!(event);

    const res = await event._respondWith!;
    expect(res?._body).toBe('<html>cached-dashboard</html>');
  });

  it('on network failure with no cached page: falls back to cached /index.html (offline shell)', async () => {
    // Seed /index.html but NOT the requested URL.
    sw = buildSelf(async () => {
      throw new Error('offline');
    });
    loadSw(sw);
    const cache = await sw.caches.open('nebulaforge-v1');
    await cache.put('/index.html', new FakeResponse('<html>shell</html>', 200));

    const event = new FakeFetchEvent(req('http://localhost/deep/link', { mode: 'navigate' }));
    sw._handlers.fetch!(event);

    const res = await event._respondWith!;
    expect(res?._body).toBe('<html>shell</html>');
  });
});

describe('service-worker fetch handler — static asset requests (cache-first)', () => {
  it('returns the cached copy without calling fetch when the asset is already cached', async () => {
    const cache = await sw.caches.open('nebulaforge-v1');
    const hit = new FakeResponse('cached-body', 200);
    await cache.put('http://localhost/style.css', hit);

    const event = new FakeFetchEvent(req('http://localhost/style.css'));
    sw._handlers.fetch!(event);

    const res = await event._respondWith!;
    expect(res).toBe(hit);
    expect(sw.fetch).not.toHaveBeenCalled();
  });

  it('on cache miss: fetches, returns the network response, and persists a 200 to the cache', async () => {
    const fresh = new FakeResponse('new-asset', 200);
    sw = buildSelf(async () => fresh);
    loadSw(sw);

    const event = new FakeFetchEvent(req('http://localhost/asset.js'));
    sw._handlers.fetch!(event);

    const res = await event._respondWith!;
    expect(res).toBe(fresh);
    expect(sw.fetch).toHaveBeenCalledTimes(1);
    await new Promise((r) => setTimeout(r, 5));
    const cache = await sw.caches.open('nebulaforge-v1');
    expect((await cache.match('http://localhost/asset.js'))?._body).toBe('new-asset');
  });

  it('on cache miss: does NOT cache non-200 responses', async () => {
    const notFound = new FakeResponse('nope', 404);
    sw = buildSelf(async () => notFound);
    loadSw(sw);

    const event = new FakeFetchEvent(req('http://localhost/missing.js'));
    sw._handlers.fetch!(event);
    const res = await event._respondWith!;
    expect(res).toBe(notFound);
    await new Promise((r) => setTimeout(r, 5));
    const cache = await sw.caches.open('nebulaforge-v1');
    expect(await cache.match('http://localhost/missing.js')).toBeUndefined();
  });

  it('on network error with no cached copy: yields undefined (graceful) — no crash', async () => {
    sw = buildSelf(async () => {
      throw new Error('offline');
    });
    loadSw(sw);

    const event = new FakeFetchEvent(req('http://localhost/unknown.js'));
    sw._handlers.fetch!(event);
    const res = await event._respondWith!;
    expect(res).toBeUndefined();
  });
});
