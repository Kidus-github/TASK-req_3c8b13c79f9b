<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import type { Card, CardDraft } from '$lib/types/card';
  import CardEditor from './CardEditor.svelte';
  import CardDeleteConfirm from './CardDeleteConfirm.svelte';
  import SimultaneousEditWarning from './SimultaneousEditWarning.svelte';
  import { updateCard, deleteCard, error as cardError } from '$lib/stores/cards.store';
  import { syncService } from '$lib/services/sync.service';
  import { pushToast } from '$lib/stores/toast.store';

  export let card: Card;
  export let mode: 'edit' | 'delete' = 'edit';

  const dispatch = createEventDispatcher<{
    saved: Card;
    deleted: Card;
    close: void;
  }>();

  let saving = false;

  onMount(() => {
    if (mode === 'edit') syncService.broadcastEditLock(card.id);
  });

  onDestroy(() => {
    if (mode === 'edit') syncService.broadcastEditUnlock(card.id);
  });

  async function handleSave(event: CustomEvent<{ draft: CardDraft; version?: number }>) {
    saving = true;
    const updated = await updateCard(card.id, event.detail.draft, event.detail.version ?? card.version);
    saving = false;

    if (updated) {
      pushToast('Card updated', 'success');
      dispatch('saved', updated);
      dispatch('close');
    } else {
      pushToast($cardError ?? 'Failed to update card', 'error');
    }
  }

  async function handleConfirmDelete() {
    const success = await deleteCard(card.id);
    if (success) {
      pushToast('Card deleted', 'success');
      dispatch('deleted', card);
      dispatch('close');
    } else {
      pushToast($cardError ?? 'Failed to delete card', 'error');
    }
  }

  function handleCancel() {
    dispatch('close');
  }
</script>

<div
  class="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
  on:click|self={handleCancel}
  on:keydown={(e) => e.key === 'Escape' && handleCancel()}
  role="dialog"
  aria-modal="true"
  tabindex="-1"
>
  <div class="w-full max-w-xl bg-surface-800 rounded-lg border border-surface-700 p-6 space-y-4 max-h-[90vh] overflow-auto">
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-medium text-surface-100">
        {mode === 'edit' ? 'Edit Card' : 'Delete Card'}
      </h2>
      <button
        class="text-surface-400 hover:text-surface-200 text-lg"
        on:click={handleCancel}
        aria-label="Close"
      >
        x
      </button>
    </div>

    <SimultaneousEditWarning cardId={card.id} />

    {#if mode === 'edit'}
      <CardEditor {card} loading={saving} on:save={handleSave} on:cancel={handleCancel} />
    {:else}
      <CardDeleteConfirm {card} on:confirm={handleConfirmDelete} on:cancel={handleCancel} />
    {/if}
  </div>
</div>
