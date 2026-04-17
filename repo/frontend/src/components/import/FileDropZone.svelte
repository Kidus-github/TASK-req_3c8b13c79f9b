<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let acceptedTypes = '.csv,.json,.html';
  export let disabled = false;

  const dispatch = createEventDispatcher<{
    file: { file: File; type: string };
  }>();

  let isDragOver = false;

  const typeMap: Record<string, string> = {
    'text/csv': 'csv',
    'application/json': 'json',
    'text/html': 'html_snapshot',
    'csv': 'csv',
    'json': 'json',
    'html': 'html_snapshot',
  };

  function getFileType(file: File): string | null {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    return typeMap[file.type] ?? typeMap[ext] ?? null;
  }

  function handleFile(file: File) {
    const type = getFileType(file);
    if (!type) return;
    dispatch('file', { file, type });
  }

  function handleDrop(e: DragEvent) {
    isDragOver = false;
    if (disabled) return;
    const file = e.dataTransfer?.files[0];
    if (file) handleFile(file);
  }

  function handleInput(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) handleFile(file);
    input.value = '';
  }
</script>

<div
  class="border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer
         {isDragOver ? 'border-blue-500 bg-blue-500/10' : 'border-surface-600 hover:border-surface-500'}
         {disabled ? 'opacity-50 cursor-not-allowed' : ''}"
  on:dragover|preventDefault={() => { if (!disabled) isDragOver = true; }}
  on:dragleave={() => { isDragOver = false; }}
  on:drop|preventDefault={handleDrop}
  role="button"
  tabindex="0"
>
  <p class="text-surface-300 mb-2">
    Drag & drop a file here, or click to browse
  </p>
  <p class="text-xs text-surface-500">
    Supported: CSV, JSON, HTML
  </p>
  <input
    type="file"
    accept={acceptedTypes}
    class="hidden"
    on:change={handleInput}
    {disabled}
    id="file-upload"
  />
  <label
    for="file-upload"
    class="inline-block mt-3 px-4 py-2 rounded-lg bg-surface-700 text-surface-300
           hover:bg-surface-600 transition-colors text-sm cursor-pointer"
  >
    Choose File
  </label>
</div>
