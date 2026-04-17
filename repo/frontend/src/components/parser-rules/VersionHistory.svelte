<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import type { ParsingRuleSet, ParserRuleVersion } from '$lib/types/parser-rule';
  import * as parserService from '$lib/services/parser-rule.service';

  export let rule: ParsingRuleSet;

  const dispatch = createEventDispatcher<{
    select: { version: ParserRuleVersion };
    back: void;
  }>();

  let versions: ParserRuleVersion[] = [];
  let selected: ParserRuleVersion | null = null;

  async function refresh() {
    versions = (await parserService.getRuleVersions(rule.id)).sort((a, b) => b.version - a.version);
    if (!selected) {
      selected = versions.find(v => v.version === rule.ruleVersion) ?? versions[0] ?? null;
    }
  }

  onMount(refresh);

  $: void rule && refresh();

  function pick(v: ParserRuleVersion) {
    selected = v;
    dispatch('select', { version: v });
  }
</script>

<div class="space-y-3" data-testid="version-history">
  <div class="flex items-center justify-between">
    <h3 class="text-sm font-medium text-surface-200">Version History</h3>
    <span class="text-xs text-surface-500">{versions.length} version{versions.length === 1 ? '' : 's'}</span>
  </div>

  {#if versions.length === 0}
    <p class="text-sm text-surface-500">No versions recorded for this rule yet.</p>
  {:else}
    <ul class="space-y-1">
      {#each versions as v (v.id)}
        <li>
          <button
            type="button"
            class="w-full flex items-center justify-between px-3 py-2 rounded-md border text-left text-xs
              {selected?.id === v.id ? 'bg-surface-700 border-blue-500' : 'bg-surface-800 border-surface-700 hover:border-surface-500'}"
            data-testid="version-row"
            data-version={v.version}
            on:click={() => pick(v)}
          >
            <div class="flex items-center gap-2">
              <span class="font-mono text-surface-100">v{v.version}</span>
              {#if v.version === rule.ruleVersion}
                <span class="px-1.5 py-0.5 rounded bg-emerald-900 text-emerald-300">current</span>
              {/if}
            </div>
            <span class="text-surface-500">{new Date(v.createdAt).toLocaleString()}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}

  {#if selected}
    <div class="p-3 rounded-md bg-surface-900 border border-surface-700">
      <p class="text-xs text-surface-400 mb-2">Selectors</p>
      <ul class="text-xs text-surface-300 space-y-1">
        {#each selected.selectors as s}
          <li class="font-mono truncate">[{s.selectorType}] {s.expression}</li>
        {:else}
          <li class="text-surface-500">No selectors.</li>
        {/each}
      </ul>
      <p class="text-xs text-surface-400 mt-3 mb-2">Field Mappings</p>
      <ul class="text-xs text-surface-300 space-y-1">
        {#each selected.fieldMappings as fm}
          <li class="font-mono truncate">{fm.targetField} = {fm.sourceSelector}</li>
        {:else}
          <li class="text-surface-500">No mappings.</li>
        {/each}
      </ul>
    </div>
  {/if}
</div>
