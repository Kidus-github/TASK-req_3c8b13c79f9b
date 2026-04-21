import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

type WorkerSelf = {
  onmessage: ((event: { data: unknown }) => void) | null;
  postMessage: ReturnType<typeof vi.fn>;
};

describe('import.worker', () => {
  let workerSelf: WorkerSelf;

  beforeEach(() => {
    vi.resetModules();
    workerSelf = {
      onmessage: null,
      postMessage: vi.fn(),
    };
    (globalThis as Record<string, unknown>).self = workerSelf;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as Record<string, unknown>).self;
  });

  it('parses CSV input into parse-complete rows', async () => {
    await import('../../../src/lib/workers/import.worker');

    workerSelf.onmessage?.({
      data: {
        id: 'm1',
        jobId: 'job-csv',
        command: 'parse-csv',
        payload: { text: 'title,body,date,mood\nAlpha,Body,2024-01-01,3' },
      },
    });

    expect(workerSelf.postMessage).toHaveBeenCalledWith({
      id: 'm1',
      jobId: 'job-csv',
      type: 'parse-complete',
      data: {
        rows: [{ rowNumber: 1, data: { title: 'Alpha', body: 'Body', date: '2024-01-01', mood: '3' } }],
        totalRows: 1,
      },
    });
  });

  it('returns an error when validation input exceeds maxRows', async () => {
    await import('../../../src/lib/workers/import.worker');

    workerSelf.onmessage?.({
      data: {
        id: 'm2',
        jobId: 'job-limit',
        command: 'validate-rows',
        payload: {
          maxRows: 1,
          rows: [
            { rowNumber: 1, data: { title: 'A', body: 'B', date: '2024-01-01', mood: '3' } },
            { rowNumber: 2, data: { title: 'C', body: 'D', date: '2024-01-02', mood: '4' } },
          ],
        },
      },
    });

    expect(workerSelf.postMessage).toHaveBeenCalledWith({
      id: 'm2',
      jobId: 'job-limit',
      type: 'error',
      data: { message: 'Batch exceeds maximum of 1 rows (got 2)', code: 'LIMIT_EXCEEDED' },
    });
  });

  it('responds with cancelled when a cancel command arrives', async () => {
    await import('../../../src/lib/workers/import.worker');

    workerSelf.onmessage?.({
      data: {
        id: 'm3',
        jobId: 'job-cancel',
        command: 'cancel',
        payload: {},
      },
    });

    expect(workerSelf.postMessage).toHaveBeenCalledWith({
      id: 'm3',
      jobId: 'job-cancel',
      type: 'cancelled',
      data: undefined,
    });
  });
});
