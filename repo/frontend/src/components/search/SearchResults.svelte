<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { searchResults, searching, query } from '$lib/stores/search.store';
  import { getDb } from '$lib/db/connection';
  import { highlightMatches, extractSnippet } from '$lib/services/search.service';
  import type { Card } from '$lib/types/card';
  import { MOOD_COLORS } from '$lib/utils/color';

  const dispatch = createEventDispatcher<{ selectCard: string }>();

  let cardMap = new Map<string, Card>();

  $: loadCards($searchResults);

  async function loadCards(hits: typeof $searchResults) {
    if (hits.length === 0) {
      cardMap = new Map();
      return;
    }
    const db = getDb();
    const ids = hits.map(h => h.cardId);
    const cards = await db.cards.bulkGet(ids);
    cardMap = new Map(cards.filter(Boolean).map(c => [c!.id, c!]));
  }
</script>

{#if $searching}
  <p class="text-sm text-surface-400 py-4 text-center">Searching...</p>
{:else if $searchResults.length > 0}
  <div class="space-y-2">
    {#each $searchResults as hit (hit.cardId)}
      {@const card = cardMap.get(hit.cardId)}
      {#if card}
        <button
          class="w-full text-left p-3 rounded-lg bg-surface-800 border border-surface-700
                 hover:border-surface-500 transition-colors"
          on:click={() => dispatch('selectCard', hit.cardId)}
        >
          <div class="flex items-start justify-between">
            <div class="flex-1 min-w-0">
              <h4 class="text-sm font-medium text-surface-200 truncate">
                {@html highlightMatches(card.title, $query)}
              </h4>
              <p class="text-xs text-surface-400 mt-1 line-clamp-2">
                {@html highlightMatches(extractSnippet(card.body, $query, 160), $query)}
              </p>
            </div>
            <div class="ml-2 flex items-center gap-2">
              {#if hit.score > 0}
                <span class="text-xs text-surface-500">{hit.score.toFixed(1)}</span>
              {/if}
              <span
                class="w-2.5 h-2.5 rounded-full"
                style="background-color: {MOOD_COLORS[card.mood]}"
              ></span>
            </div>
          </div>
          <div class="flex items-center gap-2 mt-2 text-xs text-surface-500">
            <span>{card.date}</span>
            {#each hit.matchedFields as field}
              <span class="px-1 py-0.5 rounded bg-blue-900/30 text-blue-300">{field}</span>
            {/each}
          </div>
        </button>
      {/if}
    {/each}
  </div>
{:else if $query}
  <p class="text-sm text-surface-500 py-4 text-center">No results match "{$query}".</p>
{/if}

<style>
  :global(mark) {
    background-color: rgba(250, 204, 21, 0.25);
    color: inherit;
    padding: 0 1px;
    border-radius: 2px;
  }
</style>
