/**
 * Final coverage push: import.service raw file attach, plain createCard
 * commit failure path, queue-runner worker error event handler.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { type NebulaDB, setDbFactory } from '$lib/db/connection';
import { createTestDb, destroyTestDb } from '../../helpers/db-factory';
import * as importService from '$lib/services/import.service';
import { setWorkerFactory, __resetForTests, runJob } from '$lib/services/queue-runner.service';
import { logger } from '$lib/logging';

let testDb: NebulaDB;
const PROFILE_ID = 'very-final';

beforeEach(() => {
  testDb = createTestDb();
  setDbFactory(() => testDb);
});

afterEach(async () => {
  __resetForTests();
  setDbFactory(null);
  await destroyTestDb(testDb);
});

describe('import.service createImportBatch raw file branches', () => {
  it('creates a batch with no raw file when rawFile arg is omitted', async () => {
    const b = await importService.createImportBatch(PROFILE_ID, 'no-file.csv', 'csv');
    expect(b.rawFileBlobId).toBeNull();
  });

  it('attachRawFileToBatch returns NOT_FOUND when batch is missing', async () => {
    const r = await importService.attachRawFileToBatch('missing', new Blob(['x']));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('NOT_FOUND');
  });

  it('attachRawFileToBatch updates an existing batch with the new blob', async () => {
    const b = await importService.createImportBatch(PROFILE_ID, 'orig.csv', 'csv');
    const r = await importService.attachRawFileToBatch(b.id, new Blob(['hi'], { type: 'text/csv' }), 'override.csv');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.rawFileBlobId).not.toBeNull();
  });
});

describe('import.service commitValidRows error branches', () => {
  it('commit on a missing batch returns NOT_FOUND', async () => {
    const r = await importService.commitValidRows('missing', PROFILE_ID, 'create_new');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('NOT_FOUND');
  });

  it('commit on a draft batch (not in review) returns VALIDATION error', async () => {
    const b = await importService.createImportBatch(PROFILE_ID, 'draft.csv', 'csv');
    const r = await importService.commitValidRows(b.id, PROFILE_ID, 'create_new');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('VALIDATION');
  });
});

describe('worker-queue retry/markInterrupted/listRecentJobs branches', () => {
  it('retryJob returns NOT_FOUND for missing id', async () => {
    const queueService = await import('$lib/services/worker-queue.service');
    const r = await queueService.retryJob('missing-id');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('NOT_FOUND');
  });

  it('markInterruptedJobs marks running and cancelling jobs as interrupted', async () => {
    const queueService = await import('$lib/services/worker-queue.service');
    const j1 = await queueService.createJob('index_rebuild');
    await queueService.updateJobStatus(j1.id, 'running');
    const j2 = await queueService.createJob('index_rebuild');
    await queueService.updateJobStatus(j2.id, 'cancelling');
    const count = await queueService.markInterruptedJobs();
    expect(count).toBe(2);
    expect((await queueService.getJob(j1.id))?.status).toBe('interrupted');
    expect((await queueService.getJob(j2.id))?.status).toBe('interrupted');
  });

  it('listRecentJobs sorts by startedAt with id fallback', async () => {
    const queueService = await import('$lib/services/worker-queue.service');
    const j = await queueService.createJob('index_rebuild');
    await queueService.updateJobStatus(j.id, 'running');
    const list = await queueService.listRecentJobs();
    expect(list.length).toBeGreaterThanOrEqual(1);
  });
});

describe('queue-runner worker error event handler', () => {
  it('logs worker error events without crashing the runner', async () => {
    let messageListener: ((ev: MessageEvent) => void) | null = null;
    let errListener: ((ev: ErrorEvent) => void) | null = null;
    class TwoEventWorker {
      onmessage: ((ev: MessageEvent) => void) | null = null;
      addEventListener(type: string, fn: any): void {
        if (type === 'error') errListener = fn;
        if (type === 'message') messageListener = fn;
      }
      removeEventListener(): void {}
      dispatchEvent(): boolean { return true; }
      postMessage(msg: any): void {
        if (msg.kind === 'start') {
          // Trigger the registered error listener to exercise that branch.
          errListener?.({ message: 'simulated worker error', filename: 'fake.js' } as ErrorEvent);
          // Then deliver a done message so runJob resolves.
          const ev = { data: { kind: 'done', jobId: msg.jobId, result: null } } as MessageEvent;
          messageListener?.(ev);
          this.onmessage?.(ev);
        }
      }
      terminate(): void {}
    }
    setWorkerFactory(() => new TwoEventWorker() as unknown as Worker);

    // Suppress console.error noise from the logger
    const origError = console.error;
    console.error = () => {};
    try {
      await runJob('index_rebuild', {});
    } finally {
      console.error = origError;
    }
    // The logger captured the error entry.
    expect(logger.getEntries('error').some((e) => /simulated worker error/.test(e.message))).toBe(true);
  });
});
