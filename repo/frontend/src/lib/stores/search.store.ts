import { writable, derived, get } from 'svelte/store';
import type { SearchQuery, SearchHit, SearchFilters, SearchSort } from '$lib/types/search';
import * as searchService from '$lib/services/search.service';
import { currentProfileId } from './auth.store';

const queryText = writable('');
const filters = writable<SearchFilters>({});
const sort = writable<SearchSort>({ field: 'relevance', direction: 'desc' });
const results = writable<SearchHit[]>([]);
const isSearching = writable(false);
const highlightedIds = writable<string[]>([]);

export async function executeSearch(): Promise<void> {
  const profileId = get(currentProfileId);
  if (!profileId) return;

  isSearching.set(true);
  try {
    const query: SearchQuery = {
      queryText: get(queryText),
      filters: get(filters),
      sort: get(sort),
    };
    const hits = await searchService.searchCards(query, profileId);
    results.set(hits);
    highlightedIds.set(hits.map(h => h.cardId));
  } finally {
    isSearching.set(false);
  }
}

export async function rebuildIndexFromCards(): Promise<number> {
  const profileId = get(currentProfileId);
  if (!profileId) return 0;
  const { listCards } = await import('$lib/services/card.service');
  const cards = await listCards(profileId, true);
  // Production path: run tokenization in the heavy-task worker so the
  // Jobs monitor surfaces progress/cancellation instead of freezing the UI.
  const { indexed } = await searchService.rebuildSearchIndexViaWorker(cards, profileId);
  return indexed;
}

export function getCurrentQueryText(): string {
  return get(queryText);
}

export function clearSearch(): void {
  queryText.set('');
  results.set([]);
  highlightedIds.set([]);
}

export function setQueryText(text: string): void {
  queryText.set(text);
}

export function setFilters(f: SearchFilters): void {
  filters.set(f);
}

export function setSort(s: SearchSort): void {
  sort.set(s);
}

export const query = { subscribe: queryText.subscribe };
export const searchFilters = { subscribe: filters.subscribe };
export const searchSort = { subscribe: sort.subscribe };
export const searchResults = { subscribe: results.subscribe };
export const searching = { subscribe: isSearching.subscribe };
export const searchHighlights = { subscribe: highlightedIds.subscribe };

export const resultCount = derived(results, $r => $r.length);
