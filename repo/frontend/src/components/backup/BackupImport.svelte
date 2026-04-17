<script lang="ts">
  import { currentProfileId } from '$lib/stores/auth.store';
  import { loadCards } from '$lib/stores/cards.store';
  import { pushToast } from '$lib/stores/toast.store';
  import * as backupService from '$lib/services/backup.service';
  import type { BackupData, BackupPayload, RestoreMode } from '$lib/types/backup';
  import { get } from 'svelte/store';

  type Step = 'select' | 'passphrase' | 'confirm' | 'applying' | 'done';

  let step: Step = 'select';
  let fileContent: string | null = null;
  let passphrase = '';
  let restoreMode: RestoreMode = 'merge';
  let validatedData: BackupData | null = null;
  let validatedPayload: BackupPayload | null = null;
  let restoreResult: { restored: number } | null = null;

  function handleFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      fileContent = reader.result as string;
      tryValidate();
    };
    reader.readAsText(file);
  }

  async function tryValidate() {
    if (!fileContent) return;

    const result = await backupService.validateBackup(fileContent, passphrase || undefined);
    if (result.ok) {
      validatedData = result.data.data;
      validatedPayload = result.data.payload;
      step = 'confirm';
    } else if (result.error.code === 'VALIDATION' && result.error.message.includes('Passphrase')) {
      step = 'passphrase';
    } else {
      pushToast(result.error.message, 'error');
      step = 'select';
    }
  }

  async function handlePassphraseSubmit() {
    await tryValidate();
  }

  async function handleRestore() {
    if (!validatedData) return;
    const profileId = get(currentProfileId);
    if (!profileId) return;

    step = 'applying';
    const result = await backupService.restoreBackup(profileId, validatedData, restoreMode);
    if (result.ok) {
      restoreResult = result.data;
      pushToast(`Restored ${result.data.restored} items`, 'success');
      await loadCards();
    } else {
      pushToast(result.error.message, 'error');
    }
    step = 'done';
  }

  function reset() {
    step = 'select';
    fileContent = null;
    passphrase = '';
    validatedData = null;
    validatedPayload = null;
    restoreResult = null;
  }
</script>

<div class="space-y-4">
  <h3 class="text-lg font-medium text-surface-200">Restore Backup</h3>

  {#if step === 'select'}
    <input type="file" accept=".nebula,.json" on:change={handleFile}
      class="text-sm text-surface-400" />

  {:else if step === 'passphrase'}
    <div class="space-y-3">
      <p class="text-sm text-surface-400">This backup is encrypted. Enter the passphrase:</p>
      <input
        type="password"
        bind:value={passphrase}
        placeholder="Passphrase"
        class="w-full px-3 py-2 rounded-lg bg-surface-700 border border-surface-600
               text-surface-100 text-sm"
      />
      <button
        class="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm"
        on:click={handlePassphraseSubmit}
      >
        Decrypt
      </button>
    </div>

  {:else if step === 'confirm'}
    <div class="space-y-3">
      <p class="text-sm text-surface-300">Backup validated successfully. Choose restore mode:</p>
      <div class="space-y-2">
        <label class="flex items-center gap-2 text-sm text-surface-300">
          <input type="radio" bind:group={restoreMode} value="merge" />
          Merge (keep newer versions)
        </label>
        <label class="flex items-center gap-2 text-sm text-surface-300">
          <input type="radio" bind:group={restoreMode} value="replace" />
          Replace (delete existing, restore from backup)
        </label>
      </div>
      {#if restoreMode === 'replace'}
        <div class="bg-red-900/20 border border-red-800/50 rounded-lg p-3 text-sm text-red-300">
          Warning: Replace mode will delete all existing data before restoring.
        </div>
      {/if}
      <div class="flex gap-3">
        <button class="px-4 py-2 rounded-lg bg-surface-700 text-surface-300 text-sm" on:click={reset}>Cancel</button>
        <button class="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm" on:click={handleRestore}>Restore</button>
      </div>
    </div>

  {:else if step === 'applying'}
    <p class="text-sm text-surface-400">Restoring...</p>

  {:else if step === 'done'}
    <div class="text-center py-4">
      <p class="text-surface-200">Restore complete. {restoreResult?.restored ?? 0} items restored.</p>
      <button class="mt-3 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm" on:click={reset}>Done</button>
    </div>
  {/if}
</div>
