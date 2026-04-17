<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { Card } from '$lib/types/card';
  import { MOOD_COLORS } from '$lib/utils/color';

  export let card: Card;

  const dispatch = createEventDispatcher<{
    edit: Card;
    delete: Card;
    close: void;
  }>();
</script>

<div class="space-y-4">
  <div class="flex items-start justify-between">
    <div>
      <h2 class="text-xl font-bold text-surface-50">{card.title}</h2>
      <p class="text-sm text-surface-400 mt-1">{card.date}</p>
    </div>
    <button
      class="text-surface-400 hover:text-surface-200 text-lg"
      on:click={() => dispatch('close')}
      aria-label="Close"
    >
      x
    </button>
  </div>

  <div class="flex items-center gap-2">
    <span
      class="inline-block w-3 h-3 rounded-full"
      style="background-color: {MOOD_COLORS[card.mood]}"
    ></span>
    <span class="text-sm text-surface-300">Mood: {card.mood}/5</span>
  </div>

  {#if card.tags.length > 0}
    <div class="flex flex-wrap gap-2">
      {#each card.tags as tag}
        <span class="px-2 py-0.5 rounded-full bg-surface-700 text-surface-300 text-xs">
          {tag}
        </span>
      {/each}
    </div>
  {/if}

  <div class="bg-surface-800/50 rounded-lg p-4">
    <p class="text-surface-200 whitespace-pre-wrap">{card.body}</p>
  </div>

  <div class="text-xs text-surface-500 space-y-1">
    <p>Version: {card.version}</p>
    <p>Created: {new Date(card.createdAt).toLocaleString()}</p>
    <p>Updated: {new Date(card.updatedAt).toLocaleString()}</p>
    {#if card.sourceImportId}
      <p>Imported from batch {card.sourceImportId}, row {card.sourceRowNumber}</p>
    {/if}
  </div>

  <div class="flex gap-3 pt-2">
    <button
      class="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors text-sm"
      on:click={() => dispatch('edit', card)}
    >
      Edit
    </button>
    <button
      class="px-4 py-2 rounded-lg bg-red-900/50 text-red-300 hover:bg-red-900/70 transition-colors text-sm"
      on:click={() => dispatch('delete', card)}
    >
      Delete
    </button>
  </div>
</div>
