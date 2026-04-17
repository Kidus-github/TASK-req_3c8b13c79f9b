<script lang="ts">
  import { onMount } from 'svelte';
  import StarMapCanvas from '../components/starmap/StarMapCanvas.svelte';
  import GalaxyLegend from '../components/starmap/GalaxyLegend.svelte';
  import CardDetailModal from '../components/cards/CardDetailModal.svelte';
  import CardEditModal from '../components/cards/CardEditModal.svelte';
  import { loadCards } from '$lib/stores/cards.store';
  import { stars, selectStar } from '$lib/stores/starmap.store';
  import { getCard } from '$lib/services/card.service';
  import { recordCardView } from '$lib/stores/voyage.store';
  import type { Card } from '$lib/types/card';
  import type { StarNode } from '$lib/types/starmap';

  let selectedCard: Card | null = null;
  let showDetail = false;
  let editMode: 'edit' | 'delete' | null = null;

  onMount(() => {
    loadCards();
  });

  async function handleStarClick(event: CustomEvent<StarNode>) {
    const star = event.detail;
    const result = await getCard(star.cardId);
    if (result.ok) {
      selectedCard = result.data;
      showDetail = true;
      void recordCardView(result.data.id);
    }
  }

  function closeDetail() {
    showDetail = false;
    selectedCard = null;
    selectStar(null);
  }

  function openEdit(event: CustomEvent<Card>) {
    selectedCard = event.detail;
    editMode = 'edit';
  }

  function openDelete(event: CustomEvent<Card>) {
    selectedCard = event.detail;
    editMode = 'delete';
  }

  async function handleSaved(event: CustomEvent<Card>) {
    selectedCard = event.detail;
    editMode = null;
    await loadCards();
  }

  function handleDeleted() {
    editMode = null;
    showDetail = false;
    selectedCard = null;
    selectStar(null);
  }
</script>

<div class="h-full relative">
  <StarMapCanvas on:starClick={handleStarClick} />
  <GalaxyLegend />

  <div class="absolute top-4 left-4 bg-surface-900/80 backdrop-blur-sm rounded-lg px-3 py-2">
    <span class="text-xs text-surface-400">{$stars.length} stars</span>
  </div>

  {#if showDetail && selectedCard && !editMode}
    <CardDetailModal
      card={selectedCard}
      on:close={closeDetail}
      on:edit={openEdit}
      on:delete={openDelete}
    />
  {/if}

  {#if editMode && selectedCard}
    <CardEditModal
      card={selectedCard}
      mode={editMode}
      on:saved={handleSaved}
      on:deleted={handleDeleted}
      on:close={() => (editMode = null)}
    />
  {/if}
</div>
