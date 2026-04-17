/**
 * UI coverage for StarMapCanvas.
 *
 * jsdom cannot host a real WebGLRenderer, so SceneManager is replaced via
 * vi.mock(). Instances are tracked on globalThis to avoid module-hoisting
 * pitfalls inside the mock factory.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('$lib/three/scene-manager', () => {
  function rec() {
    const calls: any[][] = [];
    function fn(...args: any[]) { calls.push(args); }
    (fn as any).mock = { calls };
    return fn;
  }
  function FakeSceneManager(this: any, canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.updateStars = rec();
    this.highlightStars = rec();
    this.clearHighlights = rec();
    this.setLighting = rec();
    this.setStardustEnabled = rec();
    this.dispose = rec();
    this.pickCallback = null;
    (globalThis as any).__starmapTest__.instances.push(this);
  }
  FakeSceneManager.prototype.onStarPick = function (cb: any) { this.pickCallback = cb; };
  return { SceneManager: FakeSceneManager };
});

(globalThis as any).__starmapTest__ = (globalThis as any).__starmapTest__ ?? { instances: [] };

import { render, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import StarMapCanvas from '../../src/components/starmap/StarMapCanvas.svelte';
import { refreshStarMap, clearHighlights, selectStar, highlightCards, setLighting, stars } from '$lib/stores/starmap.store';
import { get } from 'svelte/store';
import type { Card } from '$lib/types/card';

const sink = (): { instances: any[] } => (globalThis as any).__starmapTest__;

function card(id: string, mood: Card['mood'] = 3, tag = 'nature'): Card {
  return {
    id, profileId: 'p', title: `Card ${id}`, body: 'body', date: '2024-01-15', mood,
    tags: [tag], sourceImportId: null, sourceRowNumber: null, thumbnailId: null,
    createdAt: 0, updatedAt: 0, deletedAt: null, version: 1,
  };
}

beforeEach(() => {
  sink().instances.length = 0;
  refreshStarMap([]);
  clearHighlights();
  selectStar(null);
  setLighting('nebula');
});

afterEach(() => {
  refreshStarMap([]);
  clearHighlights();
  selectStar(null);
});

describe('StarMapCanvas', () => {
  it('mounts a canvas and instantiates SceneManager once', async () => {
    const { container } = render(StarMapCanvas);
    await tick();
    const canvas = container.querySelector('canvas');
    expect(canvas).toBeTruthy();
    expect(sink().instances.length).toBe(1);
    expect(sink().instances[0].canvas).toBe(canvas);
  });

  it('updateStars is called when the stars store changes', async () => {
    render(StarMapCanvas);
    await tick();
    const sm = sink().instances[0];
    refreshStarMap([card('a'), card('b'), card('c')]);
    await waitFor(() => expect(get(stars).length).toBe(3));
    await waitFor(() => expect(sm.updateStars.mock.calls.length).toBeGreaterThan(0));
    expect(sm.updateStars.mock.calls.at(-1)![0].length).toBe(3);
  });

  it('highlightStars is called when highlighted has values; clearHighlights when empty', async () => {
    refreshStarMap([card('a'), card('b')]);
    render(StarMapCanvas);
    await tick();
    const sm = sink().instances[0];

    highlightCards(['a']);
    await waitFor(() => expect(sm.highlightStars.mock.calls.length).toBeGreaterThan(0));

    clearHighlights();
    await waitFor(() => expect(sm.clearHighlights.mock.calls.length).toBeGreaterThan(0));
  });

  it('setLighting is invoked when the lighting store changes', async () => {
    render(StarMapCanvas);
    await tick();
    const sm = sink().instances[0];
    setLighting('deep-space');
    await waitFor(() => {
      const calls = sm.setLighting.mock.calls.map((c: any[]) => c[0]);
      expect(calls).toContain('deep-space');
    });
  });

  it('dispatches starClick when SceneManager pick callback fires', async () => {
    refreshStarMap([card('a'), card('b')]);
    const events: any[] = [];
    render(StarMapCanvas, {
      // @ts-expect-error events is a Svelte 5 mount option
      events: { starClick: (e: CustomEvent) => events.push(e.detail) },
    });
    await tick();
    const sm = sink().instances[0];
    expect(typeof sm.pickCallback).toBe('function');
    const fakeStar = { id: 'star-x', cardId: 'a', x: 0, y: 0, z: 0 };
    sm.pickCallback!(fakeStar);
    await waitFor(() => expect(events.length).toBe(1));
    expect(events[0].id).toBe('star-x');
  });

  it('edge case: null pick does not dispatch starClick', async () => {
    const events: any[] = [];
    render(StarMapCanvas, {
      // @ts-expect-error events is a Svelte 5 mount option
      events: { starClick: (e: CustomEvent) => events.push(e.detail) },
    });
    await tick();
    const sm = sink().instances[0];
    sm.pickCallback!(null);
    await tick();
    expect(events.length).toBe(0);
  });
});
