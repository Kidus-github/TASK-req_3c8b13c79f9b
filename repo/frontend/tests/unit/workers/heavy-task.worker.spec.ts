import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

type MessageHandler = (event: { data: unknown }) => Promise<void> | void;

describe('heavy-task.worker', () => {
  let listeners: Record<string, MessageHandler>;
  let postMessage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    listeners = {};
    postMessage = vi.fn();
    (globalThis as Record<string, unknown>).self = {
      postMessage,
      addEventListener: vi.fn((type: string, cb: MessageHandler) => {
        listeners[type] = cb;
      }),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as Record<string, unknown>).self;
  });

  it('runs index_rebuild and emits a done message with only active records', async () => {
    await import('../../../src/lib/workers/heavy-task.worker');

    await listeners.message({
      data: {
        kind: 'start',
        jobId: 'job-index',
        type: 'index_rebuild',
        payload: {
          cards: [
            { id: 'a', title: 'Bright Star', body: 'Blue sky', tags: ['Sky'], mood: 3, date: '2024-01-01', deletedAt: null },
            { id: 'b', title: 'Hidden', body: 'Deleted', tags: ['Dust'], mood: 2, date: '2024-01-02', deletedAt: 1710000000000 },
          ],
        },
      },
    });

    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'done',
      jobId: 'job-index',
      result: expect.objectContaining({
        count: 1,
        records: [
          expect.objectContaining({
            cardId: 'a',
            tagTerms: ['sky'],
          }),
        ],
      }),
    }));
  });

  it('runs import_parse_validate for csv and returns valid + invalid row results', async () => {
    await import('../../../src/lib/workers/heavy-task.worker');

    await listeners.message({
      data: {
        kind: 'start',
        jobId: 'job-parse',
        type: 'import_parse_validate',
        payload: {
          format: 'csv',
          maxRows: 10,
          text: [
            'title,body,date,mood,tags',
            'Good Row,Some body,2024-01-01,3,sky,blue',
            'Bad Row,,2024-99-01,9,too,many,tags',
          ].join('\n'),
        },
      },
    });

    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'done',
      jobId: 'job-parse',
      result: expect.objectContaining({
        count: 2,
        rows: expect.any(Array),
        results: [
          expect.objectContaining({
            rowNumber: 1,
            valid: true,
            normalized: expect.objectContaining({
              title: 'Good Row',
              mood: 3,
            }),
          }),
          expect.objectContaining({
            rowNumber: 2,
            valid: false,
            errors: expect.arrayContaining([
              expect.objectContaining({ field: 'body' }),
              expect.objectContaining({ field: 'date' }),
              expect.objectContaining({ field: 'mood' }),
            ]),
          }),
        ],
      }),
    }));
  });

  it('runs parser_full_extract for jsonpath payloads and returns extracted rows', async () => {
    await import('../../../src/lib/workers/heavy-task.worker');

    await listeners.message({
      data: {
        kind: 'start',
        jobId: 'job-extract',
        type: 'parser_full_extract',
        payload: {
          sourceType: 'json',
          content: JSON.stringify({
            cards: [
              { title: 'Alpha', body: 'First', date: '2024-01-01', mood: 2 },
              { title: 'Beta', body: 'Second', date: '2024-01-02', mood: 4 },
            ],
          }),
          containerSelector: '$.cards',
          selectorType: 'jsonpath',
          fieldSelectors: {
            title: '$.title',
            body: '$.body',
            date: '$.date',
            mood: '$.mood',
          },
        },
      },
    });

    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'done',
      jobId: 'job-extract',
      result: {
        count: 2,
        errors: [],
        rows: [
          { title: 'Alpha', body: 'First', date: '2024-01-01', mood: '2' },
          { title: 'Beta', body: 'Second', date: '2024-01-02', mood: '4' },
        ],
      },
    }));
  });

  it('runs import_commit and plans create, skip, overwrite, and fail actions', async () => {
    await import('../../../src/lib/workers/heavy-task.worker');

    await listeners.message({
      data: {
        kind: 'start',
        jobId: 'job-commit',
        type: 'import_commit',
        payload: {
          dedupeMode: 'overwrite_by_id',
          rows: [
            {
              rowId: 'r1',
              rowNumber: 1,
              rawId: 'card-1',
              existingDuplicateCardId: 'card-1',
              normalized: { title: 'A', body: 'Body', date: '2024-01-01', mood: 3, tags: [] },
            },
            {
              rowId: 'r2',
              rowNumber: 2,
              rawId: 'missing-card',
              existingDuplicateCardId: null,
              normalized: { title: 'B', body: 'Body', date: '2024-01-02', mood: 4, tags: [] },
            },
            {
              rowId: 'r3',
              rowNumber: 3,
              rawId: null,
              existingDuplicateCardId: null,
              normalized: { title: 'C', body: 'Body', date: '2024-01-03', mood: 5, tags: [] },
            },
            {
              rowId: 'r4',
              rowNumber: 4,
              rawId: 'card-4',
              existingDuplicateCardId: 'card-4',
              normalized: null,
            },
          ],
        },
      },
    });

    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'done',
      jobId: 'job-commit',
      result: expect.objectContaining({
        count: 4,
        imported: 1,
        failed: 3,
        skipped: 0,
        decisions: [
          expect.objectContaining({ rowId: 'r1', action: 'overwrite', targetCardId: 'card-1' }),
          expect.objectContaining({ rowId: 'r2', action: 'fail', reason: 'No existing card matches id "missing-card"' }),
          expect.objectContaining({ rowId: 'r3', action: 'fail', reason: 'overwrite_by_id requires an id column on each row' }),
          expect.objectContaining({ rowId: 'r4', action: 'fail', reason: 'missing normalized payload' }),
        ],
      }),
    }));
  });

  it('returns an error for an unsupported job type', async () => {
    await import('../../../src/lib/workers/heavy-task.worker');

    await listeners.message({
      data: {
        kind: 'start',
        jobId: 'job-bad',
        type: 'does_not_exist',
        payload: {},
      },
    });

    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'error',
      jobId: 'job-bad',
      code: 'WORKER_ERROR',
      message: 'Unsupported job type: does_not_exist',
    }));
  });

  it('honors cancellation for effect precompute jobs', async () => {
    await import('../../../src/lib/workers/heavy-task.worker');

    await listeners.message({
      data: {
        kind: 'cancel',
        jobId: 'job-cancelled',
      },
    });

    await listeners.message({
      data: {
        kind: 'start',
        jobId: 'job-cancelled',
        type: 'effect_precompute',
        payload: { kind: 'stardust', stardustUnlocked: true, particleCount: 64, seed: 7 },
      },
    });

    expect(postMessage).toHaveBeenCalledWith({
      kind: 'cancelled',
      jobId: 'job-cancelled',
    });
  });
});
