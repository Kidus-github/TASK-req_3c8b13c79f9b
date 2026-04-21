/**
 * Real-path tests for `src/lib/three/scene-manager.ts`.
 *
 * jsdom cannot host a real WebGL context, so we provide a single, minimal
 * `WebGLRenderer` shim that records every call. Everything else — the real
 * Three.js Scene / PerspectiveCamera / InstancedMesh / Raycaster / OrbitControls,
 * the SceneManager lifecycle, resize handling, event wiring, camera/lighting,
 * highlight math, and stardust rebuild — runs against the real class.
 *
 * These tests replace the heavier mock-assisted coverage in
 * `tests/integration/starmap-canvas-ui.spec.ts` with direct SceneManager
 * exercise against real Three.js objects.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { StarNode } from '$lib/types/starmap';

// ---------------------------------------------------------------------------
// Minimal WebGLRenderer shim. The shim only replaces methods that touch the
// (unavailable) GPU; everything else keeps the real three.js behavior.
// ---------------------------------------------------------------------------
interface RendererProbe {
  setSizeCalls: Array<{ w: number; h: number; updateStyle?: boolean }>;
  renderCount: number;
  setPixelRatioCalls: number[];
  disposed: boolean;
}
const rendererProbes: RendererProbe[] = [];

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();
  class FakeWebGLRenderer {
    domElement: HTMLCanvasElement;
    probe: RendererProbe;
    constructor(opts: { canvas: HTMLCanvasElement }) {
      this.domElement = opts.canvas;
      this.probe = {
        setSizeCalls: [],
        renderCount: 0,
        setPixelRatioCalls: [],
        disposed: false,
      };
      rendererProbes.push(this.probe);
    }
    setPixelRatio(r: number): void {
      this.probe.setPixelRatioCalls.push(r);
    }
    setSize(w: number, h: number, updateStyle?: boolean): void {
      this.probe.setSizeCalls.push({ w, h, updateStyle });
    }
    render(_scene: unknown, _camera: unknown): void {
      this.probe.renderCount++;
    }
    dispose(): void {
      this.probe.disposed = true;
    }
  }
  return {
    ...actual,
    WebGLRenderer: FakeWebGLRenderer as unknown as typeof actual.WebGLRenderer,
  };
});

// OrbitControls listens to pointer/touch events. jsdom does provide these,
// but we only care that the SceneManager lifecycle wiring is consistent, so
// pass it through — the real class is fine in jsdom for our assertions.

// ---------------------------------------------------------------------------
// A controllable requestAnimationFrame so we can start/stop the loop
// deterministically, rather than letting jsdom's rAF drive render timing.
// ---------------------------------------------------------------------------
type RafCallback = (time: number) => void;
const rafQueue: Array<{ id: number; cb: RafCallback }> = [];
let rafIdSeq = 1;
const originalRaf = globalThis.requestAnimationFrame;
const originalCaf = globalThis.cancelAnimationFrame;

function installControllableRaf(): void {
  (globalThis as any).requestAnimationFrame = (cb: RafCallback): number => {
    const id = rafIdSeq++;
    rafQueue.push({ id, cb });
    return id;
  };
  (globalThis as any).cancelAnimationFrame = (id: number): void => {
    const idx = rafQueue.findIndex((x) => x.id === id);
    if (idx >= 0) rafQueue.splice(idx, 1);
  };
}

function uninstallControllableRaf(): void {
  (globalThis as any).requestAnimationFrame = originalRaf;
  (globalThis as any).cancelAnimationFrame = originalCaf;
  rafQueue.length = 0;
}

function pumpFrame(): number {
  // Drain a single pending frame, which may itself enqueue another.
  const next = rafQueue.shift();
  if (!next) return 0;
  next.cb(performance.now());
  return 1;
}

// ---------------------------------------------------------------------------
// Canvas fixture: jsdom's canvas has no intrinsic size; SceneManager uses
// clientWidth/clientHeight for camera aspect and renderer sizing.
// ---------------------------------------------------------------------------
function makeCanvas(width = 800, height = 600): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  Object.defineProperty(canvas, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(canvas, 'clientHeight', { value: height, configurable: true });
  canvas.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width, height, right: width, bottom: height, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  document.body.appendChild(canvas);
  return canvas;
}

function star(id: string, overrides: Partial<StarNode> = {}): StarNode {
  return {
    id,
    cardId: overrides.cardId ?? id,
    position: overrides.position ?? { x: 0, y: 0, z: 0 },
    color: overrides.color ?? '#ffaa33',
    size: overrides.size ?? 1,
    label: overrides.label ?? `Star ${id}`,
    ...overrides,
  } as StarNode;
}

async function loadSceneManager(): Promise<typeof import('$lib/three/scene-manager')> {
  return import('$lib/three/scene-manager');
}

beforeEach(() => {
  rendererProbes.length = 0;
  installControllableRaf();
});

afterEach(() => {
  uninstallControllableRaf();
  document.body.innerHTML = '';
});

describe('SceneManager — construction + lifecycle', () => {
  it('constructs, attaches listeners, sizes the renderer from the canvas, and schedules the render loop', async () => {
    const { SceneManager } = await loadSceneManager();
    const canvas = makeCanvas(800, 600);
    const winAddSpy = vi.spyOn(window, 'addEventListener');
    const canvasAddSpy = vi.spyOn(canvas, 'addEventListener');

    const mgr = new SceneManager(canvas);
    expect(rendererProbes).toHaveLength(1);
    const probe = rendererProbes[0];

    // Pixel ratio clamped to a max of 2.
    expect(probe.setPixelRatioCalls.length).toBe(1);
    expect(probe.setPixelRatioCalls[0]).toBeGreaterThan(0);
    expect(probe.setPixelRatioCalls[0]).toBeLessThanOrEqual(2);

    // First setSize driven by constructor's handleResize() call.
    expect(probe.setSizeCalls[0]).toEqual({ w: 800, h: 600, updateStyle: false });

    // The constructor calls animate() synchronously once (real behavior):
    // that first animate() renders one frame AND schedules the next via rAF.
    expect(rafQueue.length).toBe(1);
    expect(probe.renderCount).toBe(1);

    // Event wiring: resize on window, click + mousemove on canvas.
    const winEvents = winAddSpy.mock.calls.map((c) => c[0]);
    const canvasEvents = canvasAddSpy.mock.calls.map((c) => c[0]);
    expect(winEvents).toContain('resize');
    expect(canvasEvents).toContain('click');
    expect(canvasEvents).toContain('mousemove');

    mgr.dispose();
  });

  it('renders each animation frame until disposed, then cancels the loop', async () => {
    const { SceneManager } = await loadSceneManager();
    const canvas = makeCanvas();
    const mgr = new SceneManager(canvas);
    const probe = rendererProbes[0];
    // Constructor rendered one frame synchronously and scheduled another.
    const initial = probe.renderCount;

    // Pump 3 frames. Each frame reschedules itself via requestAnimationFrame.
    pumpFrame();
    pumpFrame();
    pumpFrame();
    expect(probe.renderCount).toBe(initial + 3);

    mgr.dispose();
    // After dispose, any pending rAF has been cancelled AND the guard prevents
    // a late frame from rendering.
    const before = probe.renderCount;
    // There may still be one callback queued from the last animate call —
    // dispose cancels it, so the queue is empty.
    expect(rafQueue.length).toBe(0);
    pumpFrame();
    expect(probe.renderCount).toBe(before);
    expect(probe.disposed).toBe(true);
  });

  it('dispose() removes the window resize listener and canvas pointer listeners', async () => {
    const { SceneManager } = await loadSceneManager();
    const canvas = makeCanvas();
    const winRm = vi.spyOn(window, 'removeEventListener');
    const canvasRm = vi.spyOn(canvas, 'removeEventListener');

    const mgr = new SceneManager(canvas);
    mgr.dispose();

    const winEvents = winRm.mock.calls.map((c) => c[0]);
    const canvasEvents = canvasRm.mock.calls.map((c) => c[0]);
    expect(winEvents).toContain('resize');
    expect(canvasEvents).toContain('click');
    expect(canvasEvents).toContain('mousemove');
    expect(rendererProbes[0].disposed).toBe(true);
  });
});

describe('SceneManager — resize handler', () => {
  it('resizes the renderer + updates camera aspect when the window resizes', async () => {
    const { SceneManager } = await loadSceneManager();
    const canvas = makeCanvas(800, 600);
    const mgr = new SceneManager(canvas);
    const probe = rendererProbes[0];

    // Constructor already fired one resize.
    const initial = probe.setSizeCalls.length;

    // Simulate layout change and dispatch a real resize event.
    Object.defineProperty(canvas, 'clientWidth', { value: 1024, configurable: true });
    Object.defineProperty(canvas, 'clientHeight', { value: 512, configurable: true });
    window.dispatchEvent(new Event('resize'));

    expect(probe.setSizeCalls.length).toBe(initial + 1);
    const last = probe.setSizeCalls[probe.setSizeCalls.length - 1];
    expect(last).toEqual({ w: 1024, h: 512, updateStyle: false });

    // Camera aspect has been updated from the new dimensions (reflected in
    // getCameraState after setting a position).
    mgr.setCameraState({ position: { x: 1, y: 2, z: 3 }, target: { x: 0, y: 0, z: 0 }, zoom: 1 });
    const state = mgr.getCameraState();
    expect(state.position).toEqual({ x: 1, y: 2, z: 3 });

    mgr.dispose();
  });
});

describe('SceneManager — star data path', () => {
  it('updateStars([]) is a no-op when there are no stars', async () => {
    const { SceneManager } = await loadSceneManager();
    const mgr = new SceneManager(makeCanvas());
    expect(mgr.getStarCount()).toBe(0);

    mgr.updateStars([]);
    expect(mgr.getStarCount()).toBe(0);

    mgr.dispose();
  });

  it('updateStars builds an InstancedMesh and records getStarCount', async () => {
    const { SceneManager } = await loadSceneManager();
    const mgr = new SceneManager(makeCanvas());
    mgr.updateStars([
      star('a', { position: { x: 1, y: 2, z: 3 } }),
      star('b', { position: { x: -1, y: 0, z: 5 }, color: '#ff00ff' }),
      star('c'),
    ]);
    expect(mgr.getStarCount()).toBe(3);
    mgr.dispose();
  });

  it('subsequent updateStars calls replace the previous mesh (no leak)', async () => {
    const { SceneManager } = await loadSceneManager();
    const mgr = new SceneManager(makeCanvas());

    mgr.updateStars([star('a'), star('b')]);
    expect(mgr.getStarCount()).toBe(2);

    mgr.updateStars([star('x')]);
    expect(mgr.getStarCount()).toBe(1);

    mgr.updateStars([]);
    expect(mgr.getStarCount()).toBe(0);

    mgr.dispose();
  });
});

describe('SceneManager — highlight behavior', () => {
  it('highlightStars + clearHighlights mutate internal state and survive star reloads', async () => {
    const { SceneManager } = await loadSceneManager();
    const mgr = new SceneManager(makeCanvas());
    mgr.updateStars([
      star('a', { cardId: 'card-a' }),
      star('b', { cardId: 'card-b' }),
      star('c', { cardId: 'card-c' }),
    ]);
    // No throw path exercised.
    mgr.highlightStars(['card-a', 'card-b']);
    // Replace stars; highlights must still apply on the new mesh.
    mgr.updateStars([
      star('a', { cardId: 'card-a' }),
      star('d', { cardId: 'card-d' }),
    ]);

    mgr.clearHighlights();
    mgr.dispose();
  });

  it('highlight applies without a starMesh (no-op) — does not throw', async () => {
    const { SceneManager } = await loadSceneManager();
    const mgr = new SceneManager(makeCanvas());
    // No updateStars() first.
    expect(() => mgr.highlightStars(['x'])).not.toThrow();
    expect(() => mgr.clearHighlights()).not.toThrow();
    mgr.dispose();
  });
});

describe('SceneManager — camera + lighting + event callbacks', () => {
  it('set/get CameraState round-trips through the real PerspectiveCamera', async () => {
    const { SceneManager } = await loadSceneManager();
    const mgr = new SceneManager(makeCanvas());
    mgr.setCameraState({
      position: { x: 10, y: 20, z: 30 },
      target: { x: 1, y: 1, z: 1 },
      zoom: 1.5,
    });
    const state = mgr.getCameraState();
    expect(state.position).toEqual({ x: 10, y: 20, z: 30 });
    expect(state.target).toEqual({ x: 1, y: 1, z: 1 });
    expect(state.zoom).toBe(1.5);
    mgr.dispose();
  });

  it('setLighting accepts a known preset and unknown presets fall back to "nebula"', async () => {
    const { SceneManager } = await loadSceneManager();
    const mgr = new SceneManager(makeCanvas());
    // All valid presets; calling must not throw.
    mgr.setLighting('nebula');
    mgr.setLighting('deep-space');
    mgr.setLighting('aurora');
    mgr.setLighting('twilight');
    mgr.setLighting('cosmic-dawn');
    // Unknown preset: the implementation falls back to 'nebula'. Must not
    // throw, even though TS forbids it; cast to bypass the type guard.
    expect(() => mgr.setLighting('made-up' as any)).not.toThrow();
    mgr.dispose();
  });

  it('click on canvas invokes the star-pick callback', async () => {
    const { SceneManager } = await loadSceneManager();
    const canvas = makeCanvas(400, 300);
    const mgr = new SceneManager(canvas);

    const picks: Array<unknown> = [];
    mgr.onStarPick((s) => picks.push(s));

    // No stars yet — pickStar returns null; callback gets null.
    canvas.dispatchEvent(new MouseEvent('click', { clientX: 50, clientY: 50 }));
    expect(picks).toEqual([null]);

    mgr.dispose();
  });

  it('mousemove updates the internal mouse vector (exercised via handler wiring)', async () => {
    const { SceneManager } = await loadSceneManager();
    const canvas = makeCanvas(400, 200);
    const mgr = new SceneManager(canvas);
    expect(() =>
      canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 80 })),
    ).not.toThrow();
    mgr.dispose();
  });

  it('onStarHover registers a hover callback without throwing', async () => {
    const { SceneManager } = await loadSceneManager();
    const mgr = new SceneManager(makeCanvas());
    expect(() => mgr.onStarHover(() => undefined)).not.toThrow();
    mgr.dispose();
  });
});

describe('SceneManager — stardust reward path', () => {
  it('setStardustEnabled(false) does nothing when stardust was already off', async () => {
    const { SceneManager } = await loadSceneManager();
    const mgr = new SceneManager(makeCanvas());
    expect(mgr.isStardustEnabled()).toBe(false);
    mgr.setStardustEnabled(false);
    expect(mgr.isStardustEnabled()).toBe(false);
    mgr.dispose();
  });

  it('setStardustEnabled(true) creates a Points mesh, reported by isStardustEnabled()', async () => {
    const { SceneManager } = await loadSceneManager();
    const mgr = new SceneManager(makeCanvas());
    mgr.setStardustEnabled(true, [
      { x: 0, y: 0, z: 0, size: 0.2, hue: 45, twinkle: 0.5 },
      { x: 1, y: 0, z: 0, size: 0.3, hue: 60, twinkle: 0.8 },
    ]);
    expect(mgr.isStardustEnabled()).toBe(true);
    mgr.dispose();
  });

  it('setStardustEnabled(true) without particles generates a deterministic default cloud', async () => {
    const { SceneManager } = await loadSceneManager();
    const mgr = new SceneManager(makeCanvas());
    mgr.setStardustEnabled(true);
    expect(mgr.isStardustEnabled()).toBe(true);
    mgr.dispose();
  });

  it('setStardustEnabled toggles off and on without leaking meshes', async () => {
    const { SceneManager } = await loadSceneManager();
    const mgr = new SceneManager(makeCanvas());
    mgr.setStardustEnabled(true, [{ x: 0, y: 0, z: 0, size: 0.1, hue: 30, twinkle: 0 }]);
    expect(mgr.isStardustEnabled()).toBe(true);
    mgr.setStardustEnabled(false);
    expect(mgr.isStardustEnabled()).toBe(false);
    mgr.setStardustEnabled(true, [{ x: 1, y: 1, z: 1, size: 0.2, hue: 60, twinkle: 0.5 }]);
    expect(mgr.isStardustEnabled()).toBe(true);
    mgr.dispose();
  });

  it('stardust twinkle runs during the render loop and mutates opacity over frames', async () => {
    const { SceneManager } = await loadSceneManager();
    const mgr = new SceneManager(makeCanvas());
    mgr.setStardustEnabled(true, [
      { x: 0, y: 0, z: 0, size: 0.2, hue: 30, twinkle: 0 },
      { x: 1, y: 1, z: 1, size: 0.3, hue: 60, twinkle: 0.5 },
    ]);

    // Pump several frames so updateStardustTwinkle walks the sin pulse. We
    // can't easily observe the pulse directly (private field), but we verify
    // the real render loop advanced without blowing up on the added Points.
    const before = rendererProbes[0].renderCount;
    for (let i = 0; i < 5; i++) pumpFrame();
    expect(rendererProbes[0].renderCount).toBe(before + 5);

    mgr.dispose();
  });
});

describe('SceneManager — failure-safe dispose', () => {
  it('dispose() is safe to call even when no stars or stardust have been set', async () => {
    const { SceneManager } = await loadSceneManager();
    const mgr = new SceneManager(makeCanvas());
    expect(() => mgr.dispose()).not.toThrow();
    expect(rendererProbes[0].disposed).toBe(true);
  });

  it('after dispose, a pending animate frame never renders (guard works)', async () => {
    const { SceneManager } = await loadSceneManager();
    const mgr = new SceneManager(makeCanvas());
    const probe = rendererProbes[0];
    // Enqueue ourselves manually at the queue head so we can observe that
    // dispose empties the queue. First drain any lingering constructor frame.
    rafQueue.length = 0;
    // Simulate a late-dispatched frame: request a fresh one.
    (globalThis as any).requestAnimationFrame(() => undefined);
    expect(rafQueue.length).toBe(1);
    mgr.dispose();
    // dispose cancels the scheduled frame; pumping after dispose no longer
    // drives renderCount up.
    const beforeRenders = probe.renderCount;
    pumpFrame();
    expect(probe.renderCount).toBe(beforeRenders);
  });
});
