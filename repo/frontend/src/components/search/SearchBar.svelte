<script lang="ts">
  import { query, setQueryText, executeSearch, clearSearch, resultCount } from '$lib/stores/search.store';
  import { debounce } from '$lib/utils/debounce';

  const debouncedSearch = debounce(() => executeSearch(), 250);

  function handleInput(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    setQueryText(value);
    if (value.trim()) {
      debouncedSearch();
    } else {
      clearSearch();
    }
  }

  function handleClear() {
    clearSearch();
  }
</script>

<div class="relative">
  <input
    type="text"
    value={$query}
    on:input={handleInput}
    placeholder="Search cards..."
    class="w-full px-3 py-2 pl-8 rounded-lg bg-surface-800 border border-surface-600
           text-surface-100 text-sm focus:outline-none focus:border-blue-500 transition-colors"
  />
  <span class="absolute left-2.5 top-2.5 text-surface-500 text-sm">?</span>
  {#if $query}
    <button
      class="absolute right-2 top-2 text-surface-400 hover:text-surface-200 text-sm"
      on:click={handleClear}
    >
      x
    </button>
  {/if}
  {#if $query && $resultCount > 0}
    <span class="absolute right-8 top-2.5 text-xs text-surface-500">{$resultCount} results</span>
  {/if}
</div>
