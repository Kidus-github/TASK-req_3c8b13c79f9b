<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let currentVersion: number;
  export let expectedVersion: number;

  const dispatch = createEventDispatcher<{
    reload: void;
    cancel: void;
  }>();
</script>

<div class="space-y-4">
  <h3 class="text-lg font-medium text-yellow-300">Version Conflict</h3>
  <p class="text-sm text-surface-400">
    This card has been modified in another tab or session.
    Your version ({expectedVersion}) is outdated; the current version is {currentVersion}.
    Please reload the card before making changes.
  </p>

  <div class="flex justify-end gap-3">
    <button
      class="px-4 py-2 rounded-lg bg-surface-700 text-surface-300 hover:bg-surface-600 transition-colors text-sm"
      on:click={() => dispatch('cancel')}
    >
      Cancel
    </button>
    <button
      class="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors text-sm"
      on:click={() => dispatch('reload')}
    >
      Reload Card
    </button>
  </div>
</div>
