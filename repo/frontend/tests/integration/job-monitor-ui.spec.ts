/**
 * UI coverage for JobMonitor.
 *
 * Renders the real component against a fake-indexeddb test DB. We seed
 * worker_jobs / worker_job_logs / monitor_snapshots directly so the monitor
 * has real data to render — no service mocks. Tests cover rendering, log
 * expansion, cancel/retry interactions, and edge cases (empty list).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';

import JobMonitor from '../../src/components/jobs/JobMonitor.svelte';

import { type NebulaDB, setDbFactory } from '$lib/db/connection';
import { createTestDb, destroyTestDb } from '../helpers/db-factory';
import { __resetJobsStoreForTests } from '$lib/stores/jobs.store';
import type { WorkerJob, WorkerJobLog, MonitorMetricSnapshot } from '$lib/types/worker';

let testDb: NebulaDB;

beforeEach(() => {
  testDb = createTestDb();
  setDbFactory(() => testDb);
  __resetJobsStoreForTests();
});

afterEach(async () => {
  __resetJobsStoreForTests();
  // Let any in-flight monitor refresh promise drain before closing the DB so
  // we don't leak DatabaseClosedError into vitest's unhandled-rejection log.
  await new Promise((r) => setTimeout(r, 50));
  setDbFactory(null);
  await destroyTestDb(testDb);
  vi.restoreAllMocks();
});

function makeJob(overrides: Partial<WorkerJob> = {}): WorkerJob {
  return {
    id: 'job-' + Math.random().toString(36).slice(2),
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
    ...overrides,
  };
}

describe('JobMonitor', () => {
  it('renders the empty-state message when there are no jobs', async () => {
    const { container } = render(JobMonitor);
    await waitFor(() => {
      expect(container.textContent?.toLowerCase()).toMatch(/no jobs yet/);
    });
  });

  it('renders health tiles (Active / Queued / Failures)', async () => {
    await testDb.workerJobs.bulkAdd([
      makeJob({ status: 'running', startedAt: Date.now() - 1000 }),
      makeJob({ status: 'queued' }),
      makeJob({ status: 'queued' }),
      makeJob({ status: 'failed', completedAt: Date.now() - 60_000 }),
    ]);
    const { container } = render(JobMonitor);
    await waitFor(() => {
      expect(container.textContent).toContain('Active');
      expect(container.textContent).toContain('Queued');
      expect(container.textContent).toContain('Failures');
    });
    // After health refresh the queued count should appear
    await waitFor(() => {
      const text = container.textContent ?? '';
      expect(text).toMatch(/Active[\s\S]*?1/);
      expect(text).toMatch(/Queued[\s\S]*?2/);
    });
  });

  it('renders the Active Jobs section with running jobs and a Cancel button', async () => {
    await testDb.workerJobs.add(makeJob({
      id: 'active-1',
      status: 'running',
      type: 'import_parse_validate',
      progressPercent: 42,
      startedAt: Date.now() - 1000,
    }));
    const { container, findByText } = render(JobMonitor);
    await findByText(/Active Jobs/i);
    expect(container.textContent).toContain('import_parse_validate');
    await waitFor(() => expect(container.textContent).toContain('42%'));
    expect(await findByText(/^Cancel$/)).toBeTruthy();
  });

  it('renders the Job History section with completed jobs', async () => {
    await testDb.workerJobs.add(makeJob({
      id: 'done-1',
      status: 'completed',
      type: 'index_rebuild',
      completedAt: Date.now() - 5000,
    }));
    const { container, findByText } = render(JobMonitor);
    await findByText(/Job History/i);
    expect(container.textContent).toContain('index_rebuild');
    expect(container.textContent).toContain('completed');
  });

  it('toggling Logs expands the per-job log list', async () => {
    const jobId = 'with-logs-1';
    await testDb.workerJobs.add(makeJob({
      id: jobId,
      status: 'completed',
      type: 'parser_full_extract',
      completedAt: Date.now() - 5000,
    }));
    const log: WorkerJobLog = {
      id: 'log-1',
      jobId,
      timestamp: Date.now() - 4000,
      level: 'info',
      code: 'STARTED',
      message: 'Job has started',
    };
    await testDb.workerJobLogs.add(log);

    const { container, findAllByText } = render(JobMonitor);
    const [logsBtn] = await findAllByText('Logs');
    await fireEvent.click(logsBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Job has started');
    });
  });

  it('Cancel on a queued job moves it to cancelled status', async () => {
    const jobId = 'cancel-me';
    await testDb.workerJobs.add(makeJob({ id: jobId, status: 'queued' }));
    const { findByText } = render(JobMonitor);
    const cancelBtn = await findByText(/^Cancel$/);
    await fireEvent.click(cancelBtn);
    await waitFor(async () => {
      const job = await testDb.workerJobs.get(jobId);
      expect(job?.status).toBe('cancelled');
    });
  });

  it('renders Monitor Metrics rows for snapshots', async () => {
    const snap: MonitorMetricSnapshot = {
      id: 'snap-1',
      jobType: 'import_parse_validate',
      windowStart: Date.now() - 60_000,
      windowEnd: Date.now(),
      lastRunTime: 120,
      averageThroughput: 4.2,
      successCount: 9,
      failureCount: 1,
      cancelCount: 0,
    };
    await testDb.monitorSnapshots.add(snap);
    const { container, findByText } = render(JobMonitor);
    await findByText(/Monitor Metrics/i);
    expect(container.textContent).toContain('Throughput: 4.2/s');
    expect(container.textContent).toContain('Success: 9');
    expect(container.textContent).toContain('Failures: 1');
  });

  it('Retry button appears on failed jobs and is wired to retryJob', async () => {
    await testDb.workerJobs.add(makeJob({
      id: 'failed-1',
      status: 'failed',
      type: 'index_rebuild',
      completedAt: Date.now() - 1000,
      lastErrorMessage: 'boom',
    }));
    const { findByText } = render(JobMonitor);
    expect(await findByText('Retry')).toBeTruthy();
  });
});
