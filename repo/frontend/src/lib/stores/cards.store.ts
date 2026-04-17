import { writable, derived, get } from 'svelte/store';
import type { Card, CardDraft } from '$lib/types/card';
import * as cardService from '$lib/services/card.service';
import { currentProfileId } from './auth.store';
import { syncService, type DataChangedPayload } from '$lib/services/sync.service';

const allCards = writable<Card[]>([]);
const selectedCardId = writable<string | null>(null);
const isLoading = writable(false);
const cardError = writable<string | null>(null);

let crossTabUnsub: (() => void) | null = null;

export async function loadCards() {
  const profileId = get(currentProfileId);
  if (!profileId) return;

  isLoading.set(true);
  try {
    const cards = await cardService.listActiveCards(profileId);
    allCards.set(cards);
  } finally {
    isLoading.set(false);
  }

  // Wire cross-tab refresh once per app session.
  if (!crossTabUnsub) {
    crossTabUnsub = syncService.on('DATA_CHANGED', (msg) => {
      const payload = msg.payload as DataChangedPayload;
      if (payload.entity === 'cards' || payload.entity === 'imports') {
        // Reload in place so stale views catch up automatically.
        void loadCards();
      }
    });
  }
}

export async function createCard(draft: CardDraft): Promise<Card | null> {
  const profileId = get(currentProfileId);
  if (!profileId) return null;

  cardError.set(null);
  const result = await cardService.createCard(profileId, draft);
  if (result.ok) {
    allCards.update(cards => [...cards, result.data]);
    return result.data;
  }
  cardError.set(result.error.message);
  return null;
}

export async function updateCard(
  cardId: string,
  draft: CardDraft,
  expectedVersion: number,
  tabInstanceId: string | null = null
): Promise<Card | null> {
  cardError.set(null);
  const result = await cardService.updateCard(cardId, draft, expectedVersion, tabInstanceId ?? syncService.getTabId());
  if (result.ok) {
    allCards.update(cards =>
      cards.map(c => (c.id === cardId ? result.data : c))
    );
    return result.data;
  }
  cardError.set(result.error.message);
  return null;
}

export async function deleteCard(cardId: string): Promise<boolean> {
  cardError.set(null);
  const result = await cardService.softDeleteCard(cardId);
  if (result.ok) {
    allCards.update(cards => cards.filter(c => c.id !== cardId));
    if (get(selectedCardId) === cardId) {
      selectedCardId.set(null);
    }
    return true;
  }
  cardError.set(result.error.message);
  return false;
}

export async function restoreCard(cardId: string): Promise<boolean> {
  cardError.set(null);
  const result = await cardService.restoreCard(cardId);
  if (result.ok) {
    allCards.update(cards => [...cards, result.data]);
    return true;
  }
  cardError.set(result.error.message);
  return false;
}

export function selectCard(cardId: string | null) {
  selectedCardId.set(cardId);
}

export const cards = { subscribe: allCards.subscribe };
export const selected = { subscribe: selectedCardId.subscribe };
export const loading = { subscribe: isLoading.subscribe };
export const error = { subscribe: cardError.subscribe };

export const activeCards = derived(allCards, $cards =>
  $cards.filter(c => c.deletedAt === null)
);

export const cardsByTag = derived(allCards, $cards => {
  const map = new Map<string, Card[]>();
  for (const card of $cards) {
    if (card.deletedAt) continue;
    const tag = card.tags[0] ?? 'untagged';
    if (!map.has(tag)) map.set(tag, []);
    map.get(tag)!.push(card);
  }
  return map;
});

export const cardsByMood = derived(allCards, $cards => {
  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const card of $cards) {
    if (card.deletedAt) continue;
    counts[card.mood] = (counts[card.mood] || 0) + 1;
  }
  return counts;
});
