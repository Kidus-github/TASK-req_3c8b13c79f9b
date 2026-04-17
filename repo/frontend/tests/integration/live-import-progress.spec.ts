import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDb, destroyTestDb } from '../helpers/db-factory';
import { type NebulaDB, setDbFactory } from '$lib/db/connection';
import { setWorkerFactory, __resetForTests, runJob } from '$lib/services/queue-runner.service';
import { fakeWorkerFactory } from '../helpers/fake-worker';
import {
  jobs as jobsStore,
  __resetJobsStoreForTests,
} from '$lib/stores/jobs.store';
import { get } from 'svelte/store';
import type { WorkerJob } from '$lib/types/worker';

let testDb: NebulaDB;

beforeEach(() => {
  testDb = createTestDb();
  setDbFactory(() => testDb);
  __resetJobsStoreForTests();
});

afterEach(async () => {
  __resetForTests();
  __resetJobsStoreForTests();
  setDbFactory(null);
  await destroyTestDb(testDb);
  vi.restoreAllMocks();
});

describe('live import progress', () => {
  it('onStart fires with the job id before the worker completes', async () => {
    setWorkerFactory(() => fakeWorkerFactory({ progressSteps: [25, 50, 75] }) as unknown as Worker);

    let seenJobId: string | null = null;
    const payload = { format: 'json' as const, text: JSON.stringify([]), maxRows: 10 };
    const { job } = await runJob<{ rows: unknown[]; results: unknown[]; count: number }>(
      'import_parse_validate',
      payload,
      { onStart: (id) => { seenJobId = id; } }
    );

    expect(seenJobId).not.toBeNull();
    expect(job.id).toBe(seenJobId);
  });

  it('live job progress is observable in the jobs store while the worker runs', async () => {
    setWorkerFactory(() => fakeWorkerFactory({ progressSteps: [10, 40, 80] }) as unknown as Worker);

    const observed: number[] = [];
    const unsub = jobsStore.subscribe((jobs: WorkerJob[]) => {
      for (const j of jobs) {
        if (j.type === 'import_parse_validate') {
          const last = observed[observed.length - 1];
          if (last !== j.progressPercent) observed.push(j.progressPercent);
        }
      }
    });

    const payload = { format: 'json' as const, text: JSON.stringify([]), maxRows: 10 };
    await runJob('import_parse_validate', payload);
    unsub();

    // At minimum one intermediate step must appear — liveness, not just 0 → 100.
    const intermediate = observed.filter(p => p > 0 && p < 100);
    expect(intermediate.length).toBeGreaterThan(0);
    expect(observed[observed.length - 1]).toBe(100);
  });

  it('import page progress and drawer progress come from the same job record', async () => {
    setWorkerFactory(() => fakeWorkerFactory({ progressSteps: [20, 60] }) as unknown as Worker);

    // Track the sequence of percent values for a specific job id; both UIs
    // derive from this same subscription.
    const payload = { format: 'json' as const, text: JSON.stringify([]), maxRows: 10 };
    let capturedJobId: string | null = null;
    const pageView: number[] = [];
    const drawerView: number[] = [];

    const unsub = jobsStore.subscribe((jobs: WorkerJob[]) => {
      if (!capturedJobId) return;
      const j = jobs.find(x => x.id === capturedJobId);
      if (!j) return;
      pageView.push(j.progressPercent);
      drawerView.push(j.progressPercent);
    });

    await runJob('import_parse_validate', payload, {
      onStart: (id) => { capturedJobId = id; },
    });
    unsub();

    // Both views were fed identical percent sequences.
    expect(pageView).toEqual(drawerView);
    expect(pageView.at(-1)).toBe(100);
  });
});
