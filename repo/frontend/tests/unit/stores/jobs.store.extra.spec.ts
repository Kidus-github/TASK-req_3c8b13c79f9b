/**
 * Coverage for jobs.store helper actions: cancelJob, retryJob, drawer
 * open/close/toggle, updateJobInStore auto-open behavior.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import { type NebulaDB, setDbFactory } from '$lib/db/connection';
import { createTestDb, destroyTestDb } from '../../helpers/db-factory';
import {
  loadJobs,
  cancelJob,
  retryJob,
  jobs,
  loading,
  activeJobs,
  completedJobs,
  progressDrawerOpen,
  openProgressDrawer,
  closeProgressDrawer,
  toggleProgressDrawer,
  updateJobInStore,
  __resetJobsStoreForTests,
} from '$lib/stores/jobs.store';
import type { WorkerJob } from '$lib/types/worker';

let testDb: NebulaDB;

function makeJob(overrides: Partial<WorkerJob> = {}): WorkerJob {
  return {
    id: 'job-' + Math.random().toString(36).slice(2),
    type: 'index_rebuild',
    status: 'queued',
    priority: 0,
    progressPercent: 0,
    startedAt: null,
    completedAt: null,
    cancelRequestedAt: null,
    cancelledAt: null,
    failureCount: 0,
    lastErrorCode: null,
    lastErrorMessage: null,
    throughputMetric: null,
    payloadRef: null,
    resultRef: null,
    ...overrides,
  };
}

beforeEach(() => {
  testDb = createTestDb();
  setDbFactory(() => testDb);
  __resetJobsStoreForTests();
});

afterEach(async () => {
  __resetJobsStoreForTests();
  setDbFactory(null);
  await destroyTestDb(testDb);
});

describe('jobs store actions', () => {
  it('loadJobs populates the store and toggles loading off', async () => {
    await testDb.workerJobs.bulkAdd([makeJob({ id: 'a' }), makeJob({ id: 'b' })]);
    await loadJobs();
    expect(get(jobs)).toHaveLength(2);
    expect(get(loading)).toBe(false);
  });

  it('cancelJob marks a queued job cancelled and reloads', async () => {
    await testDb.workerJobs.add(makeJob({ id: 'q1', status: 'queued' }));
    await loadJobs();
    const ok = await cancelJob('q1');
    expect(ok).toBe(true);
    const updated = await testDb.workerJobs.get('q1');
    expect(updated?.status).toBe('cancelled');
  });

  it('cancelJob returns false for an unknown job id', async () => {
    expect(await cancelJob('nope')).toBe(false);
  });

  it('retryJob returns false for a non-failed job', async () => {
    await testDb.workerJobs.add(makeJob({ id: 'r1', status: 'completed' }));
    expect(await retryJob('r1')).toBe(false);
  });

  it('retryJob returns true for a failed job and re-queues it', async () => {
    await testDb.workerJobs.add(makeJob({
      id: 'fail-1', status: 'failed',
      completedAt: Date.now(), lastErrorMessage: 'boom',
    }));
    const ok = await retryJob('fail-1');
    expect(ok).toBe(true);
    const updated = await testDb.workerJobs.get('fail-1');
    expect(updated?.status).toBe('queued');
  });

  it('progress drawer open/close/toggle', () => {
    expect(get(progressDrawerOpen)).toBe(false);
    openProgressDrawer();
    expect(get(progressDrawerOpen)).toBe(true);
    closeProgressDrawer();
    expect(get(progressDrawerOpen)).toBe(false);
    toggleProgressDrawer();
    expect(get(progressDrawerOpen)).toBe(true);
    toggleProgressDrawer();
    expect(get(progressDrawerOpen)).toBe(false);
  });

  it('updateJobInStore inserts and updates entries', () => {
    updateJobInStore(makeJob({ id: 'j-1', status: 'running' }));
    expect(get(jobs).some((j) => j.id === 'j-1')).toBe(true);
    updateJobInStore(makeJob({ id: 'j-1', status: 'completed' }));
    expect(get(jobs).find((j) => j.id === 'j-1')?.status).toBe('completed');
  });

  it('updateJobInStore auto-opens the drawer the first time an active job appears', () => {
    expect(get(progressDrawerOpen)).toBe(false);
    updateJobInStore(makeJob({ id: 'j-active', status: 'running' }));
    expect(get(progressDrawerOpen)).toBe(true);
  });

  it('activeJobs / completedJobs derived stores partition by status', () => {
    updateJobInStore(makeJob({ id: 'a', status: 'running' }));
    updateJobInStore(makeJob({ id: 'b', status: 'completed' }));
    updateJobInStore(makeJob({ id: 'c', status: 'failed' }));
    expect(get(activeJobs).map((j) => j.id)).toEqual(['a']);
    expect(get(completedJobs).map((j) => j.id).sort()).toEqual(['b', 'c']);
  });
});
