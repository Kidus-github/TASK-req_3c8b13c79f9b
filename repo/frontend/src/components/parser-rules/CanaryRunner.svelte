<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { ParsingRuleSet, ParsingCanaryRun } from '$lib/types/parser-rule';
  import * as parserService from '$lib/services/parser-rule.service';
  import { pushToast } from '$lib/stores/toast.store';

  export let rule: ParsingRuleSet;

  const dispatch = createEventDispatcher<{ updated: ParsingRuleSet | null }>();

  let samples: { name: string; content: string }[] = [];
  let lastRun: ParsingCanaryRun | null = null;
  let running = false;

  async function addFiles(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    const next: typeof samples = [];
    for (const f of files) next.push({ name: f.name, content: await f.text() });
    samples = [...samples, ...next];
    input.value = '';
  }

  function removeSample(idx: number) {
    samples = samples.filter((_, i) => i !== idx);
  }

  async function run() {
    if (samples.length === 0) {
      pushToast('Add at least one sample file', 'warning');
      return;
    }
    running = true;
    try {
      const result = await parserService.runCanaryWithDefaultExtract(rule.id, samples.map(s => s.content));
      if (result.ok) {
        lastRun = result.data;
        dispatch('updated', null);
        if (result.data.status === 'passed') {
          pushToast(`Canary passed (${result.data.passCount}/${result.data.sampleSize})`, 'success');
        } else {
          pushToast(`Canary failed (${result.data.failCount}/${result.data.sampleSize} failed)`, 'error');
        }
      } else {
        pushToast(result.error.message, 'error');
      }
    } finally {
      running = false;
    }
  }

  async function activate() {
    const result = await parserService.activateRuleSet(rule.id);
    if (result.ok) {
      pushToast('Rule activated — HTML/JSON imports will now use it', 'success');
      dispatch('updated', null);
    } else {
      pushToast(result.error.message, 'error');
    }
  }
</script>

<div class="space-y-4">
  <div>
    <p class="text-sm text-surface-300">Upload sample HTML/JSON files (5-20 recommended). The rule is scored on how many samples yield all required fields.</p>
  </div>

  <div class="border-2 border-dashed border-surface-600 rounded-lg p-4 text-center">
    <label class="cursor-pointer text-sm text-blue-400 hover:text-blue-300">
      Add sample files
      <input
        type="file"
        multiple
        accept={rule.sourceType === 'html' ? '.html,.htm,text/html' : '.json,application/json'}
        on:change={addFiles}
        class="hidden"
      />
    </label>
  </div>

  {#if samples.length > 0}
    <ul class="space-y-1 text-xs text-surface-400">
      {#each samples as s, i}
        <li class="flex items-center justify-between px-2 py-1 rounded bg-surface-700">
          <span>{s.name} ({s.content.length} chars)</span>
          <button class="text-red-400 hover:text-red-300" on:click={() => removeSample(i)}>Remove</button>
        </li>
      {/each}
    </ul>
  {/if}

  <div class="flex gap-2">
    <button
      class="px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-500 text-sm disabled:opacity-50"
      on:click={run}
      disabled={running || samples.length === 0}
    >
      {running ? 'Running...' : 'Run Canary'}
    </button>
    {#if rule.status === 'canary_passed'}
      <button
        class="px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 text-sm"
        on:click={activate}
      >
        Activate Rule
      </button>
    {/if}
  </div>

  {#if lastRun}
    <div class="rounded-lg border border-surface-700 bg-surface-900 p-3">
      <p class="text-sm">
        <span class="font-medium text-surface-100">Result:</span>
        <span class={lastRun.status === 'passed' ? 'text-green-400' : 'text-red-400'}>
          {lastRun.status.toUpperCase()}
        </span>
        — {lastRun.passCount} passed, {lastRun.failCount} failed of {lastRun.sampleSize}
      </p>
      <div class="mt-3 max-h-60 overflow-auto space-y-2 text-xs font-mono">
        {#each lastRun.resultsSummary as item}
          <div class="p-2 rounded bg-surface-800">
            <div class={item.passed ? 'text-green-400' : 'text-red-400'}>
              Sample #{item.sampleIndex + 1}: {item.passed ? 'PASS' : 'FAIL'}
            </div>
            {#if item.errors.length > 0}
              <div class="mt-1 text-red-300">{item.errors.join('; ')}</div>
            {/if}
            {#if Object.keys(item.extractedFields).length > 0}
              <div class="mt-1 grid grid-cols-2 gap-x-2 text-surface-400">
                {#each Object.entries(item.extractedFields) as [k, v]}
                  <span class="truncate"><span class="text-surface-500">{k}:</span> {v || '∅'}</span>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>
