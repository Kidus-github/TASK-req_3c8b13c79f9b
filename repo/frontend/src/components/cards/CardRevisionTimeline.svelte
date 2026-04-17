<script lang="ts">
  import { onMount } from 'svelte';
  import type { CardRevision } from '$lib/types/card';
  import { getCardRevisions } from '$lib/services/card.service';

  export let cardId: string;

  let revisions: CardRevision[] = [];
  let loading = true;

  onMount(async () => {
    revisions = await getCardRevisions(cardId);
    loading = false;
  });
</script>

<div class="space-y-3">
  <h3 class="text-sm font-medium text-surface-300">Revision History</h3>

  {#if loading}
    <p class="text-xs text-surface-500">Loading revisions...</p>
  {:else if revisions.length === 0}
    <p class="text-xs text-surface-500">No revisions yet.</p>
  {:else}
    <div class="space-y-2">
      {#each revisions as rev}
        <div class="p-3 rounded bg-surface-800 border border-surface-700 text-xs">
          <div class="flex justify-between text-surface-400">
            <span>v{rev.version} - {rev.editSource}</span>
            <span>{new Date(rev.editedAt).toLocaleString()}</span>
          </div>
          <div class="mt-1 text-surface-500">
            {#if rev.beforeSnapshot.title !== rev.afterSnapshot.title}
              <p>Title: "{rev.beforeSnapshot.title}" -> "{rev.afterSnapshot.title}"</p>
            {/if}
            {#if rev.beforeSnapshot.mood !== rev.afterSnapshot.mood}
              <p>Mood: {rev.beforeSnapshot.mood} -> {rev.afterSnapshot.mood}</p>
            {/if}
            {#if rev.beforeSnapshot.date !== rev.afterSnapshot.date}
              <p>Date: {rev.beforeSnapshot.date} -> {rev.afterSnapshot.date}</p>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
