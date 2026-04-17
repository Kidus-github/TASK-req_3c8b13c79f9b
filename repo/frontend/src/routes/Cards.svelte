<script lang="ts">
  import { onMount } from 'svelte';
  import type { Card, CardDraft } from '$lib/types/card';
  import {
    cards,
    activeCards,
    loadCards,
    createCard,
    updateCard,
    deleteCard,
    selectCard,
    selected,
    error as cardError,
  } from '$lib/stores/cards.store';
  import { pushToast } from '$lib/stores/toast.store';
  import CardList from '../components/cards/CardList.svelte';
  import CardEditor from '../components/cards/CardEditor.svelte';
  import CardDetail from '../components/cards/CardDetail.svelte';
  import CardDeleteConfirm from '../components/cards/CardDeleteConfirm.svelte';
  import CardRevisionTimeline from '../components/cards/CardRevisionTimeline.svelte';
  import { recordCardView } from '$lib/stores/voyage.store';

  type ViewMode = 'list' | 'create' | 'detail' | 'edit' | 'delete' | 'revisions';

  let mode: ViewMode = 'list';
  let selectedCard: Card | null = null;
  let saving = false;

  onMount(() => {
    loadCards();
  });

  function handleSelect(event: CustomEvent<Card>) {
    selectedCard = event.detail;
    mode = 'detail';
    void recordCardView(selectedCard.id);
  }

  function handleEdit(event: CustomEvent<Card>) {
    selectedCard = event.detail;
    mode = 'edit';
  }

  function handleDelete(event: CustomEvent<Card>) {
    selectedCard = event.detail;
    mode = 'delete';
  }

  async function handleSave(event: CustomEvent<{ draft: CardDraft; version?: number }>) {
    saving = true;
    const { draft, version } = event.detail;

    if (selectedCard && version != null) {
      const result = await updateCard(selectedCard.id, draft, version);
      if (result) {
        selectedCard = result;
        mode = 'detail';
        pushToast('Card updated successfully', 'success');
      } else {
        pushToast($cardError ?? 'Failed to update card', 'error');
      }
    } else {
      const result = await createCard(draft);
      if (result) {
        selectedCard = result;
        mode = 'detail';
        pushToast('Card created successfully', 'success');
      } else {
        pushToast($cardError ?? 'Failed to create card', 'error');
      }
    }

    saving = false;
  }

  async function handleConfirmDelete() {
    if (!selectedCard) return;
    const success = await deleteCard(selectedCard.id);
    if (success) {
      pushToast('Card deleted', 'success');
      selectedCard = null;
      mode = 'list';
    } else {
      pushToast($cardError ?? 'Failed to delete card', 'error');
    }
  }
</script>

<div class="max-w-4xl mx-auto">
  <div class="flex items-center justify-between mb-6">
    <div>
      <h1 class="text-2xl font-bold text-surface-50">Cards</h1>
      <p class="text-sm text-surface-400">{$activeCards.length} active cards</p>
    </div>
    {#if mode === 'list'}
      <button
        class="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors text-sm"
        on:click={() => { selectedCard = null; mode = 'create'; }}
      >
        New Card
      </button>
    {:else}
      <button
        class="px-4 py-2 rounded-lg bg-surface-700 text-surface-300 hover:bg-surface-600 transition-colors text-sm"
        on:click={() => { mode = 'list'; selectedCard = null; }}
      >
        Back to List
      </button>
    {/if}
  </div>

  {#if mode === 'list'}
    <CardList cards={$activeCards} on:select={handleSelect} />

  {:else if mode === 'create'}
    <div class="bg-surface-800 rounded-lg border border-surface-700 p-6">
      <h2 class="text-lg font-medium text-surface-100 mb-4">Create New Card</h2>
      <CardEditor
        loading={saving}
        on:save={handleSave}
        on:cancel={() => { mode = 'list'; }}
      />
    </div>

  {:else if mode === 'detail' && selectedCard}
    <div class="bg-surface-800 rounded-lg border border-surface-700 p-6">
      <CardDetail
        card={selectedCard}
        on:edit={handleEdit}
        on:delete={handleDelete}
        on:close={() => { mode = 'list'; selectedCard = null; }}
      />
      <div class="mt-6 pt-6 border-t border-surface-700">
        <CardRevisionTimeline cardId={selectedCard.id} />
      </div>
    </div>

  {:else if mode === 'edit' && selectedCard}
    <div class="bg-surface-800 rounded-lg border border-surface-700 p-6">
      <h2 class="text-lg font-medium text-surface-100 mb-4">Edit Card</h2>
      <CardEditor
        card={selectedCard}
        loading={saving}
        on:save={handleSave}
        on:cancel={() => { mode = 'detail'; }}
      />
    </div>

  {:else if mode === 'delete' && selectedCard}
    <div class="bg-surface-800 rounded-lg border border-surface-700 p-6">
      <CardDeleteConfirm
        card={selectedCard}
        on:confirm={handleConfirmDelete}
        on:cancel={() => { mode = 'detail'; }}
      />
    </div>

  {:else if mode === 'revisions' && selectedCard}
    <div class="bg-surface-800 rounded-lg border border-surface-700 p-6">
      <CardRevisionTimeline cardId={selectedCard.id} />
    </div>
  {/if}
</div>
