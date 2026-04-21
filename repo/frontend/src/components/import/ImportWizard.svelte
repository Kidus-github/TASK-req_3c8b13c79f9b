<script lang="ts">
  import { onMount } from 'svelte';
  import type { ImportBatch, ImportRowResult, DedupeMode } from '$lib/types/import';
  import type { RawRow, RowValidationResult } from '$lib/workers/protocol';
  import * as importService from '$lib/services/import.service';
  import * as parserRuleService from '$lib/services/parser-rule.service';
  import { runJob, cancelRunningJob } from '$lib/services/queue-runner.service';
  import { currentProfileId } from '$lib/stores/auth.store';
  import { loadCards } from '$lib/stores/cards.store';
  import { pushToast } from '$lib/stores/toast.store';
  import { jobs as allJobs } from '$lib/stores/jobs.store';
  import FileDropZone from './FileDropZone.svelte';
  import ValidationReport from './ValidationReport.svelte';
  import ImportProgress from './ImportProgress.svelte';
  import { config } from '$lib/config';
  import { get } from 'svelte/store';

  type Step = 'upload' | 'validating' | 'review' | 'committing' | 'done';

  let step: Step = 'upload';
  let batch: ImportBatch | null = null;
  let currentJobId: string | null = null;
  let rawRows: RawRow[] = [];
  let validationResults: RowValidationResult[] = [];
  let importRows: ImportRowResult[] = [];
  let dedupeMode: DedupeMode = 'create_new';
  let commitResult: { imported: number; skipped: number; failed: number } | null = null;
  let useJsonParserRule = false;
  let selectedJsonRuleId: string | null = null;
  let availableJsonRules: { id: string; name: string; status: string }[] = [];

  // Live progress from the shared jobs store so the import page and the global
  // drawer reflect the same job record while the worker runs.
  $: liveJob = currentJobId ? $allJobs.find(j => j.id === currentJobId) : undefined;
  $: livePercent = liveJob?.progressPercent ?? 0;

  onMount(() => {
    const profileId = get(currentProfileId);
    if (profileId) void refreshJsonRules(profileId);
  });

  async function refreshJsonRules(profileId: string) {
    const rules = await parserRuleService.listRuleSets(profileId);
    availableJsonRules = rules
      .filter(r => r.sourceType === 'json' && (r.status === 'active' || r.status === 'canary_passed'))
      .map(r => ({ id: r.id, name: r.name, status: r.status }));
  }

  // Keep the selected JSON rule anchored to a valid option even when the
  // options list refreshes before the select is mounted or when the prior
  // selection disappears after an update.
  $: if (
    availableJsonRules.length > 0 &&
    (!selectedJsonRuleId || !availableJsonRules.some(rule => rule.id === selectedJsonRuleId))
  ) {
    const active = availableJsonRules.find(rule => rule.status === 'active');
    selectedJsonRuleId = active?.id ?? availableJsonRules[0].id;
  }

  async function handleFile(event: CustomEvent<{ file: File; type: string }>) {
    const { file, type } = event.detail;
    const profileId = get(currentProfileId);
    if (!profileId) return;

    if (type === 'html_snapshot') {
      await handleHtmlFile(profileId, file);
      return;
    }

    if (type === 'json' && useJsonParserRule) {
      await handleJsonSnapshotFile(profileId, file);
      return;
    }

    batch = await importService.createImportBatch(profileId, file.name, type as 'csv' | 'json', dedupeMode, file);
    step = 'validating';

    try {
      const text = await file.text();
      const { result } = await runJob<{ rows: RawRow[]; results: RowValidationResult[]; count: number }>(
        'import_parse_validate',
        { format: type, text, maxRows: config.maxImportRows },
        { payloadRef: batch.id, onStart: (id) => { currentJobId = id; } }
      );

      rawRows = result.rows;
      validationResults = result.results;

      await importService.storeValidationResults(batch.id, validationResults, rawRows);
      importRows = await importService.getImportRows(batch.id);
      step = 'review';
    } catch (e) {
      pushToast(`Import failed: ${(e as Error).message}`, 'error');
      step = 'upload';
    }
  }

  async function handleJsonSnapshotFile(profileId: string, file: File) {
    const ruleId = selectedJsonRuleId;
    if (!ruleId) {
      pushToast('Select a JSON parser rule before importing a JSON snapshot.', 'warning');
      return;
    }
    const rule = await parserRuleService.getRuleSet(ruleId);
    if (!rule || rule.sourceType !== 'json') {
      pushToast('Selected rule is not a JSON parser rule.', 'error');
      return;
    }

    batch = await importService.createImportBatch(profileId, file.name, 'json_snapshot', dedupeMode, file);
    step = 'validating';

    try {
      const text = await file.text();
      const extracted = parserRuleService.extractFromJsonSnapshot(rule, text);

      if (extracted.rows.length === 0) {
        pushToast('No rows extracted from JSON snapshot. Check parser rule selectors.', 'error');
        step = 'upload';
        return;
      }

      const jsonText = JSON.stringify(extracted.rows);
      const { result: validated } = await runJob<{ rows: RawRow[]; results: RowValidationResult[]; count: number }>(
        'import_parse_validate',
        { format: 'json', text: jsonText, maxRows: config.maxImportRows },
        { payloadRef: batch.id, onStart: (id) => { currentJobId = id; } }
      );

      rawRows = validated.rows;
      validationResults = validated.results;

      await importService.storeValidationResults(batch.id, validationResults, rawRows);
      importRows = await importService.getImportRows(batch.id);
      step = 'review';
    } catch (e) {
      pushToast(`JSON snapshot import failed: ${(e as Error).message}`, 'error');
      step = 'upload';
    }
  }

  async function handleHtmlFile(profileId: string, file: File) {
    const active = await parserRuleService.listRuleSets(profileId);
    const activeHtmlRule = active.find(r => r.status === 'active' && r.sourceType === 'html');
    if (!activeHtmlRule) {
      pushToast('HTML imports require an active parser rule. Configure one in Parser Rules.', 'warning');
      return;
    }

    batch = await importService.createImportBatch(profileId, file.name, 'html_snapshot', dedupeMode, file);
    step = 'validating';

    try {
      const text = await file.text();
      const containerSelector = activeHtmlRule.selectors[0]?.expression ?? 'body';
      const fieldSelectors: Record<string, string> = {};
      for (const fm of activeHtmlRule.fieldMappings) fieldSelectors[fm.targetField] = fm.sourceSelector;

      const { result: extracted } = await runJob<{ rows: Record<string, string>[]; count: number; errors: string[] }>(
        'parser_full_extract',
        {
          sourceType: 'html',
          content: text,
          containerSelector,
          selectorType: activeHtmlRule.selectors[0]?.selectorType ?? 'css',
          fieldSelectors,
        },
        { payloadRef: batch.id, onStart: (id) => { currentJobId = id; } }
      );

      if (extracted.rows.length === 0) {
        pushToast('No rows extracted from HTML. Review parser rule selectors.', 'error');
        step = 'upload';
        return;
      }

      // Feed extracted rows through the validator via a synthetic JSON payload
      const jsonText = JSON.stringify(extracted.rows);
      const { result: validated } = await runJob<{ rows: RawRow[]; results: RowValidationResult[]; count: number }>(
        'import_parse_validate',
        { format: 'json', text: jsonText, maxRows: config.maxImportRows },
        { payloadRef: batch.id, onStart: (id) => { currentJobId = id; } }
      );

      rawRows = validated.rows;
      validationResults = validated.results;

      await importService.storeValidationResults(batch.id, validationResults, rawRows);
      importRows = await importService.getImportRows(batch.id);
      step = 'review';
    } catch (e) {
      pushToast(`HTML import failed: ${(e as Error).message}`, 'error');
      step = 'upload';
    }
  }

  async function handleCommit() {
    if (!batch) return;
    const profileId = get(currentProfileId);
    if (!profileId) return;

    step = 'committing';
    currentJobId = null;
    const result = await importService.commitValidRows(batch.id, profileId, dedupeMode, {
      onJobStart: (id) => { currentJobId = id; },
    });

    if (result.ok) {
      commitResult = result.data;
      pushToast(
        `Imported ${result.data.imported} cards` +
        (result.data.skipped > 0 ? `, ${result.data.skipped} skipped` : '') +
        (result.data.failed > 0 ? `, ${result.data.failed} failed` : ''),
        result.data.failed > 0 ? 'warning' : 'success'
      );
      await loadCards();
    } else {
      pushToast(result.error.message, 'error');
    }
    step = 'done';
  }

  async function handleCancel() {
    if (currentJobId) await cancelRunningJob(currentJobId).catch(() => {});
    if (batch) await importService.cancelImport(batch.id);
    reset();
  }

  async function handleDownloadErrors() {
    if (!batch) return;
    const log = await importService.generateErrorLog(batch.id);
    const blob = new Blob([log], { type: 'application/jsonl' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `import-errors-${batch.id}.jsonl`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function reset() {
    step = 'upload';
    batch = null;
    currentJobId = null;
    rawRows = [];
    validationResults = [];
    importRows = [];
    commitResult = null;
  }

  $: validCount = validationResults.filter(r => r.valid).length;
  $: invalidCount = validationResults.filter(r => !r.valid).length;
</script>

<div class="space-y-6">
  {#if step === 'upload'}
    <div class="space-y-4">
      <div>
        <label for="dedupe-mode" class="block text-sm text-surface-300 mb-1">Duplicate Handling</label>
        <select
          id="dedupe-mode"
          bind:value={dedupeMode}
          class="w-full px-3 py-2 rounded-lg bg-surface-700 border border-surface-600
                 text-surface-100 focus:outline-none focus:border-blue-500"
        >
          <option value="create_new">Create new cards (ignore duplicates)</option>
          <option value="skip_exact_duplicate">Skip exact duplicates</option>
          <option value="overwrite_by_id">Overwrite by ID (requires an `id` column)</option>
        </select>
        {#if dedupeMode === 'overwrite_by_id'}
          <p class="text-xs text-surface-500 mt-1">
            Each row's <code class="text-surface-300">id</code> column is matched against an existing
            card. Matching rows overwrite the card (preserving createdAt, bumping version, writing a
            revision). Rows missing an id or with no matching card are reported as failures.
          </p>
        {/if}
      </div>

      <div class="space-y-2">
        <label class="flex items-center gap-2 text-sm text-surface-300">
          <input type="checkbox" bind:checked={useJsonParserRule} />
          Apply a JSON parser rule to extract rows from a JSON snapshot
        </label>
        {#if useJsonParserRule}
          <div>
            <label for="json-rule" class="block text-xs text-surface-400 mb-1">JSON parser rule</label>
            <select
              id="json-rule"
              bind:value={selectedJsonRuleId}
              class="w-full px-3 py-2 rounded-lg bg-surface-700 border border-surface-600 text-surface-100 focus:outline-none focus:border-blue-500"
            >
              {#each availableJsonRules as rule}
                <option value={rule.id}>{rule.name} ({rule.status})</option>
              {/each}
              {#if availableJsonRules.length === 0}
                <option disabled>No JSON rules available. Configure one in Parser Rules.</option>
              {/if}
            </select>
          </div>
        {/if}
      </div>

      <FileDropZone on:file={handleFile} />
      <p class="text-xs text-surface-500">
        HTML snapshot imports require an active parser rule. JSON snapshot imports
        use the selected JSON parser rule when the toggle above is on.
      </p>
    </div>

  {:else if step === 'validating'}
    <ImportProgress
      progress={livePercent}
      total={100}
      status="Parsing & validating via worker..."
      on:cancel={handleCancel}
    />

  {:else if step === 'review'}
    <ValidationReport
      rows={importRows}
      {validCount}
      {invalidCount}
      on:commit={handleCommit}
      on:cancel={handleCancel}
      on:downloadErrors={handleDownloadErrors}
    />

  {:else if step === 'committing'}
    <ImportProgress
      progress={livePercent}
      total={100}
      status="Committing valid rows..."
      cancellable={false}
    />

  {:else if step === 'done'}
    <div class="text-center py-8">
      {#if commitResult}
        <p class="text-lg text-surface-100">Import Complete</p>
        <div class="mt-3 space-y-1 text-sm">
          <p class="text-green-400">{commitResult.imported} cards imported</p>
          {#if commitResult.skipped > 0}
            <p class="text-yellow-400">{commitResult.skipped} skipped</p>
          {/if}
          {#if commitResult.failed > 0}
            <p class="text-red-400">{commitResult.failed} failed</p>
          {/if}
        </div>
      {/if}
      <button
        class="mt-4 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors text-sm"
        on:click={reset}
      >
        Import Another File
      </button>
    </div>
  {/if}
</div>
