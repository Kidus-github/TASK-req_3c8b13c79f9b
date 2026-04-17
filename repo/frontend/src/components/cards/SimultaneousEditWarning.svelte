<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { syncService } from '$lib/services/sync.service';

  export let cardId: string;

  let lockedByOther = false;
  let unsubscribe: (() => void) | null = null;

  onMount(() => {
    unsubscribe = syncService.onLockChange((locks) => {
      lockedByOther = locks.has(cardId);
    });
  });

  onDestroy(() => {
    unsubscribe?.();
  });
</script>

{#if lockedByOther}
  <div class="rounded-lg border border-yellow-900/50 bg-yellow-900/20 p-3 text-xs text-yellow-200">
    <strong>Heads up:</strong> another tab is editing this card. Saving here may create a version conflict.
  </div>
{/if}
