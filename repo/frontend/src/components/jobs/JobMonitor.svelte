<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { jobs, activeJobs, completedJobs, loadJobs, cancelJob, retryJob } from '$lib/stores/jobs.store';
  import { getMonitorSnapshots, getJobLogs, exportJobLogs } from '$lib/services/worker-queue.service';
  import { getHealthSnapshot } from '$lib/services/queue-runner.service';
  import type { MonitorMetricSnapshot, WorkerJobLog } from '$lib/types/worker';

  let snapshots: MonitorMetricSnapshot[] = [];
  let health = { activeCount: 0, queuedCount: 0, failuresLast24h: 0, avgThroughputByType: {} as Record<string, number> };
  let expandedJobId: string | null = null;
  let jobLogs: WorkerJobLog[] = [];
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  onMount(async () => {
    await refresh();
    pollTimer = setInterval(refresh, 1000);
  });

  onDestroy(() => {
    if (pollTimer) clearInterval(pollTimer);
  });

  async function refresh() {
    await loadJobs();
    snapshots = await getMonitorSnapshots();
    health = await getHealthSnapshot();
    if (expandedJobId) jobLogs = await getJobLogs(expandedJobId);
  }

  async function toggleLogs(jobId: string) {
    if (expandedJobId === jobId) {
      expandedJobId = null;
      jobLogs = [];
    } else {
      expandedJobId = jobId;
      jobLogs = await getJobLogs(jobId);
    }
  }

  async function downloadLogs(jobId: string) {
    const body = await exportJobLogs(jobId);
    const blob = new Blob([body], { type: 'application/jsonl' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `job-${jobId}.jsonl`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const statusColors: Record<string, string> = {
    queued: 'bg-surface-600 text-surface-300',
    running: 'bg-blue-900 text-blue-300',
    cancelling: 'bg-yellow-900 text-yellow-300',
    completed: 'bg-green-900 text-green-300',
    failed: 'bg-red-900 text-red-300',
    cancelled: 'bg-surface-700 text-surface-400',
    interrupted: 'bg-orange-900 text-orange-300',
  };

  const logLevelColor: Record<string, string> = {
    info: 'text-surface-300',
    debug: 'text-surface-500',
    warn: 'text-yellow-400',
    error: 'text-red-400',
  };
</script>

<div class="space-y-6">
  <div class="grid grid-cols-3 gap-3">
    <div class="p-3 rounded-lg bg-surface-800 border border-surface-700">
      <p class="text-xs text-surface-500">Active</p>
      <p class="text-lg font-bold text-blue-300">{health.activeCount}</p>
    </div>
    <div class="p-3 rounded-lg bg-surface-800 border border-surface-700">
      <p class="text-xs text-surface-500">Queued</p>
      <p class="text-lg font-bold text-surface-200">{health.queuedCount}</p>
    </div>
    <div class="p-3 rounded-lg bg-surface-800 border border-surface-700">
      <p class="text-xs text-surface-500">Failures (24h)</p>
      <p class="text-lg font-bold text-red-400">{health.failuresLast24h}</p>
    </div>
  </div>

  {#if $activeJobs.length > 0}
    <div>
      <h3 class="text-sm font-medium text-surface-300 mb-3">Active Jobs</h3>
      <div class="space-y-2">
        {#each $activeJobs as job (job.id)}
          <div class="p-3 rounded-lg bg-surface-800 border border-surface-700">
            <div class="flex items-center justify-between">
              <div>
                <span class="text-sm text-surface-200">{job.type}</span>
                <span class="ml-2 px-1.5 py-0.5 rounded text-xs {statusColors[job.status]}">
                  {job.status}
                </span>
                <span class="ml-2 text-xs text-surface-500">{job.progressPercent}%</span>
              </div>
              <div class="flex gap-2">
                <button class="text-xs text-surface-400 hover:text-surface-200" on:click={() => toggleLogs(job.id)}>
                  {expandedJobId === job.id ? 'Hide Logs' : 'Logs'}
                </button>
                {#if job.status === 'queued' || job.status === 'running'}
                  <button
                    class="text-xs text-surface-400 hover:text-red-400 transition-colors"
                    on:click={() => cancelJob(job.id)}
                  >
                    Cancel
                  </button>
                {/if}
              </div>
            </div>
            {#if job.progressPercent > 0}
              <div class="mt-2 w-full h-1.5 bg-surface-700 rounded-full">
                <div class="h-full bg-blue-500 rounded-full transition-all" style="width: {job.progressPercent}%"></div>
              </div>
            {/if}
            {#if expandedJobId === job.id}
              <div class="mt-3 max-h-40 overflow-auto bg-surface-900 rounded p-2 text-xs font-mono">
                {#each jobLogs as log (log.id)}
                  <div class="{logLevelColor[log.level] ?? ''}">
                    [{new Date(log.timestamp).toLocaleTimeString()}] [{log.code}] {log.message}
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}

  {#if snapshots.length > 0}
    <div>
      <h3 class="text-sm font-medium text-surface-300 mb-3">Monitor Metrics</h3>
      <div class="grid grid-cols-2 gap-3">
        {#each snapshots as snap}
          <div class="p-3 rounded-lg bg-surface-800 border border-surface-700">
            <p class="text-sm font-medium text-surface-200">{snap.jobType}</p>
            <div class="mt-2 grid grid-cols-2 gap-2 text-xs text-surface-400">
              <span>Last run: {snap.lastRunTime}ms</span>
              <span>Throughput: {snap.averageThroughput.toFixed(1)}/s</span>
              <span class="text-green-400">Success: {snap.successCount}</span>
              <span class="text-red-400">Failures: {snap.failureCount}</span>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  {#if $completedJobs.length > 0}
    <div>
      <h3 class="text-sm font-medium text-surface-300 mb-3">Job History</h3>
      <div class="space-y-2">
        {#each $completedJobs.slice(0, 20) as job (job.id)}
          <div class="p-3 rounded-lg bg-surface-800 border border-surface-700">
            <div class="flex items-center justify-between">
              <div>
                <span class="text-sm text-surface-300">{job.type}</span>
                <span class="ml-2 px-1.5 py-0.5 rounded text-xs {statusColors[job.status]}">
                  {job.status}
                </span>
                {#if job.completedAt}
                  <span class="ml-2 text-xs text-surface-500">
                    {new Date(job.completedAt).toLocaleString()}
                  </span>
                {/if}
                {#if job.lastErrorMessage}
                  <span class="ml-2 text-xs text-red-400">{job.lastErrorMessage}</span>
                {/if}
              </div>
              <div class="flex gap-2">
                <button class="text-xs text-surface-400 hover:text-surface-200" on:click={() => toggleLogs(job.id)}>
                  {expandedJobId === job.id ? 'Hide Logs' : 'Logs'}
                </button>
                <button class="text-xs text-surface-400 hover:text-surface-200" on:click={() => downloadLogs(job.id)}>
                  Export
                </button>
                {#if job.status === 'failed' || job.status === 'interrupted'}
                  <button class="text-xs text-blue-400 hover:text-blue-300" on:click={() => retryJob(job.id)}>
                    Retry
                  </button>
                {/if}
              </div>
            </div>
            {#if expandedJobId === job.id}
              <div class="mt-3 max-h-40 overflow-auto bg-surface-900 rounded p-2 text-xs font-mono">
                {#each jobLogs as log (log.id)}
                  <div class="{logLevelColor[log.level] ?? ''}">
                    [{new Date(log.timestamp).toLocaleTimeString()}] [{log.code}] {log.message}
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {:else if $activeJobs.length === 0}
    <div class="text-center py-8 text-surface-500">
      <p>No jobs yet. Jobs will appear here when you import cards or perform background operations.</p>
    </div>
  {/if}
</div>
