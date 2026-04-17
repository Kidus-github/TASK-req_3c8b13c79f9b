import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SDK_EVENT_NAMES, type SDKEventName } from '$lib/types/sdk';

const here = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(here, '../..');

function read(rel: string): string {
  return readFileSync(path.join(frontendRoot, rel), 'utf8');
}

// Mirror the same stubs as sdk-embed.spec so we can instantiate the runtime.
vi.mock('three/addons/controls/OrbitControls.js', () => ({
  OrbitControls: class {
    enableDamping = false;
    update(): void {}
    dispose(): void {}
  },
}));

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();
  class FakeWebGLRenderer {
    domElement: HTMLCanvasElement;
    constructor({ canvas }: { canvas: HTMLCanvasElement }) { this.domElement = canvas; }
    setPixelRatio(): void {}
    setSize(): void {}
    render(): void {}
    dispose(): void {}
  }
  return { ...actual, WebGLRenderer: FakeWebGLRenderer as unknown as typeof actual.WebGLRenderer };
});

async function makeSdk() {
  const { embed } = await import('$lib/sdk/embed');
  const root = document.createElement('div');
  Object.defineProperty(root, 'clientWidth', { value: 640, configurable: true });
  Object.defineProperty(root, 'clientHeight', { value: 480, configurable: true });
  document.body.appendChild(root);
  return embed(root, {
    stars: [
      { id: 's1', x: 0, y: 0, z: 0, color: '#3b82f6', label: 'A' },
      { id: 's2', x: 5, y: 0, z: -2, color: '#22d3ee', label: 'B' },
    ],
    controls: true,
  });
}

describe('SDK contract parity: runtime ↔ types ↔ spec ↔ docs', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', () => 0 as unknown as number);
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });

  it('SDKEventName union covers exactly the events emit() is called with', () => {
    // Every event the runtime emits must be in the published union; every
    // event in the union must actually be emitted (so docs/spec don't advertise
    // events the runtime never fires).
    const embedSrc = read('src/lib/sdk/embed.ts');
    const emitMatches = [...embedSrc.matchAll(/this\.emit\(\s*'([a-zA-Z]+)'/g)].map(m => m[1]);
    const emittedEvents = new Set(emitMatches);

    expect(emittedEvents.size).toBeGreaterThan(0);

    // Every runtime-emitted event must appear in the typed union.
    for (const ev of emittedEvents) {
      expect(SDK_EVENT_NAMES).toContain(ev as SDKEventName);
    }
    // Every typed event must actually be emitted somewhere in the runtime.
    for (const ev of SDK_EVENT_NAMES) {
      expect(emittedEvents.has(ev)).toBe(true);
    }
  });

  it('OpenAPI event enum matches SDK_EVENT_NAMES exactly', () => {
    const spec = JSON.parse(read('public/sdk/openapi-v1.json'));
    const enumList: string[] = spec.paths['/on'].post.requestBody.content['application/json'].schema.properties.event.enum;
    expect(new Set(enumList)).toEqual(new Set(SDK_EVENT_NAMES));
  });

  it('SDK Docs page advertises exactly the runtime event set', () => {
    const docs = read('src/routes/SDKDocs.svelte');
    const eventsHeading = docs.match(/Events:[\s\S]*?<\/p>/);
    expect(eventsHeading).not.toBeNull();
    const section = eventsHeading![0];
    const found = [...section.matchAll(/<code>([a-zA-Z]+)<\/code>/g)].map(m => m[1]);

    expect(new Set(found)).toEqual(new Set(SDK_EVENT_NAMES));
  });

  it('SDK Docs and OpenAPI do not mention events the runtime never emits', () => {
    const removed = ['starHover', 'cameraChange'];
    const docs = read('src/routes/SDKDocs.svelte');
    const spec = read('public/sdk/openapi-v1.json');
    for (const ev of removed) {
      expect(docs).not.toContain(ev);
      expect(spec).not.toContain(ev);
    }
  });

  it('OpenAPI FeatureFilter schema matches the narrowed runtime surface', () => {
    const spec = JSON.parse(read('public/sdk/openapi-v1.json'));
    const props = spec.components.schemas.FeatureFilter.properties ?? {};
    expect(Object.keys(props).sort()).toEqual(['ids']);
    // Legacy fields must be gone.
    for (const stale of ['tag', 'colorHex', 'galaxyId', 'moodMin', 'moodMax']) {
      expect(props[stale]).toBeUndefined();
    }
  });

  it('runtime queryFeatures only honors `ids` (other keys are ignored but not rejected)', async () => {
    const sdk = await makeSdk();
    // Unsupported keys must not throw and must not affect results.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const all = (sdk as any).queryFeatures({ tag: 'anything', colorHex: '#ffffff' });
    expect(all.map((f: any) => f.id).sort()).toEqual(['s1', 's2']);

    const filtered = sdk.queryFeatures({ ids: ['s1'] });
    expect(filtered.map(f => f.id)).toEqual(['s1']);
  });

  it('on() handlers fire for every advertised event and return an unsubscribe', async () => {
    const sdk = await makeSdk();
    for (const ev of SDK_EVENT_NAMES) {
      const handler = vi.fn();
      const unsub = sdk.on(ev, handler);
      expect(typeof unsub).toBe('function');
      unsub();
    }
  });

  it('sample embed only references SDK methods the runtime actually supports', () => {
    const html = read('sdk/sample-embed.html');
    // Methods the sample calls must all exist on the runtime.
    const methodCalls = new Set(
      [...html.matchAll(/sdk\.(\w+)\s*\(/g)].map(m => m[1])
    );
    const supported = new Set([
      'highlightFeatures',
      'clearHighlights',
      'measureDistance',
      'queryFeatures',
      'setLayerVisibility',
      'getLayerVisibility',
      'listLayers',
      'measureArea',
      'startDrawing',
      'addDrawingPoint',
      'stopDrawing',
      'cancelDrawing',
      'getDrawingMode',
      'getDrawingPoints',
      'on',
      'destroy',
    ]);
    for (const call of methodCalls) expect(supported.has(call)).toBe(true);

    // Sample must not reference events the runtime never emits.
    expect(html).not.toContain('starHover');
    expect(html).not.toContain('cameraChange');
  });

  it('SDK spec version string matches the SDK docs and README references', () => {
    const spec = JSON.parse(read('public/sdk/openapi-v1.json'));
    const docs = read('src/routes/SDKDocs.svelte');
    const readme = readFileSync(path.resolve(frontendRoot, '..', 'README.md'), 'utf8');
    const checklist = read('tests/pwa-checklist.md');

    expect(spec.info.version).toBe('1.1.0');
    expect(docs).toContain("SDK_SPEC_VERSION = '1.1.0'");
    expect(readme).toContain('nebulaforge-sdk-v1.1.0.json');
    expect(checklist).toContain('nebulaforge-sdk-v1.1.0.json');
  });
});
