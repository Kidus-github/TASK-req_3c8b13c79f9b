<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { ImportRowResult } from '$lib/types/import';

  export let rows: ImportRowResult[] = [];
  export let validCount = 0;
  export let invalidCount = 0;

  const dispatch = createEventDispatcher<{
    commit: void;
    cancel: void;
    downloadErrors: void;
  }>();

  let filter: 'all' | 'valid' | 'invalid' = 'all';

  $: filteredRows = filter === 'all'
    ? rows
    : rows.filter(r => filter === 'valid' ? r.status === 'valid' : r.status === 'invalid');
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <div class="flex gap-4 text-sm">
      <span class="text-green-400">{validCount} valid</span>
      <span class="text-red-400">{invalidCount} invalid</span>
      <span class="text-surface-400">{rows.length} total</span>
    </div>
    <div class="flex gap-2">
      <button
        class="px-3 py-1 rounded text-xs transition-colors
               {filter === 'all' ? 'bg-surface-600 text-surface-100' : 'bg-surface-800 text-surface-400'}"
        on:click={() => filter = 'all'}
      >All</button>
      <button
        class="px-3 py-1 rounded text-xs transition-colors
               {filter === 'valid' ? 'bg-green-900 text-green-300' : 'bg-surface-800 text-surface-400'}"
        on:click={() => filter = 'valid'}
      >Valid</button>
      <button
        class="px-3 py-1 rounded text-xs transition-colors
               {filter === 'invalid' ? 'bg-red-900 text-red-300' : 'bg-surface-800 text-surface-400'}"
        on:click={() => filter = 'invalid'}
      >Invalid</button>
    </div>
  </div>

  <div class="max-h-96 overflow-auto rounded border border-surface-700">
    <table class="w-full text-sm">
      <thead class="bg-surface-800 sticky top-0">
        <tr>
          <th class="p-2 text-left text-surface-400 font-medium">Row</th>
          <th class="p-2 text-left text-surface-400 font-medium">Status</th>
          <th class="p-2 text-left text-surface-400 font-medium">Title</th>
          <th class="p-2 text-left text-surface-400 font-medium">Errors</th>
        </tr>
      </thead>
      <tbody>
        {#each filteredRows as row (row.id)}
          <tr class="border-t border-surface-700/50">
            <td class="p-2 text-surface-300">{row.rowNumber}</td>
            <td class="p-2">
              <span class="px-1.5 py-0.5 rounded text-xs
                     {row.status === 'valid' ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'}">
                {row.status}
              </span>
            </td>
            <td class="p-2 text-surface-300 truncate max-w-48">
              {row.normalizedPayload?.title ?? row.rawPayload?.title ?? '-'}
            </td>
            <td class="p-2 text-red-400 text-xs">
              {#each row.errors as e}
                <span class="block">{e.field}: {e.message}</span>
              {/each}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <div class="flex justify-between">
    <button
      class="px-3 py-1.5 rounded-lg text-sm bg-surface-700 text-surface-300 hover:bg-surface-600 transition-colors"
      on:click={() => dispatch('downloadErrors')}
    >
      Download Error Log
    </button>

    <div class="flex gap-3">
      <button
        class="px-4 py-2 rounded-lg text-sm bg-surface-700 text-surface-300 hover:bg-surface-600 transition-colors"
        on:click={() => dispatch('cancel')}
      >
        Cancel
      </button>
      <button
        class="px-4 py-2 rounded-lg text-sm bg-blue-600 text-white hover:bg-blue-500 transition-colors
               disabled:opacity-50"
        disabled={validCount === 0}
        on:click={() => dispatch('commit')}
      >
        Import {validCount} Valid Rows
      </button>
    </div>
  </div>
</div>
