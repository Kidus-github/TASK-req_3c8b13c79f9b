import { describe, it, expect } from 'vitest';
import { cardsToStarNodes, cardsToGalaxies } from '$lib/services/starmap.service';
import type { Card } from '$lib/types/card';

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 'card-1',
    profileId: 'p1',
    title: 'Test',
    body: 'Body',
    date: '2024-06-15',
    mood: 3,
    tags: ['design'],
    sourceImportId: null,
    sourceRowNumber: null,
    thumbnailId: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    deletedAt: null,
    version: 1,
    ...overrides,
  };
}

describe('starmap.service', () => {
  describe('cardsToStarNodes', () => {
    it('returns empty for no cards', () => {
      expect(cardsToStarNodes([])).toEqual([]);
    });

    it('creates one star per active card', () => {
      const cards = [
        makeCard({ id: 'c1' }),
        makeCard({ id: 'c2' }),
        makeCard({ id: 'c3', deletedAt: Date.now() }),
      ];
      const nodes = cardsToStarNodes(cards);
      expect(nodes).toHaveLength(2);
    });

    it('assigns galaxy based on first tag', () => {
      const cards = [
        makeCard({ id: 'c1', tags: ['nature', 'photo'] }),
        makeCard({ id: 'c2', tags: ['design'] }),
      ];
      const nodes = cardsToStarNodes(cards);
      expect(nodes.find(n => n.cardId === 'c1')!.galaxyId).toBe('nature');
      expect(nodes.find(n => n.cardId === 'c2')!.galaxyId).toBe('design');
    });

    it('assigns untagged galaxy for cards with no tags', () => {
      const cards = [makeCard({ id: 'c1', tags: [] })];
      const nodes = cardsToStarNodes(cards);
      expect(nodes[0].galaxyId).toBe('untagged');
    });

    it('maps mood to color', () => {
      const cards = [
        makeCard({ id: 'c1', mood: 1 }),
        makeCard({ id: 'c2', mood: 5 }),
      ];
      const nodes = cardsToStarNodes(cards);
      expect(nodes[0].color).not.toBe(nodes[1].color);
    });

    it('produces deterministic positions for same data', () => {
      const cards = [makeCard({ id: 'c1' }), makeCard({ id: 'c2' })];
      const nodes1 = cardsToStarNodes(cards);
      const nodes2 = cardsToStarNodes(cards);
      expect(nodes1[0].position).toEqual(nodes2[0].position);
      expect(nodes1[1].position).toEqual(nodes2[1].position);
    });

    it('handles same-date cards (all use median band)', () => {
      const cards = [
        makeCard({ id: 'c1', date: '2024-01-01' }),
        makeCard({ id: 'c2', date: '2024-01-01' }),
      ];
      const nodes = cardsToStarNodes(cards);
      expect(nodes).toHaveLength(2);
      // Both should have valid positions
      for (const node of nodes) {
        expect(isFinite(node.position.x)).toBe(true);
        expect(isFinite(node.position.y)).toBe(true);
        expect(isFinite(node.position.z)).toBe(true);
      }
    });
  });

  describe('cardsToGalaxies', () => {
    it('groups by primary tag', () => {
      const cards = [
        makeCard({ id: 'c1', tags: ['nature'] }),
        makeCard({ id: 'c2', tags: ['nature'] }),
        makeCard({ id: 'c3', tags: ['design'] }),
      ];
      const galaxies = cardsToGalaxies(cards);
      expect(galaxies).toHaveLength(2);
      expect(galaxies.find(g => g.tag === 'nature')!.cardCount).toBe(2);
      expect(galaxies.find(g => g.tag === 'design')!.cardCount).toBe(1);
    });

    it('excludes deleted cards', () => {
      const cards = [
        makeCard({ id: 'c1', tags: ['nature'] }),
        makeCard({ id: 'c2', tags: ['nature'], deletedAt: Date.now() }),
      ];
      const galaxies = cardsToGalaxies(cards);
      expect(galaxies[0].cardCount).toBe(1);
    });
  });
});
