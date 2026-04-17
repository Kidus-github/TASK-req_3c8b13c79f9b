<script lang="ts">
  import { toasts, dismissToast } from '$lib/stores/toast.store';

  const typeColors: Record<string, string> = {
    info: 'bg-blue-600',
    success: 'bg-green-600',
    warning: 'bg-yellow-600',
    error: 'bg-red-600',
  };
</script>

<div class="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
  {#each $toasts as toast (toast.id)}
    <div
      class="rounded-lg px-4 py-3 text-white text-sm shadow-lg flex items-start gap-3 {typeColors[toast.type]}"
      role="alert"
    >
      <span class="flex-1">{toast.message}</span>
      {#if toast.dismissible}
        <button
          class="text-white/70 hover:text-white transition-colors text-lg leading-none"
          on:click={() => dismissToast(toast.id)}
          aria-label="Dismiss"
        >
          x
        </button>
      {/if}
    </div>
  {/each}
</div>
