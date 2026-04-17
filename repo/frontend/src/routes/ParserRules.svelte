<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { currentProfileId } from '$lib/stores/auth.store';
  import { pushToast } from '$lib/stores/toast.store';
  import * as parserService from '$lib/services/parser-rule.service';
  import type { ParsingRuleSet, RuleSelector, FieldMapping } from '$lib/types/parser-rule';
  import RuleEditor from '../components/parser-rules/RuleEditor.svelte';
  import CanaryRunner from '../components/parser-rules/CanaryRunner.svelte';
  import VersionHistory from '../components/parser-rules/VersionHistory.svelte';

  type Mode = 'list' | 'create' | 'canary' | 'edit' | 'history';

  let rules: ParsingRuleSet[] = [];
  let mode: Mode = 'list';
  let selectedRule: ParsingRuleSet | null = null;
  let editDraft: {
    name: string;
    sourceType: 'html' | 'json';
    selectors: RuleSelector[];
    fieldMappings: FieldMapping[];
    cloneAsNew: boolean;
  } | null = null;

  onMount(loadRules);

  async function loadRules() {
    const profileId = get(currentProfileId);
    if (profileId) {
      rules = await parserService.listRuleSets(profileId);
      if (selectedRule) {
        selectedRule = rules.find(r => r.id === selectedRule!.id) ?? null;
      }
    }
  }

  async function handleCreate(event: CustomEvent<any>) {
    const { name, sourceType, selectors, fieldMappings } = event.detail;
    const profileId = get(currentProfileId);
    if (!profileId) return;

    const result = await parserService.createRuleSet(profileId, name, sourceType, selectors, fieldMappings);
    if (result.ok) {
      pushToast('Rule created', 'success');
      mode = 'list';
      await loadRules();
    } else {
      pushToast(result.error.message, 'error');
    }
  }

  async function handleEditSave(event: CustomEvent<any>) {
    const { name, sourceType, selectors, fieldMappings } = event.detail;
    if (!selectedRule || !editDraft) return;
    const profileId = get(currentProfileId);
    if (!profileId) return;

    if (editDraft.cloneAsNew) {
      // Active rules cannot be edited in place — clone into a new rule set so
      // the old one keeps serving imports until the new one activates.
      const result = await parserService.createRuleSet(profileId, name, sourceType, selectors, fieldMappings);
      if (result.ok) {
        pushToast(`Created new rule "${name}" v1 from "${selectedRule.name}" v${selectedRule.ruleVersion}`, 'success');
        selectedRule = result.data;
        mode = 'canary';
        await loadRules();
      } else {
        pushToast(result.error.message, 'error');
      }
      return;
    }

    const result = await parserService.updateRuleSet(selectedRule.id, selectors, fieldMappings);
    if (result.ok) {
      pushToast(`Saved as v${result.data.ruleVersion}`, 'success');
      selectedRule = result.data;
      mode = 'history';
      await loadRules();
    } else {
      pushToast(result.error.message, 'error');
    }
  }

  async function handleMarkCanaryReady(rule: ParsingRuleSet) {
    const result = await parserService.markCanaryReady(rule.id);
    if (result.ok) {
      pushToast('Ready for canary testing', 'success');
      await loadRules();
    } else {
      pushToast(result.error.message, 'error');
    }
  }

  async function handleArchive(rule: ParsingRuleSet) {
    await parserService.archiveRuleSet(rule.id);
    pushToast('Rule archived', 'success');
    await loadRules();
  }

  async function openEdit(rule: ParsingRuleSet) {
    selectedRule = rule;
    editDraft = {
      name: rule.status === 'active' ? `${rule.name} (new version)` : rule.name,
      sourceType: rule.sourceType,
      selectors: rule.selectors.map(s => ({ ...s })),
      fieldMappings: rule.fieldMappings.map(m => ({ ...m })),
      cloneAsNew: rule.status === 'active',
    };
    mode = 'edit';
  }

  function openCanary(rule: ParsingRuleSet) {
    selectedRule = rule;
    mode = 'canary';
  }

  function openHistory(rule: ParsingRuleSet) {
    selectedRule = rule;
    mode = 'history';
  }

  const statusColors: Record<string, string> = {
    draft: 'bg-surface-600 text-surface-300',
    canary_ready: 'bg-blue-900 text-blue-300',
    canary_running: 'bg-yellow-900 text-yellow-300',
    canary_passed: 'bg-green-900 text-green-300',
    canary_failed: 'bg-red-900 text-red-300',
    active: 'bg-emerald-900 text-emerald-300',
    archived: 'bg-surface-700 text-surface-500',
  };
</script>

