/**
 * Starmap visualization glue coverage.
 *
 * Tests the UI glue and store <-> service integration around StarMap:
 * - GalaxyLegend renders real galaxies derived by starmap.service
 * - refreshStarMap populates stars + galaxies from a real card set
 * - highlightCards / clearHighlights flow through the store
 * - selectStar drives selectedStarNode derivation
 *
 * WebGL rendering (SceneManager) is excluded because jsdom cannot host a
 * WebGLRenderer context; that path is covered by Playwright E2E.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { tick } from 'svelte';

import GalaxyLegend from '../../src/components/starmap/GalaxyLegend.svelte';
import {
  refreshStarMap,
  stars,
  galaxyList,
  selectedStar,
  selectedStarNode,
  highlightCards,
  clearHighlights,
  highlighted,
  selectStar,
  setLighting,
  lighting,
} from '$lib/stores/starmap.store';
import { findStarByCardId } from '$lib/services/starmap.service';
import type { Card } from '$lib/types/card';

function card(id: string, mood: Card['mood'], tag = 'nature'): Card {
  return {
    id,
    profileId: 'p',
    title: `Card ${id}`,
    body: 'body',
    date: '2024-01-15',
    mood,
    tags: [tag],
    sourceImportId: null,
    sourceRowNumber: null,
    thumbnailId: null,
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
    version: 1,
  };
}

beforeEach(() => {
  refreshStarMap([]);
  clearHighlights();
  selectStar(null);
});

afterEach(() => {
  refreshStarMap([]);
  clearHighlights();
  selectStar(null);
});

describe('starmap store + service glue', () => {
  it('refreshStarMap populates stars and galaxies from active cards', () => {
    const cards = [
      card('a', 3, 'nature'),
      card('b', 5, 'nature'),
      card('c', 2, 'coding'),
    ];
    refreshStarMap(cards);
    const nodes = get(stars);
    expect(nodes.length).toBe(3);
    const gals = get(galaxyList);
    const natureGalaxy = gals.find((g) => g.tag === 'nature');
    expect(natureGalaxy?.cardCount).toBe(2);
    const codingGalaxy = gals.find((g) => g.tag === 'coding');
    expect(codingGalaxy?.cardCount).toBe(1);
  });

  it('excludes soft-deleted cards from the rendered star set', () => {
    const cards = [
      card('a', 3, 'nature'),
      { ...card('b', 3, 'coding'), deletedAt: Date.now() },
    ];
    refreshStarMap(cards);
    expect(get(stars).length).toBe(1);
  });

  it('findStarByCardId resolves the star corresponding to a given card id', () => {
    const cards = [card('a', 4), card('b', 4)];
    refreshStarMap(cards);
    const star = findStarByCardId(get(stars), 'b');
    expect(star?.cardId).toBe('b');
  });

  it('selectStar drives the selectedStarNode derivation', () => {
    const cards = [card('a', 4), card('b', 4)];
    refreshStarMap(cards);
    const target = get(stars)[1];
    selectStar(target.id);
    const active = get(selectedStarNode);
    expect(active?.id).toBe(target.id);
    selectStar(null);
    expect(get(selectedStarNode)).toBeNull();
  });

  it('highlightCards and clearHighlights update the highlighted list', () => {
    highlightCards(['a', 'b']);
    expect(get(highlighted)).toEqual(['a', 'b']);
    clearHighlights();
    expect(get(highlighted)).toEqual([]);
  });

  it('setLighting coerces unknown values and emits valid preset', () => {
    setLighting('deep-space');
    expect(get(lighting)).toBe('deep-space');
    setLighting('not-a-preset' as never);
    expect(get(lighting)).toBe('nebula');
  });
});

describe('GalaxyLegend', () => {
  it('renders empty state when no galaxies', () => {
    const { container } = render(GalaxyLegend);
    expect(container.textContent).toMatch(/No galaxies yet/);
  });

  it('renders galaxy rows sourced from refreshStarMap', async () => {
    refreshStarMap([card('a', 3, 'nature'), card('b', 4, 'coding')]);
    await tick();
    const { container } = render(GalaxyLegend);
    expect(container.textContent).toContain('nature');
    expect(container.textContent).toContain('coding');
  });

  it('shows an overflow row when there are more than 10 galaxies', async () => {
    const manyTagCards = Array.from({ length: 12 }, (_, i) => card(`c-${i}`, 3, `tag${i}`));
    refreshStarMap(manyTagCards);
    await tick();
    const { container } = render(GalaxyLegend);
    expect(container.textContent).toMatch(/\+2 more/);
  });
});
