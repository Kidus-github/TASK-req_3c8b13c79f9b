<script lang="ts">
  import { onMount } from 'svelte';
  import SearchBar from '../components/search/SearchBar.svelte';
  import SearchFilters from '../components/search/SearchFilters.svelte';
  import SearchResults from '../components/search/SearchResults.svelte';
  import CardDetail from '../components/cards/CardDetail.svelte';
  import CardEditModal from '../components/cards/CardEditModal.svelte';
  import { searchResults, searchHighlights, executeSearch } from '$lib/stores/search.store';
  import { highlightCards } from '$lib/stores/starmap.store';
  import { loadCards } from '$lib/stores/cards.store';
  import { getCard } from '$lib/services/card.service';
  import { recordCardView } from '$lib/stores/voyage.store';
  import type { Card } from '$lib/types/card';

  let selectedCard: Card | null = null;
  let editMode: 'edit' | 'delete' | null = null;

  onMount(() => {
    loadCards();
  });

  // Sync search highlights to starmap
  $: highlightCards($searchHighlights);

  async function handleSelectCard(event: CustomEvent<string>) {
    const result = await getCard(event.detail);
    if (result.ok) {
      selectedCard = result.data;
      void recordCardView(result.data.id);
    }
  }

  function closeDetail() {
    selectedCard = null;
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
    await executeSearch();
  }

  async function handleDeleted() {
    editMode = null;
    selectedCard = null;
    await loadCards();
    await executeSearch();
  }
</script>

<div class="max-w-4xl mx-auto">
  <div class="mb-6">
    <h1 class="text-2xl font-bold text-surface-50">Search</h1>
    <p class="text-surface-400 mt-1">Search your cards offline. Results sync to the star map.</p>
  </div>

  <div class="grid grid-cols-3 gap-6">
    <div class="col-span-2 space-y-4">
      <SearchBar />
      <SearchResults on:selectCard={handleSelectCard} />
    </div>
    <div class="space-y-4">
      <SearchFilters />

      {#if selectedCard && !editMode}
        <div class="bg-surface-800 rounded-lg border border-surface-700 p-4">
          <CardDetail
            card={selectedCard}
            on:close={closeDetail}
            on:edit={openEdit}
            on:delete={openDelete}
          />
        </div>
      {/if}
    </div>
  </div>

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
