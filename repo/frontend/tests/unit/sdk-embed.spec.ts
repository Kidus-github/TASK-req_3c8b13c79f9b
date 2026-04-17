import { describe, it, expect, beforeEach, vi } from 'vitest';

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

type AnySDK = any;

async function makeSdk(): Promise<AnySDK> {
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

describe('StarMapSDK embed surface', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', () => 0 as unknown as number);
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });

  it('lists known layers and lets callers toggle visibility with real side effects', async () => {
    const sdk = await makeSdk();
    expect(sdk.listLayers()).toEqual(expect.arrayContaining(['stars', 'highlights', 'drawing']));
    expect(sdk.getLayerVisibility('stars')).toBe(true);

    const events: { layerId: string; visible: boolean; known: boolean }[] = [];
    sdk.on('layerChange', (p: any) => events.push(p));

    sdk.setLayerVisibility('stars', false);
    expect(sdk.getLayerVisibility('stars')).toBe(false);
    expect(events[events.length - 1]).toMatchObject({ layerId: 'stars', visible: false, known: true });

    sdk.setLayerVisibility('stars', true);
    expect(sdk.getLayerVisibility('stars')).toBe(true);

    sdk.setLayerVisibility('custom-layer', false);
    const custom = events.find(e => e.layerId === 'custom-layer')!;
    expect(custom.known).toBe(false);
  });

  it('drawing lifecycle captures points, emits events, and returns a final payload', async () => {
    const sdk = await makeSdk();
    const starts: any[] = [];
    const progress: any[] = [];
    const completes: any[] = [];
    sdk.on('drawStart', (p: any) => starts.push(p));
    sdk.on('drawProgress', (p: any) => progress.push(p));
    sdk.on('drawComplete', (p: any) => completes.push(p));

    sdk.startDrawing('line');
    expect(starts).toHaveLength(1);
    expect(sdk.getDrawingMode()).toBe('line');

    sdk.addDrawingPoint({ x: 0, y: 0, z: 0 });
    sdk.addDrawingPoint({ x: 3, y: 0, z: 4 });
    expect(progress).toHaveLength(2);
    expect(sdk.getDrawingPoints()).toHaveLength(2);

    const result = sdk.stopDrawing();
    expect(completes).toHaveLength(1);
    expect(result.mode).toBe('line');
    expect(result.points).toHaveLength(2);
    expect(result.measurement.value).toBeCloseTo(5, 5);
    expect(sdk.getDrawingMode()).toBeNull();
  });

  it('cancelDrawing clears state and emits drawCancelled', async () => {
    const sdk = await makeSdk();
    const cancelled: any[] = [];
    sdk.on('drawCancelled', (p: any) => cancelled.push(p));

    sdk.startDrawing('polygon');
    sdk.addDrawingPoint({ x: 0, y: 0, z: 0 });
    sdk.cancelDrawing();

    expect(cancelled).toEqual([{ mode: 'polygon' }]);
    expect(sdk.getDrawingMode()).toBeNull();
    expect(sdk.getDrawingPoints()).toEqual([]);
  });

  it('measureDistance and measureArea emit measureComplete with kind', async () => {
    const sdk = await makeSdk();
    const measurements: any[] = [];
    sdk.on('measureComplete', (p: any) => measurements.push(p));

    const d = sdk.measureDistance([{ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 4 }]);
    expect(d.value).toBeCloseTo(5, 5);
    expect(measurements[0].kind).toBe('distance');

    const a = sdk.measureArea([
      { x: 0, y: 0, z: 0 },
      { x: 4, y: 0, z: 0 },
      { x: 4, y: 0, z: 3 },
      { x: 0, y: 0, z: 3 },
    ]);
    expect(a.value).toBe(12);
    expect(measurements[1].kind).toBe('area');
  });

  it('queryFeatures filters by id and returns CardFeature-shaped entries', async () => {
    const sdk = await makeSdk();
    const all = sdk.queryFeatures({});
    expect(all.map((f: any) => f.id)).toEqual(['s1', 's2']);
    const one = sdk.queryFeatures({ ids: ['s2'] });
    expect(one).toHaveLength(1);
    expect(one[0].position).toEqual({ x: 5, y: 0, z: -2 });
  });
});
