<script lang="ts">
  import BackupExport from '../components/backup/BackupExport.svelte';
  import BackupImport from '../components/backup/BackupImport.svelte';
</script>

<div class="max-w-2xl mx-auto space-y-8">
  <div>
    <h1 class="text-2xl font-bold text-surface-50">Backup & Restore</h1>
    <p class="text-surface-400 mt-1">Export your data as a file or restore from a previous backup.</p>
  </div>

  <div class="bg-surface-800 rounded-lg border border-surface-700 p-6">
    <BackupExport />
  </div>

  <div class="bg-surface-800 rounded-lg border border-surface-700 p-6">
    <BackupImport />
  </div>
</div>
