import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDb, destroyTestDb } from '../../helpers/db-factory';
import { type NebulaDB, setDbFactory } from '$lib/db/connection';
import * as queueService from '$lib/services/worker-queue.service';
import {
  evaluateWorkerHealth,
  __setAlertSink,
  __resetForTests,
  type HealthAlert,
} from '$lib/services/worker-health.service';
import { generateId } from '$lib/utils/id';
import type { WorkerJob, MonitorMetricSnapshot, JobType } from '$lib/types/worker';

let testDb: NebulaDB;
let captured: HealthAlert[] = [];

beforeEach(() => {
  testDb = createTestDb();
  setDbFactory(() => testDb);
  captured = [];
  __setAlertSink((a) => captured.push(a));
});

afterEach(async () => {
  __resetForTests();
  setDbFactory(null);
  await destroyTestDb(testDb);
  vi.restoreAllMocks();
});

async function seedJob(partial: Partial<WorkerJob>): Promise<WorkerJob> {
  const job: WorkerJob = {
    id: partial.id ?? generateId(),
    type: 'import_parse_validate',
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
    ...partial,
  };
  await testDb.workerJobs.add(job);
  return job;
}

async function seedSnapshot(partial: Partial<MonitorMetricSnapshot> & { jobType: JobType }): Promise<void> {
  const snap: MonitorMetricSnapshot = {
    id: generateId(),
    windowStart: Date.now() - 3_600_000,
    windowEnd: Date.now(),
    lastRunTime: 100,
    averageThroughput: 0,
    successCount: 0,
    failureCount: 0,
    cancelCount: 0,
    ...partial,
  };
  await testDb.monitorSnapshots.add(snap);
}

describe('evaluateWorkerHealth thresholds', () => {
  it('emits a toast when the queue length exceeds the threshold', async () => {
    for (let i = 0; i < 12; i++) await seedJob({ status: 'queued' });

    const fired = await evaluateWorkerHealth();
    const alert = fired.find(a => a.code === 'QUEUE_LENGTH');
    expect(alert).toBeDefined();
    expect(captured.some(a => a.code === 'QUEUE_LENGTH')).toBe(true);
  });

  it('emits a toast when repeated failures on the same job type breach the threshold', async () => {
    const type: JobType = 'index_rebuild';
    const base = Date.now();
    for (let i = 0; i < 4; i++) {
      await seedJob({
        type,
        status: 'failed',
        completedAt: base + i * 1000,
        lastErrorMessage: 'boom',
      });
    }
    await seedSnapshot({ jobType: type, failureCount: 4, successCount: 0 });

    const fired = await evaluateWorkerHealth();
    expect(fired.find(a => a.code === 'REPEATED_FAILURES')).toBeDefined();
  });

  it('emits a toast when the failure rate for a job type exceeds the threshold', async () => {
    const type: JobType = 'import_commit';
    await seedSnapshot({ jobType: type, successCount: 2, failureCount: 3 });

    const fired = await evaluateWorkerHealth();
    expect(fired.find(a => a.code === 'FAILURE_RATE' && a.scope === type)).toBeDefined();
  });

  it('emits a toast when throughput degrades relative to the tracked baseline', async () => {
    const type: JobType = 'parser_full_extract';

    // Seed baseline at high throughput.
    await seedSnapshot({ jobType: type, averageThroughput: 20, successCount: 5, failureCount: 0 });
    await evaluateWorkerHealth();
    captured.length = 0;

    // Simulate a drop to well below half of the baseline.
    await testDb.monitorSnapshots.clear();
    await seedSnapshot({ jobType: type, averageThroughput: 4, successCount: 5, failureCount: 0 });

    const fired = await evaluateWorkerHealth();
    expect(fired.find(a => a.code === 'THROUGHPUT_DEGRADATION' && a.scope === type)).toBeDefined();
  });

  it('deduplicates repeated alerts within the cooldown window', async () => {
    for (let i = 0; i < 15; i++) await seedJob({ status: 'queued' });

    const first = await evaluateWorkerHealth();
    const second = await evaluateWorkerHealth();
    const third = await evaluateWorkerHealth();

    const totalQueueAlerts = [first, second, third].flat().filter(a => a.code === 'QUEUE_LENGTH').length;
    expect(totalQueueAlerts).toBe(1);
    expect(captured.filter(a => a.code === 'QUEUE_LENGTH').length).toBe(1);
  });

  it('does not emit when metrics are below thresholds', async () => {
    await seedJob({ status: 'queued' });
    await seedSnapshot({ jobType: 'import_parse_validate', successCount: 10, failureCount: 1, averageThroughput: 5 });

    const fired = await evaluateWorkerHealth();
    expect(fired.length).toBe(0);
    expect(captured.length).toBe(0);
  });
});
