<script lang="ts">
  import { onMount } from 'svelte';
  import StreakTracker from '../components/voyage/StreakTracker.svelte';
  import { loadVoyageData } from '$lib/stores/voyage.store';

  onMount(() => {
    loadVoyageData();
  });
</script>

<div class="max-w-2xl mx-auto">
  <div class="mb-6">
    <h1 class="text-2xl font-bold text-surface-50">Voyage Mission</h1>
    <p class="text-surface-400 mt-1">View 10 distinct cards daily to build your streak and unlock stardust.</p>
  </div>

  <div class="bg-surface-800 rounded-lg border border-surface-700 p-6">
    <StreakTracker />
  </div>
</div>
