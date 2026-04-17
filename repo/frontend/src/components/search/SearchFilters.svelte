<script lang="ts">
  import { searchFilters, setFilters, executeSearch, setSort, searchSort } from '$lib/stores/search.store';
  import type { SearchFilters, SearchSort } from '$lib/types/search';

  let moodMin = '';
  let moodMax = '';
  let dateStart = '';
  let dateEnd = '';
  let tagFilter = '';

  function applyFilters() {
    const filters: SearchFilters = {};
    if (tagFilter) filters.tags = tagFilter.split(',').map(t => t.trim()).filter(Boolean);
    if (moodMin) filters.moodMin = parseInt(moodMin);
    if (moodMax) filters.moodMax = parseInt(moodMax);
    if (dateStart) filters.dateStart = dateStart;
    if (dateEnd) filters.dateEnd = dateEnd;
    setFilters(filters);
    executeSearch();
  }

  function handleSortChange(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    const [field, direction] = value.split('_') as [SearchSort['field'], SearchSort['direction']];
    setSort({ field, direction });
    executeSearch();
  }

  function clearFilters() {
    moodMin = '';
    moodMax = '';
    dateStart = '';
    dateEnd = '';
    tagFilter = '';
    setFilters({});
    executeSearch();
  }
</script>

<div class="space-y-3 p-3 bg-surface-800 rounded-lg border border-surface-700">
  <div class="flex items-center justify-between">
    <h3 class="text-sm font-medium text-surface-300">Filters</h3>
    <button
      class="text-xs text-surface-500 hover:text-surface-300"
      on:click={clearFilters}
    >
      Clear
    </button>
  </div>

  <div>
    <label for="tag-filter" class="block text-xs text-surface-400 mb-1">Tags</label>
    <input
      id="tag-filter"
      type="text"
      bind:value={tagFilter}
      on:change={applyFilters}
      placeholder="Comma-separated"
      class="w-full px-2 py-1.5 rounded bg-surface-700 border border-surface-600
             text-surface-200 text-xs focus:outline-none focus:border-blue-500"
    />
  </div>

  <div class="grid grid-cols-2 gap-2">
    <div>
      <label for="mood-min" class="block text-xs text-surface-400 mb-1">Mood Min</label>
      <input
        id="mood-min"
        type="number"
        min="1"
        max="5"
        bind:value={moodMin}
        on:change={applyFilters}
        class="w-full px-2 py-1.5 rounded bg-surface-700 border border-surface-600
               text-surface-200 text-xs"
      />
    </div>
    <div>
      <label for="mood-max" class="block text-xs text-surface-400 mb-1">Mood Max</label>
      <input
        id="mood-max"
        type="number"
        min="1"
        max="5"
        bind:value={moodMax}
        on:change={applyFilters}
        class="w-full px-2 py-1.5 rounded bg-surface-700 border border-surface-600
               text-surface-200 text-xs"
      />
    </div>
  </div>

  <div class="grid grid-cols-2 gap-2">
    <div>
      <label for="date-start" class="block text-xs text-surface-400 mb-1">From</label>
      <input
        id="date-start"
        type="date"
        bind:value={dateStart}
        on:change={applyFilters}
        class="w-full px-2 py-1.5 rounded bg-surface-700 border border-surface-600
               text-surface-200 text-xs"
      />
    </div>
    <div>
      <label for="date-end" class="block text-xs text-surface-400 mb-1">To</label>
      <input
        id="date-end"
        type="date"
        bind:value={dateEnd}
        on:change={applyFilters}
        class="w-full px-2 py-1.5 rounded bg-surface-700 border border-surface-600
               text-surface-200 text-xs"
      />
    </div>
  </div>

  <div>
    <label for="sort-select" class="block text-xs text-surface-400 mb-1">Sort</label>
    <select
      id="sort-select"
      on:change={handleSortChange}
      class="w-full px-2 py-1.5 rounded bg-surface-700 border border-surface-600
             text-surface-200 text-xs"
    >
      <option value="relevance_desc">Relevance</option>
      <option value="date_desc">Date (Newest)</option>
      <option value="date_asc">Date (Oldest)</option>
      <option value="title_asc">Title (A-Z)</option>
      <option value="title_desc">Title (Z-A)</option>
      <option value="mood_asc">Mood (Low-High)</option>
      <option value="mood_desc">Mood (High-Low)</option>
    </select>
  </div>
</div>
