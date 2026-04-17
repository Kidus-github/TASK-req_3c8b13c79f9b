import type { Card } from '$lib/types/card';
import type { StarNode, Galaxy, Vec3 } from '$lib/types/starmap';
import { moodToColor } from '$lib/utils/color';
import { computeOrbitalDistance, dateToEpochDay } from '$lib/utils/date';
import { tagToSphericalPosition, computeStarPosition } from '$lib/three/helpers';

export function cardsToStarNodes(cards: Card[]): StarNode[] {
  if (cards.length === 0) return [];

  const activeCards = cards.filter(c => c.deletedAt === null);
  if (activeCards.length === 0) return [];

  // Compute date range
  const dates = activeCards.map(c => c.date);
  const minDate = dates.reduce((a, b) => (a < b ? a : b));
  const maxDate = dates.reduce((a, b) => (a > b ? a : b));

  // Group by primary tag
  const tagGroups = new Map<string, Card[]>();
  for (const card of activeCards) {
    const primaryTag = card.tags[0] ?? 'untagged';
    if (!tagGroups.has(primaryTag)) tagGroups.set(primaryTag, []);
    tagGroups.get(primaryTag)!.push(card);
  }

  const nodes: StarNode[] = [];

  for (const [tag, group] of tagGroups) {
    const galaxyCenter = tagToSphericalPosition(tag);

    for (let i = 0; i < group.length; i++) {
      const card = group[i];
      const orbitalDistance = computeOrbitalDistance(card.date, minDate, maxDate, 1, 6);
      const position = computeStarPosition(galaxyCenter, orbitalDistance, i, group.length);

      nodes.push({
        id: `star-${card.id}`,
        cardId: card.id,
        position,
        color: moodToColor(card.mood),
        size: 1,
        galaxyId: tag,
        label: card.title,
        mood: card.mood,
      });
    }
  }

  return nodes;
}

export function cardsToGalaxies(cards: Card[]): Galaxy[] {
  const activeCards = cards.filter(c => c.deletedAt === null);
  const tagCounts = new Map<string, number>();

  for (const card of activeCards) {
    const primaryTag = card.tags[0] ?? 'untagged';
    tagCounts.set(primaryTag, (tagCounts.get(primaryTag) ?? 0) + 1);
  }

  const galaxies: Galaxy[] = [];
  for (const [tag, count] of tagCounts) {
    const center = tagToSphericalPosition(tag);
    galaxies.push({
      id: tag,
      tag,
      center,
      color: moodToColor(3),
      cardCount: count,
    });
  }

  return galaxies;
}

export function findStarByCardId(nodes: StarNode[], cardId: string): StarNode | undefined {
  return nodes.find(n => n.cardId === cardId);
}
