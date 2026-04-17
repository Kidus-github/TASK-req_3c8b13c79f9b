<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let progress = 0;
  export let total = 0;
  export let status = 'Processing...';
  export let cancellable = true;

  const dispatch = createEventDispatcher<{ cancel: void }>();

  $: percent = total > 0 ? Math.round((progress / total) * 100) : 0;
</script>

<div class="space-y-3">
  <div class="flex items-center justify-between text-sm">
    <span class="text-surface-300">{status}</span>
    <span class="text-surface-400">{progress}/{total} ({percent}%)</span>
  </div>

  <div class="w-full h-2 bg-surface-700 rounded-full overflow-hidden">
    <div
      class="h-full bg-blue-500 transition-all duration-300 ease-out rounded-full"
      style="width: {percent}%"
    ></div>
  </div>

  {#if cancellable}
    <div class="flex justify-end">
      <button
        class="px-3 py-1.5 rounded text-sm bg-surface-700 text-surface-300 hover:bg-surface-600 transition-colors"
        on:click={() => dispatch('cancel')}
      >
        Cancel
      </button>
    </div>
  {/if}
</div>
