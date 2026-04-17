<script lang="ts">
  export let remainingMs: number;

  $: seconds = Math.ceil(remainingMs / 1000);
  $: minutes = Math.floor(seconds / 60);
  $: displaySeconds = seconds % 60;
</script>

<div class="bg-yellow-900/30 border border-yellow-800 rounded-lg p-4 mb-4 text-center">
  <p class="text-yellow-300 text-sm font-medium">Account Temporarily Locked</p>
  <p class="text-yellow-400/80 text-xs mt-1">Too many failed attempts. Please wait:</p>
  <p class="text-2xl font-mono text-yellow-200 mt-2">
    {minutes}:{displaySeconds.toString().padStart(2, '0')}
  </p>
</div>
