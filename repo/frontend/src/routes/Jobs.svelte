<script lang="ts">
  import JobMonitor from '../components/jobs/JobMonitor.svelte';
</script>

<div class="max-w-4xl mx-auto">
  <div class="mb-6">
    <h1 class="text-2xl font-bold text-surface-50">Job Monitor</h1>
    <p class="text-surface-400 mt-1">Track background jobs, view metrics, and manage failed tasks.</p>
  </div>

  <JobMonitor />
</div>
