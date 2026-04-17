<script lang="ts">
  import { currentProfileId } from '$lib/stores/auth.store';
  import { pushToast } from '$lib/stores/toast.store';
  import * as backupService from '$lib/services/backup.service';
  import { get } from 'svelte/store';

  let passphrase = '';
  let confirmPassphrase = '';
  let usePassphrase = false;
  let exporting = false;

  async function handleExport() {
    const profileId = get(currentProfileId);
    if (!profileId) return;

    if (usePassphrase && passphrase !== confirmPassphrase) {
      pushToast('Passphrases do not match', 'error');
      return;
    }

    exporting = true;
    try {
      const result = await backupService.exportBackup(profileId, usePassphrase ? passphrase : undefined);
      if (result.ok) {
        const url = URL.createObjectURL(result.data);
        const a = document.createElement('a');
        a.href = url;
        a.download = `nebulaforge-backup-${new Date().toISOString().slice(0, 10)}.nebula`;
        a.click();
        URL.revokeObjectURL(url);
        pushToast('Backup exported successfully', 'success');
        passphrase = '';
        confirmPassphrase = '';
      } else {
        pushToast(result.error.message, 'error');
      }
    } catch (e) {
      pushToast(`Export failed: ${(e as Error).message}`, 'error');
    }
    exporting = false;
  }
</script>

<div class="space-y-4">
  <h3 class="text-lg font-medium text-surface-200">Export Backup</h3>
  <p class="text-sm text-surface-400">
    Export all your data as a single file. This backup is for local privacy convenience, not tamper-proof security.
  </p>

  <label class="flex items-center gap-2 text-sm text-surface-300">
    <input type="checkbox" bind:checked={usePassphrase} class="rounded" />
    Protect with passphrase
  </label>

  {#if usePassphrase}
    <div class="space-y-2">
      <input
        type="password"
        bind:value={passphrase}
        placeholder="Enter passphrase"
        class="w-full px-3 py-2 rounded-lg bg-surface-700 border border-surface-600
               text-surface-100 text-sm focus:outline-none focus:border-blue-500"
      />
      <input
        type="password"
        bind:value={confirmPassphrase}
        placeholder="Confirm passphrase"
        class="w-full px-3 py-2 rounded-lg bg-surface-700 border border-surface-600
               text-surface-100 text-sm focus:outline-none focus:border-blue-500"
      />
    </div>
  {/if}

  <button
    class="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors text-sm
           disabled:opacity-50"
    disabled={exporting || (usePassphrase && (!passphrase || passphrase !== confirmPassphrase))}
    on:click={handleExport}
  >
    {exporting ? 'Exporting...' : 'Export Backup'}
  </button>
</div>
