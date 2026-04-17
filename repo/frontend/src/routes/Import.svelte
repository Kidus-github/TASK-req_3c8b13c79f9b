<script lang="ts">
  import ImportWizard from '../components/import/ImportWizard.svelte';
</script>

<div class="max-w-4xl mx-auto">
  <div class="mb-6">
    <h1 class="text-2xl font-bold text-surface-50">Import Cards</h1>
    <p class="text-surface-400 mt-1">Import inspiration cards from CSV or JSON files. Max 1,000 rows per batch.</p>
  </div>

  <div class="bg-surface-800 rounded-lg border border-surface-700 p-6">
    <ImportWizard />
  </div>
</div>