<div class="max-w-4xl mx-auto">
  <div class="flex items-center justify-between mb-6">
    <div>
      <h1 class="text-2xl font-bold text-surface-50">Parser Rules</h1>
      <p class="text-surface-400 mt-1">Create extraction rules for HTML/JSON sources with canary testing and full version history.</p>
    </div>
    {#if mode === 'list'}
      <button
        class="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm"
        on:click={() => mode = 'create'}
      >
        New Rule
      </button>
    {:else}
      <button
        class="px-4 py-2 rounded-lg bg-surface-700 text-surface-300 text-sm"
        on:click={() => { mode = 'list'; selectedRule = null; editDraft = null; }}
      >
        Back
      </button>
    {/if}
  </div>

  {#if mode === 'create'}
    <div class="bg-surface-800 rounded-lg border border-surface-700 p-6">
      <RuleEditor on:save={handleCreate} on:cancel={() => mode = 'list'} />
    </div>
  {:else if mode === 'edit' && selectedRule && editDraft}
    <div class="bg-surface-800 rounded-lg border border-surface-700 p-6 space-y-4" data-testid="edit-panel">
      <div>
        <h2 class="text-lg font-medium text-surface-100">
          Editing {selectedRule.name}
          <span class="text-sm text-surface-500">v{selectedRule.ruleVersion}</span>
        </h2>
        {#if editDraft.cloneAsNew}
          <p class="text-xs text-yellow-400 mt-1">
            Rule is active — your edits will create a <strong>new rule</strong> so imports keep using the current one until you run canary and activate the new rule.
          </p>
        {:else}
          <p class="text-xs text-surface-400 mt-1">
            Saving will create a new draft <strong>version {selectedRule.ruleVersion + 1}</strong> on this rule set.
          </p>
        {/if}
      </div>
      <RuleEditor
        name={editDraft.name}
        sourceType={editDraft.sourceType}
        selectors={editDraft.selectors}
        fieldMappings={editDraft.fieldMappings}
        on:save={handleEditSave}
        on:cancel={() => { mode = 'list'; editDraft = null; }}
      />
    </div>
  {:else if mode === 'history' && selectedRule}
    <div class="bg-surface-800 rounded-lg border border-surface-700 p-6 space-y-4" data-testid="history-panel">
      <div class="flex items-start justify-between">
        <div>
          <h2 class="text-lg font-medium text-surface-100">{selectedRule.name}</h2>
          <p class="text-xs text-surface-500">
            {selectedRule.sourceType} • current v{selectedRule.ruleVersion}
            <span class="ml-2 px-1.5 py-0.5 rounded {statusColors[selectedRule.status] ?? ''}">{selectedRule.status}</span>
          </p>
        </div>
        <button
          class="text-xs text-blue-400 hover:text-blue-300"
          on:click={() => selectedRule && openEdit(selectedRule)}
        >
          Edit into new version
        </button>
      </div>
      <VersionHistory rule={selectedRule} />
    </div>
  {:else if mode === 'canary' && selectedRule}
    <div class="bg-surface-800 rounded-lg border border-surface-700 p-6 space-y-4">
      <div>
        <h2 class="text-lg font-medium text-surface-100">{selectedRule.name}</h2>
        <p class="text-xs text-surface-500">
          {selectedRule.sourceType} | {selectedRule.selectors.length} selectors | v{selectedRule.ruleVersion}
          <span class="ml-2 px-1.5 py-0.5 rounded {statusColors[selectedRule.status] ?? ''}">{selectedRule.status}</span>
        </p>
      </div>
      <CanaryRunner rule={selectedRule} on:updated={loadRules} />
    </div>
  {:else}
    <div class="space-y-3">
      {#each rules as rule (rule.id)}
        <div class="p-4 rounded-lg bg-surface-800 border border-surface-700" data-testid="rule-row" data-rule-id={rule.id}>
          <div class="flex items-center justify-between">
            <div>
              <span class="font-medium text-surface-200">{rule.name}</span>
              <span class="ml-2 text-xs text-surface-500" data-testid="rule-version">v{rule.ruleVersion}</span>
              <span class="ml-2 px-1.5 py-0.5 rounded text-xs {statusColors[rule.status] ?? ''}">{rule.status}</span>
            </div>
            <div class="flex gap-2">
              <button class="text-xs text-surface-300 hover:text-surface-100" data-testid="rule-history" on:click={() => openHistory(rule)}>History</button>
              {#if rule.status !== 'archived'}
                <button class="text-xs text-blue-400" data-testid="rule-edit" on:click={() => openEdit(rule)}>Edit → new version</button>
              {/if}
              {#if rule.status === 'draft'}
                <button class="text-xs text-blue-400" on:click={() => handleMarkCanaryReady(rule)}>Mark Ready</button>
              {/if}
              {#if rule.status === 'canary_ready' || rule.status === 'canary_failed' || rule.status === 'canary_passed'}
                <button class="text-xs text-yellow-400" on:click={() => openCanary(rule)}>Run Canary</button>
              {/if}
              {#if rule.status !== 'archived'}
                <button class="text-xs text-surface-400" on:click={() => handleArchive(rule)}>Archive</button>
              {/if}
            </div>
          </div>
          <p class="text-xs text-surface-500 mt-1">{rule.sourceType} | {rule.selectors.length} selectors | {rule.fieldMappings.length} mappings</p>
        </div>
      {:else}
        <div class="text-center py-8 text-surface-500">No parser rules yet.</div>
      {/each}
    </div>
  {/if}
</div>
