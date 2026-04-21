import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

vi.mock('three/addons/controls/OrbitControls.js', () => ({
  OrbitControls: class {
    target = { x: 0, y: 0, z: 0, set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; } };
    enableDamping = true;
    dampingFactor = 0.05;
    minDistance = 5;
    maxDistance = 200;
    update(): void {}
    dispose(): void {}
  }
}));

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();

  class FakeRenderer {
    setPixelRatio(): void {}
    setSize(): void {}
    render(): void {}
    dispose(): void {}
  }

  return {
    ...actual,
    WebGLRenderer: FakeRenderer,
  };
});

describe('star map lighting integration', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('initializes lighting store from persisted preferences on first load', async () => {
    localStorage.setItem(
      'nebulaforge_preferences',
      JSON.stringify({ lightingPreset: 'aurora' })
    );
    // Fresh module load so the store reads from localStorage on init.
    await import('$lib/stores/preferences.store');
    const starmap = await import('$lib/stores/starmap.store');
    expect(get(starmap.lighting)).toBe('aurora');
  });

  it('propagates preferences updates into the starmap lighting store', async () => {
    const prefs = await import('$lib/stores/preferences.store');
    const starmap = await import('$lib/stores/starmap.store');

    prefs.updatePreference('lightingPreset', 'deep-space');
    expect(get(starmap.lighting)).toBe('deep-space');
  });

  it('setLighting updates the store and writes back to preferences', async () => {
    const prefs = await import('$lib/stores/preferences.store');
    const starmap = await import('$lib/stores/starmap.store');

    starmap.setLighting('cosmic-dawn');
    expect(get(starmap.lighting)).toBe('cosmic-dawn');
    expect(get(prefs.preferences).lightingPreset).toBe('cosmic-dawn');
  });

  it('lighting presets visibly affect the scene manager background', async () => {
    const { SceneManager } = await import('$lib/three/scene-manager');
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 200;
    Object.defineProperty(canvas, 'clientWidth', { value: 200, configurable: true });
    Object.defineProperty(canvas, 'clientHeight', { value: 200, configurable: true });

    const sm = new SceneManager(canvas);

    sm.setLighting('aurora');
    // @ts-expect-error poking the private scene for assertion
    const auroraBg = (sm.scene.background as { getHexString: () => string }).getHexString();
    sm.setLighting('deep-space');
    // @ts-expect-error poking the private scene for assertion
    const deepBg = (sm.scene.background as { getHexString: () => string }).getHexString();
    expect(auroraBg).not.toBe(deepBg);
    sm.dispose();
  });
});
