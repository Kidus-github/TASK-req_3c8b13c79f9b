<script lang="ts">
  import { onMount } from 'svelte';
  import {
    jobs,
    activeJobs,
    completedJobs,
    loadJobs,
    cancelJob,
    progressDrawerOpen,
    closeProgressDrawer,
    toggleProgressDrawer,
  } from '$lib/stores/jobs.store';
  import { getJobLogs } from '$lib/services/worker-queue.service';
  import type { WorkerJob, WorkerJobLog } from '$lib/types/worker';

  // Render the drawer even when closed so the floating trigger can reopen it
  // from any route. It mounts once in the app shell.

  let expandedJobId: string | null = null;
  let expandedLogs: WorkerJobLog[] = [];
  let logsTimer: ReturnType<typeof setInterval> | null = null;

  onMount(() => {
    // Pull persisted job state so history is available immediately.
    void loadJobs();
    return () => {
      if (logsTimer) clearInterval(logsTimer);
    };
  });

  async function toggleLogs(jobId: string) {
    if (expandedJobId === jobId) {
      expandedJobId = null;
      expandedLogs = [];
      if (logsTimer) { clearInterval(logsTimer); logsTimer = null; }
      return;
    }
    expandedJobId = jobId;
    expandedLogs = await getJobLogs(jobId);
    if (logsTimer) clearInterval(logsTimer);
    logsTimer = setInterval(async () => {
      if (expandedJobId) expandedLogs = await getJobLogs(expandedJobId);
    }, 1000);
  }

  async function handleCancel(job: WorkerJob) {
    await cancelJob(job.id);
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

  $: hasActive = $activeJobs.length > 0;
  $: recentCompleted = $completedJobs.slice(0, 5);
</script>

<button
  type="button"
  class="fixed bottom-4 left-4 z-40 rounded-full bg-surface-800 border border-surface-600
         shadow-lg px-4 py-2 text-sm text-surface-200 hover:bg-surface-700 transition-colors
         flex items-center gap-2"
  data-testid="progress-drawer-trigger"
  on:click={toggleProgressDrawer}
>
  <span class="inline-block w-2 h-2 rounded-full {hasActive ? 'bg-blue-400 animate-pulse' : 'bg-surface-500'}"></span>
  Jobs
  {#if hasActive}
    <span class="text-xs text-blue-300">({$activeJobs.length})</span>
  {/if}
</button>

{#if $progressDrawerOpen}
  <div
    class="fixed inset-0 z-40 pointer-events-none"
    data-testid="progress-drawer-root"
  >
    <button
      type="button"
      class="absolute inset-0 bg-black/30 pointer-events-auto"
      aria-label="Close progress drawer"
      on:click={closeProgressDrawer}
    ></button>

    <aside
      class="absolute right-0 top-0 bottom-0 w-full sm:w-96 bg-surface-900 border-l
             border-surface-700 shadow-2xl overflow-y-auto pointer-events-auto"
      role="dialog"
      aria-label="Background jobs"
      data-testid="progress-drawer"
    >
      <header class="sticky top-0 flex items-center justify-between px-4 py-3 bg-surface-900 border-b border-surface-700">
        <div>
          <h2 class="text-sm font-semibold text-surface-100">Background Jobs</h2>
          <p class="text-xs text-surface-500">
            {$activeJobs.length} active • {$completedJobs.length} completed
          </p>
        </div>
        <button
          class="text-surface-400 hover:text-surface-100 text-xl leading-none"
          aria-label="Close"
          on:click={closeProgressDrawer}
        >x</button>
      </header>

      <section class="p-3 space-y-3">
        {#if $activeJobs.length === 0 && $jobs.length === 0}
          <p class="text-sm text-surface-500 text-center py-8" data-testid="drawer-empty">
            No jobs yet. Imports, indexing, and parser tasks will appear here live.
          </p>
        {/if}

        {#if $activeJobs.length > 0}
          <div data-testid="drawer-active-list">
            <h3 class="text-xs uppercase tracking-wide text-surface-500 mb-2">Active</h3>
            <div class="space-y-2">
              {#each $activeJobs as job (job.id)}
                <div
                  class="p-3 rounded-lg bg-surface-800 border border-surface-700"
                  data-testid="drawer-job"
                  data-job-id={job.id}
                  data-job-status={job.status}
                >
                  <div class="flex items-center justify-between gap-2">
                    <div class="min-w-0">
                      <p class="text-sm text-surface-100 truncate">{job.type}</p>
                      <div class="mt-0.5 flex items-center gap-2 text-xs">
                        <span class="px-1.5 py-0.5 rounded {statusColors[job.status]}">{job.status}</span>
                        <span class="text-surface-400" data-testid="drawer-job-progress">{job.progressPercent}%</span>
                      </div>
                    </div>
                    <div class="flex flex-col items-end gap-1 text-xs">
                      <button
                        class="text-surface-400 hover:text-surface-100"
                        on:click={() => toggleLogs(job.id)}
                      >
                        {expandedJobId === job.id ? 'Hide' : 'Logs'}
                      </button>
                      {#if job.status === 'queued' || job.status === 'running'}
                        <button
                          class="text-red-400 hover:text-red-300"
                          data-testid="drawer-cancel"
                          on:click={() => handleCancel(job)}
                        >Cancel</button>
                      {/if}
                    </div>
                  </div>
                  <div class="mt-2 w-full h-1.5 bg-surface-700 rounded-full overflow-hidden">
                    <div
                      class="h-full bg-blue-500 transition-all duration-200 rounded-full"
                      style="width: {job.progressPercent}%"
                    ></div>
                  </div>
                  {#if expandedJobId === job.id}
                    <div class="mt-3 max-h-40 overflow-auto bg-surface-900 rounded p-2 text-xs font-mono">
                      {#each expandedLogs as log (log.id)}
                        <div class="{logLevelColor[log.level] ?? ''}">
                          [{new Date(log.timestamp).toLocaleTimeString()}] [{log.code}] {log.message}
                        </div>
                      {:else}
                        <div class="text-surface-500">No logs yet.</div>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {/if}

        {#if recentCompleted.length > 0}
          <div data-testid="drawer-recent-list">
            <h3 class="text-xs uppercase tracking-wide text-surface-500 mb-2">Recent</h3>
            <div class="space-y-2">
              {#each recentCompleted as job (job.id)}
                <div
                  class="p-2.5 rounded-lg bg-surface-800/70 border border-surface-700"
                  data-testid="drawer-job"
                  data-job-id={job.id}
                  data-job-status={job.status}
                >
                  <div class="flex items-center justify-between gap-2">
                    <div class="min-w-0">
                      <p class="text-xs text-surface-200 truncate">{job.type}</p>
                      <div class="mt-0.5 flex items-center gap-2 text-xs">
                        <span class="px-1.5 py-0.5 rounded {statusColors[job.status]}">{job.status}</span>
                        {#if job.lastErrorMessage}
                          <span class="text-red-400 truncate">{job.lastErrorMessage}</span>
                        {/if}
                      </div>
                    </div>
                    <button
                      class="text-xs text-surface-400 hover:text-surface-100"
                      on:click={() => toggleLogs(job.id)}
                    >
                      {expandedJobId === job.id ? 'Hide' : 'Logs'}
                    </button>
                  </div>
                  {#if expandedJobId === job.id}
                    <div class="mt-2 max-h-32 overflow-auto bg-surface-900 rounded p-2 text-xs font-mono">
                      {#each expandedLogs as log (log.id)}
                        <div class="{logLevelColor[log.level] ?? ''}">
                          [{new Date(log.timestamp).toLocaleTimeString()}] [{log.code}] {log.message}
                        </div>
                      {:else}
                        <div class="text-surface-500">No logs.</div>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </section>
    </aside>
  </div>
{/if}
