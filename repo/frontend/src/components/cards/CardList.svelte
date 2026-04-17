<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { Card } from '$lib/types/card';
  import { MOOD_COLORS } from '$lib/utils/color';

  export let cards: Card[] = [];

  const dispatch = createEventDispatcher<{
    select: Card;
  }>();
</script>

{#if cards.length === 0}
  <div class="text-center py-12 text-surface-500">
    <p class="text-lg mb-2">No cards yet</p>
    <p class="text-sm">Create your first inspiration card to get started.</p>
  </div>
{:else}
  <div class="grid gap-3">
    {#each cards as card (card.id)}
      <button
        class="w-full text-left p-4 rounded-lg bg-surface-800 border border-surface-700
               hover:border-surface-500 transition-colors"
        on:click={() => dispatch('select', card)}
      >
        <div class="flex items-start justify-between">
          <div class="flex-1 min-w-0">
            <h3 class="font-medium text-surface-100 truncate">{card.title}</h3>
            <p class="text-sm text-surface-400 mt-1 line-clamp-2">{card.body}</p>
          </div>
          <span
            class="ml-3 w-3 h-3 rounded-full flex-shrink-0 mt-1"
            style="background-color: {MOOD_COLORS[card.mood]}"
          ></span>
        </div>

        <div class="flex items-center justify-between mt-3">
          <div class="flex flex-wrap gap-1.5">
            {#each card.tags.slice(0, 3) as tag}
              <span class="px-1.5 py-0.5 rounded bg-surface-700 text-surface-400 text-xs">
                {tag}
              </span>
            {/each}
            {#if card.tags.length > 3}
              <span class="text-xs text-surface-500">+{card.tags.length - 3}</span>
            {/if}
          </div>
          <span class="text-xs text-surface-500">{card.date}</span>
        </div>
      </button>
    {/each}
  </div>
{/if}
