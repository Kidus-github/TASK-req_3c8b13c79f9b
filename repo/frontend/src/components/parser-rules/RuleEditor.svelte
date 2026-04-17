<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { RuleSelector, FieldMapping, ParserSourceType, SelectorType } from '$lib/types/parser-rule';

  export let name = '';
  export let sourceType: ParserSourceType = 'html';
  export let selectors: RuleSelector[] = [{ selectorType: 'css', expression: '', description: '' }];
  export let fieldMappings: FieldMapping[] = [
    { sourceSelector: '', targetField: 'title' },
    { sourceSelector: '', targetField: 'body' },
    { sourceSelector: '', targetField: 'date' },
    { sourceSelector: '', targetField: 'mood' },
  ];

  const dispatch = createEventDispatcher<{
    save: { name: string; sourceType: ParserSourceType; selectors: RuleSelector[]; fieldMappings: FieldMapping[] };
    cancel: void;
  }>();

  function addSelector() {
    selectors = [...selectors, { selectorType: 'css', expression: '', description: '' }];
  }

  function addMapping() {
    fieldMappings = [...fieldMappings, { sourceSelector: '', targetField: '' }];
  }

  function handleSave() {
    dispatch('save', { name, sourceType, selectors, fieldMappings });
  }
</script>

<div class="space-y-4">
  <div>
    <label for="rule-name" class="block text-sm text-surface-300 mb-1">Rule Name</label>
    <input id="rule-name" type="text" bind:value={name}
      class="w-full px-3 py-2 rounded-lg bg-surface-700 border border-surface-600 text-surface-100 text-sm" />
  </div>

  <div>
    <label for="source-type" class="block text-sm text-surface-300 mb-1">Source Type</label>
    <select id="source-type" bind:value={sourceType}
      class="w-full px-3 py-2 rounded-lg bg-surface-700 border border-surface-600 text-surface-100 text-sm">
      <option value="html">HTML</option>
      <option value="json">JSON</option>
    </select>
  </div>

  <div>
    <div class="flex items-center justify-between mb-2">
      <h3 class="text-sm font-medium text-surface-300">Selectors</h3>
      <button class="text-xs text-blue-400" on:click={addSelector}>+ Add</button>
    </div>
    {#each selectors as sel, i}
      <div class="grid grid-cols-3 gap-2 mb-2">
        <select bind:value={sel.selectorType}
          class="px-2 py-1.5 rounded bg-surface-700 border border-surface-600 text-surface-200 text-xs">
          <option value="css">CSS</option>
          <option value="xpath">XPath</option>
          <option value="jsonpath">JSONPath</option>
        </select>
        <input bind:value={sel.expression} placeholder="Selector expression"
          class="px-2 py-1.5 rounded bg-surface-700 border border-surface-600 text-surface-200 text-xs" />
        <input bind:value={sel.description} placeholder="Description"
          class="px-2 py-1.5 rounded bg-surface-700 border border-surface-600 text-surface-200 text-xs" />
      </div>
    {/each}
  </div>

  <div>
    <div class="flex items-center justify-between mb-2">
      <h3 class="text-sm font-medium text-surface-300">Field Mappings</h3>
      <button class="text-xs text-blue-400" on:click={addMapping}>+ Add</button>
    </div>
    {#each fieldMappings as map, i}
      <div class="grid grid-cols-2 gap-2 mb-2">
        <input bind:value={map.sourceSelector} placeholder="Source selector"
          class="px-2 py-1.5 rounded bg-surface-700 border border-surface-600 text-surface-200 text-xs" />
        <input bind:value={map.targetField} placeholder="Target field (title, body, date, mood, tags)"
          class="px-2 py-1.5 rounded bg-surface-700 border border-surface-600 text-surface-200 text-xs" />
      </div>
    {/each}
  </div>

  <div class="flex gap-3 justify-end">
    <button class="px-4 py-2 rounded-lg bg-surface-700 text-surface-300 text-sm" on:click={() => dispatch('cancel')}>Cancel</button>
    <button class="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm" on:click={handleSave}>Save Rule</button>
  </div>
</div>
