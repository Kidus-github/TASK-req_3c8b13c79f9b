import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import ProgressDrawer from '../../../src/components/layout/ProgressDrawer.svelte';
import {
  updateJobInStore,
  openProgressDrawer,
  closeProgressDrawer,
  __resetJobsStoreForTests,
} from '$lib/stores/jobs.store';
import { createTestDb, destroyTestDb } from '../../helpers/db-factory';
import { type NebulaDB, setDbFactory } from '$lib/db/connection';
import type { WorkerJob } from '$lib/types/worker';

function makeJob(partial: Partial<WorkerJob> = {}): WorkerJob {
  return {
    id: partial.id ?? `job-${Math.random().toString(36).slice(2, 8)}`,
    type: 'import_parse_validate',
    status: 'running',
    priority: 0,
    progressPercent: 0,
    startedAt: Date.now(),
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
}

let testDb: NebulaDB;

beforeEach(() => {
  testDb = createTestDb();
  setDbFactory(() => testDb);
  __resetJobsStoreForTests();
});

afterEach(async () => {
  __resetJobsStoreForTests();
  setDbFactory(null);
  await destroyTestDb(testDb);
  vi.restoreAllMocks();
});

describe('ProgressDrawer', () => {
  it('opens automatically when a new active job appears and shows it', async () => {
    const { queryByTestId, getByText } = render(ProgressDrawer);

    // Closed initially, only trigger visible.
    expect(queryByTestId('progress-drawer')).toBeNull();

    updateJobInStore(makeJob({ id: 'job-a', status: 'running', progressPercent: 10 }));
    await waitFor(() => expect(queryByTestId('progress-drawer')).not.toBeNull());

    expect(getByText('import_parse_validate')).toBeTruthy();
  });

  it('updates progress live as the job progresses', async () => {
    const { queryByTestId, getAllByTestId } = render(ProgressDrawer);

    updateJobInStore(makeJob({ id: 'job-b', status: 'running', progressPercent: 10 }));
    await waitFor(() => expect(queryByTestId('progress-drawer')).not.toBeNull());

    let progressEls = getAllByTestId('drawer-job-progress');
    expect(progressEls[0].textContent).toContain('10%');

    updateJobInStore(makeJob({ id: 'job-b', status: 'running', progressPercent: 67 }));
    await waitFor(() => {
      progressEls = getAllByTestId('drawer-job-progress');
      expect(progressEls[0].textContent).toContain('67%');
    });
  });

  it('cancel button triggers cancelJob on the queue service', async () => {
    const queueModule = await import('$lib/services/worker-queue.service');
    const spy = vi.spyOn(queueModule, 'requestCancelJob').mockResolvedValue({ ok: true, data: undefined });

    const { queryByTestId, getByTestId } = render(ProgressDrawer);
    updateJobInStore(makeJob({ id: 'job-c', status: 'running', progressPercent: 5 }));
    await waitFor(() => expect(queryByTestId('progress-drawer')).not.toBeNull());

    const cancelBtn = getByTestId('drawer-cancel');
    await fireEvent.click(cancelBtn);

    expect(spy).toHaveBeenCalledWith('job-c');
  });

  it('renders multiple queued jobs stacked', async () => {
    const { queryByTestId, getAllByTestId } = render(ProgressDrawer);

    updateJobInStore(makeJob({ id: 'job-1', status: 'running', progressPercent: 20 }));
    updateJobInStore(makeJob({ id: 'job-2', status: 'queued', progressPercent: 0 }));
    updateJobInStore(makeJob({ id: 'job-3', status: 'running', progressPercent: 50, type: 'index_rebuild' }));

    await waitFor(() => expect(queryByTestId('progress-drawer')).not.toBeNull());
    const rendered = getAllByTestId('drawer-job');
    expect(rendered.length).toBeGreaterThanOrEqual(3);
  });

  it('shows completed jobs under Recent with their terminal status', async () => {
    const { queryByTestId, getAllByTestId } = render(ProgressDrawer);
    openProgressDrawer();

    updateJobInStore(makeJob({ id: 'job-done', status: 'completed', progressPercent: 100 }));
    updateJobInStore(makeJob({ id: 'job-failed', status: 'failed', lastErrorMessage: 'boom' }));

    await waitFor(() => expect(queryByTestId('drawer-recent-list')).not.toBeNull());
    const recent = getAllByTestId('drawer-job');
    const statuses = recent.map(el => el.getAttribute('data-job-status'));
    expect(statuses).toContain('completed');
    expect(statuses).toContain('failed');
  });

  it('can be closed and reopened from the trigger button', async () => {
    const { queryByTestId, getByTestId } = render(ProgressDrawer);
    updateJobInStore(makeJob({ id: 'job-t', status: 'running', progressPercent: 10 }));
    await waitFor(() => expect(queryByTestId('progress-drawer')).not.toBeNull());

    closeProgressDrawer();
    await waitFor(() => expect(queryByTestId('progress-drawer')).toBeNull());

    await fireEvent.click(getByTestId('progress-drawer-trigger'));
    await waitFor(() => expect(queryByTestId('progress-drawer')).not.toBeNull());
  });
});
