<script lang="ts">
  import { onMount } from 'svelte';
  import { cards, loadCards, activeCards } from '$lib/stores/cards.store';
  import { currentProfile } from '$lib/stores/auth.store';
  import { cardsByMood } from '$lib/stores/cards.store';
  import { MOOD_COLORS } from '$lib/utils/color';
  import PreferencesCarousel from '../components/layout/PreferencesCarousel.svelte';

  onMount(() => {
    loadCards();
  });
</script>

<div class="max-w-4xl mx-auto space-y-8">
  <div>
    <h1 class="text-2xl font-bold text-surface-50">
      Welcome{$currentProfile ? `, ${$currentProfile.username}` : ''}
    </h1>
    <p class="text-surface-400 mt-1">Your offline inspiration workspace</p>
  </div>

  <PreferencesCarousel />

  <div class="grid grid-cols-3 gap-4">
    <div class="p-4 rounded-lg bg-surface-800 border border-surface-700">
      <p class="text-sm text-surface-400">Active Cards</p>
      <p class="text-3xl font-bold text-surface-100 mt-1">{$activeCards.length}</p>
    </div>
    <div class="p-4 rounded-lg bg-surface-800 border border-surface-700">
      <p class="text-sm text-surface-400">Tags Used</p>
      <p class="text-3xl font-bold text-surface-100 mt-1">
        {new Set($activeCards.flatMap(c => c.tags)).size}
      </p>
    </div>
    <div class="p-4 rounded-lg bg-surface-800 border border-surface-700">
      <p class="text-sm text-surface-400">Mood Distribution</p>
      <div class="flex gap-1 mt-2">
        {#each [1, 2, 3, 4, 5] as m}
          <div class="flex-1 text-center">
            <div
              class="h-8 rounded"
              style="background-color: {MOOD_COLORS[m]}; opacity: {$cardsByMood[m] > 0 ? 1 : 0.2}"
            ></div>
            <span class="text-xs text-surface-500 mt-1">{$cardsByMood[m]}</span>
          </div>
        {/each}
      </div>
    </div>
  </div>

  <div>
    <h2 class="text-lg font-medium text-surface-200 mb-3">Recent Cards</h2>
    {#if $activeCards.length === 0}
      <div class="text-center py-8 text-surface-500 bg-surface-800/50 rounded-lg">
        <p>No cards yet. Navigate to Cards to create your first one.</p>
      </div>
    {:else}
      <div class="space-y-2">
        {#each $activeCards.slice(0, 5) as card (card.id)}
          <div class="p-3 rounded-lg bg-surface-800 border border-surface-700">
            <div class="flex items-center justify-between">
              <span class="font-medium text-surface-200">{card.title}</span>
              <span class="text-xs text-surface-500">{card.date}</span>
            </div>
            <p class="text-sm text-surface-400 mt-1 truncate">{card.body}</p>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
