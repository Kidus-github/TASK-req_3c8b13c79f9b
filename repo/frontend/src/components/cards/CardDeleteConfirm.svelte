<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { Card } from '$lib/types/card';

  export let card: Card;

  const dispatch = createEventDispatcher<{
    confirm: void;
    cancel: void;
  }>();
</script>

<div class="space-y-4">
  <h3 class="text-lg font-medium text-surface-100">Delete Card?</h3>
  <p class="text-sm text-surface-400">
    Are you sure you want to delete "{card.title}"?
    The card can be restored later.
  </p>

  <div class="flex justify-end gap-3">
    <button
      class="px-4 py-2 rounded-lg bg-surface-700 text-surface-300 hover:bg-surface-600 transition-colors text-sm"
      on:click={() => dispatch('cancel')}
    >
      Cancel
    </button>
    <button
      class="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-500 transition-colors text-sm"
      on:click={() => dispatch('confirm')}
    >
      Delete
    </button>
  </div>
</div>
