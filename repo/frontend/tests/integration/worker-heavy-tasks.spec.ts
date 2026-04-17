import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, destroyTestDb } from '../helpers/db-factory';
import { type NebulaDB, setDbFactory } from '$lib/db/connection';
import * as cardService from '$lib/services/card.service';
import * as searchService from '$lib/services/search.service';
import * as importService from '$lib/services/import.service';
import * as voyageService from '$lib/services/voyage.service';
import { setWorkerFactory, __resetForTests, runJob, cancelRunningJob } from '$lib/services/queue-runner.service';
import { fakeWorkerFactory } from '../helpers/fake-worker';
import { listJobs } from '$lib/services/worker-queue.service';
import type { RawRow, RowValidationResult } from '$lib/workers/protocol';

let testDb: NebulaDB;
const PROFILE_ID = 'worker-heavy-profile';

beforeEach(() => {
  testDb = createTestDb();
  setDbFactory(() => testDb);
  setWorkerFactory(() => fakeWorkerFactory() as unknown as Worker);
});

afterEach(async () => {
  __resetForTests();
  setDbFactory(null);
  await destroyTestDb(testDb);
});

describe('worker-backed heavy tasks', () => {
  it('rebuilds the search index via the worker and persists results', async () => {
    await cardService.createCard(PROFILE_ID, { title: 'Alpha', body: 'Alpha body content', date: '2024-01-01', mood: 3, tags: ['a'] });
    await cardService.createCard(PROFILE_ID, { title: 'Beta', body: 'Beta body content', date: '2024-01-02', mood: 4, tags: ['b'] });

    await testDb.searchIndex.clear();
    const cards = await testDb.cards.where('profileId').equals(PROFILE_ID).toArray();
    const out = await searchService.rebuildSearchIndexViaWorker(cards, PROFILE_ID);

    expect(out.indexed).toBe(2);
    expect(out.jobId).toBeTruthy();
    const records = await testDb.searchIndex.toArray();
    expect(records).toHaveLength(2);
    expect(records.every(r => r.profileId === PROFILE_ID)).toBe(true);
  });

  it('commits an import through the worker and reports imported count', async () => {
    const batch = await importService.createImportBatch(PROFILE_ID, 't.json', 'json');
    const rawRows: RawRow[] = [
      { rowNumber: 1, data: { title: 'T1', body: 'Body one', date: '2024-02-01', mood: '3', tags: '' } },
      { rowNumber: 2, data: { title: 'T2', body: 'Body two', date: '2024-02-02', mood: '4', tags: '' } },
    ];
    const validationResults: RowValidationResult[] = rawRows.map(r => ({
      rowNumber: r.rowNumber,
      valid: true,
      normalized: { title: r.data.title, body: r.data.body, date: r.data.date, mood: parseInt(r.data.mood, 10), tags: [] },
      errors: [], warnings: [],
    }));
    await importService.storeValidationResults(batch.id, validationResults, rawRows);

    const res = await importService.commitValidRows(batch.id, PROFILE_ID, 'create_new');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.imported).toBe(2);
    expect(res.data.jobId).toBeTruthy();

    const batchAfter = await importService.getImportBatch(batch.id);
    expect(batchAfter?.jobId).toBe(res.data.jobId);

    // A worker job record should exist for the commit.
    const jobs = await listJobs();
    expect(jobs.some(j => j.type === 'import_commit' && j.status === 'completed')).toBe(true);
  });

  it('effect_precompute returns particles only when stardust is unlocked', async () => {
    const locked = await voyageService.precomputeStardust({ kind: 'stardust', stardustUnlocked: false });
    expect(locked.enabled).toBe(false);
    expect(locked.particles).toHaveLength(0);

    const unlocked = await voyageService.precomputeStardust({ kind: 'stardust', stardustUnlocked: true, particleCount: 64 });
    expect(unlocked.enabled).toBe(true);
    expect(unlocked.particles.length).toBeGreaterThan(0);
    for (const p of unlocked.particles) {
      expect(typeof p.x).toBe('number');
      expect(typeof p.hue).toBe('number');
    }
  });

  it('cancellation flow marks the job cancelled', { timeout: 15_000 }, async () => {
    // Build a never-resolving worker to exercise cancellation.
    // We need to wait until the queue-runner has actually called postMessage
    // with the 'start' message — that's when the worker is fully wired AND
    // the queue-runner is awaiting the worker's response. Cancelling earlier
    // races against runJob's own setup and can leave the waiter orphaned.
    const listeners = new Set<(ev: MessageEvent) => void>();
    let started = false;
    class HangingWorker {
      onmessage: ((ev: MessageEvent) => void) | null = null;
      onmessageerror: ((ev: MessageEvent) => void) | null = null;
      onerror: ((ev: ErrorEvent) => void) | null = null;
      addEventListener(type: string, fn: (ev: MessageEvent) => void): void {
        if (type === 'message') listeners.add(fn);
      }
      removeEventListener(type: string, fn: (ev: MessageEvent) => void): void {
        if (type === 'message') listeners.delete(fn);
      }
      dispatchEvent(_ev: Event): boolean { return true; }
      postMessage(msg: unknown): void {
        const m = msg as { kind: string; jobId: string };
        if (m.kind === 'start') {
          started = true;
          return;
        }
        if (m.kind === 'cancel') {
          const ev = { data: { kind: 'cancelled', jobId: m.jobId } } as MessageEvent;
          for (const fn of listeners) fn(ev);
          this.onmessage?.(ev);
        }
      }
      terminate(): void { listeners.clear(); }
    }
    setWorkerFactory(() => new HangingWorker() as unknown as Worker);

    let jobId: string | null = null;
    const run = runJob('index_rebuild', {}, { onStart: (id) => { jobId = id; } });
    // Wait for both: job id known AND start message sent to worker.
    let waited = 0;
    while ((!jobId || !started) && waited < 5_000) {
      await new Promise(r => setTimeout(r, 5));
      waited += 5;
    }
    expect(started).toBe(true);
    await cancelRunningJob(jobId!);

    await expect(run).rejects.toThrow(/CANCELLED/);
    const after = await listJobs();
    expect(after.find(j => j.id === jobId)?.status).toBe('cancelled');
  });
});
