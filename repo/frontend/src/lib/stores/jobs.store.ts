import { writable, derived, get } from 'svelte/store';
import type { WorkerJob } from '$lib/types/worker';
import * as queueService from '$lib/services/worker-queue.service';
import { swallowDbClosed } from '$lib/utils/db-errors';

const allJobs = writable<WorkerJob[]>([]);
const isLoading = writable(false);
const drawerOpen = writable(false);
let autoOpenedForActive = false;

export async function loadJobs() {
  isLoading.set(true);
  try {
    const jobs = await queueService.listJobs();
    allJobs.set(jobs);
  } catch (err) {
    // A closed DB is a legitimate shutdown/teardown scenario (tab close, HMR,
    // or test afterEach). There is nothing to load — leave the store as-is
    // rather than letting the rejection surface as unhandled.
    swallowDbClosed(err);
  } finally {
    isLoading.set(false);
  }
}

export async function cancelJob(jobId: string): Promise<boolean> {
  const result = await queueService.requestCancelJob(jobId);
  if (result.ok) {
    await loadJobs();
    return true;
  }
  return false;
}

export async function retryJob(jobId: string): Promise<boolean> {
  const result = await queueService.retryJob(jobId);
  if (result.ok) {
    await loadJobs();
    return true;
  }
  return false;
}

export function updateJobInStore(job: WorkerJob) {
  allJobs.update(jobs => {
    const idx = jobs.findIndex(j => j.id === job.id);
    if (idx >= 0) {
      jobs[idx] = job;
      return [...jobs];
    }
    return [...jobs, job];
  });

  // Auto-open the global progress drawer on the first active job so the user
  // sees heavy work from any route. Only auto-opens once per quiet period —
  // if the user explicitly closes while something is still running, we respect
  // that until the queue drains and a new job kicks off.
  const stillActive = get(allJobs).some(
    j => j.status === 'queued' || j.status === 'running' || j.status === 'cancelling'
  );
  if (stillActive && !autoOpenedForActive) {
    autoOpenedForActive = true;
    drawerOpen.set(true);
  } else if (!stillActive) {
    autoOpenedForActive = false;
  }
}

export function openProgressDrawer() {
  drawerOpen.set(true);
}

export function closeProgressDrawer() {
  drawerOpen.set(false);
}

export function toggleProgressDrawer() {
  drawerOpen.update(v => !v);
}

export const progressDrawerOpen = { subscribe: drawerOpen.subscribe };

/** Reset for tests. */
export function __resetJobsStoreForTests() {
  allJobs.set([]);
  drawerOpen.set(false);
  autoOpenedForActive = false;
}

export const jobs = { subscribe: allJobs.subscribe };
export const loading = { subscribe: isLoading.subscribe };

export const activeJobs = derived(allJobs, $jobs =>
  $jobs.filter(j => j.status === 'queued' || j.status === 'running' || j.status === 'cancelling')
);

export const completedJobs = derived(allJobs, $jobs =>
  $jobs.filter(j => j.status === 'completed' || j.status === 'failed' || j.status === 'cancelled' || j.status === 'interrupted')
);
