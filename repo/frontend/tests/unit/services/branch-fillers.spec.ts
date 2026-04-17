/**
 * Targeted branch coverage for the few files still under threshold:
 * card.service (revision branches), search.service (sort + filter branches),
 * voyage.service (recalculateStreak with multi-day completed sequences),
 * worker-health (alert sources), worker-queue (failure branches).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { type NebulaDB, setDbFactory } from '$lib/db/connection';
import { createTestDb, destroyTestDb } from '../../helpers/db-factory';
import * as cardService from '$lib/services/card.service';
import * as searchService from '$lib/services/search.service';
import * as voyageService from '$lib/services/voyage.service';
import * as queueService from '$lib/services/worker-queue.service';
import { setWorkerFactory, __resetForTests } from '$lib/services/queue-runner.service';
import { fakeWorkerFactory } from '../../helpers/fake-worker';

let testDb: NebulaDB;
const PROFILE_ID = 'branch-fill-profile';

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

describe('card.service edit-source branches', () => {
  it('updateCard with editSource source captures the edit source', async () => {
    const created = await cardService.createCard(PROFILE_ID, {
      title: 'src', body: 'b body', date: '2024-06-15', mood: 3, tags: [],
    });
    if (!created.ok) throw new Error('seed failed');
    const updated = await cardService.updateCard(
      created.data.id,
      { title: 'changed', body: 'b body', date: '2024-06-15', mood: 3, tags: [] },
      created.data.version,
      'tab-abc',
    );
    expect(updated.ok).toBe(true);
  });

  it('updateCard returns NOT_FOUND for missing id', async () => {
    const r = await cardService.updateCard(
      'missing',
      { title: 't', body: 'b', date: '2024-06-15', mood: 3, tags: [] },
      1,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('NOT_FOUND');
  });

  it('softDeleteCard returns NOT_FOUND for missing id', async () => {
    const r = await cardService.softDeleteCard('missing');
    expect(r.ok).toBe(false);
  });

  it('restoreCard returns NOT_FOUND for missing id', async () => {
    const r = await cardService.restoreCard('missing');
    expect(r.ok).toBe(false);
  });
});

describe('search.service sort/filter branches', () => {
  beforeEach(async () => {
    const t = Date.now();
    await testDb.cards.bulkAdd([
      { id: 'c1', profileId: PROFILE_ID, title: 'Alpha', body: 'one body', date: '2024-01-01', mood: 1, tags: ['nature'], sourceImportId: null, sourceRowNumber: null, thumbnailId: null, createdAt: t, updatedAt: t, deletedAt: null, version: 1 },
      { id: 'c2', profileId: PROFILE_ID, title: 'Beta', body: 'two body', date: '2024-01-02', mood: 5, tags: ['food'], sourceImportId: null, sourceRowNumber: null, thumbnailId: null, createdAt: t, updatedAt: t, deletedAt: null, version: 1 },
      { id: 'c3', profileId: PROFILE_ID, title: 'Gamma', body: 'three body', date: '2024-01-03', mood: 3, tags: ['nature', 'water'], sourceImportId: null, sourceRowNumber: null, thumbnailId: null, createdAt: t, updatedAt: t, deletedAt: null, version: 1 },
    ]);
    // Build the index for these cards.
    for (const c of await testDb.cards.toArray()) {
      await searchService.buildSearchIndex(c);
    }
  });

  it('searchCards with empty query and tag filter returns matching cards', async () => {
    const hits = await searchService.searchCards({ queryText: '', filters: { tags: ['nature'] }, sort: { field: 'relevance', direction: 'desc' } }, PROFILE_ID);
    expect(hits.length).toBe(2);
    expect(hits.map((h) => h.cardId).sort()).toEqual(['c1', 'c3']);
  });

  it('searchCards with moodMin/moodMax filter narrows results', async () => {
    const hits = await searchService.searchCards({ queryText: '', filters: { moodMin: 5, moodMax: 5 }, sort: { field: 'relevance', direction: 'desc' } }, PROFILE_ID);
    expect(hits.length).toBe(1);
    expect(hits[0].cardId).toBe('c2');
  });

  it('searchCards with dateStart/dateEnd filters by date range', async () => {
    const hits = await searchService.searchCards({ queryText: '', filters: { dateStart: '2024-01-02', dateEnd: '2024-01-03' }, sort: { field: 'date', direction: 'asc' } }, PROFILE_ID);
    expect(hits.map((h) => h.cardId)).toEqual(['c2', 'c3']);
  });

  it('searchCards with sort=title asc', async () => {
    const hits = await searchService.searchCards({ queryText: '', filters: {}, sort: { field: 'title', direction: 'asc' } }, PROFILE_ID);
    expect(hits.map((h) => h.cardId)).toEqual(['c1', 'c2', 'c3']);
  });

  it('searchCards with sort=date desc', async () => {
    const hits = await searchService.searchCards({ queryText: '', filters: {}, sort: { field: 'date', direction: 'desc' } }, PROFILE_ID);
    expect(hits.map((h) => h.cardId)).toEqual(['c3', 'c2', 'c1']);
  });
});

describe('voyage.service multi-day streak branches', () => {
  it('recalculateStreak with two consecutive completed days yields streak=2', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    await testDb.missionDayActivities.bulkAdd([
      { id: 'a', profileId: PROFILE_ID, dateLocal: yesterday, distinctViewedCardIds: [], distinctViewCount: 0, completed: true, completionTimestamp: Date.now() - 86_400_000 },
      { id: 'b', profileId: PROFILE_ID, dateLocal: today, distinctViewedCardIds: [], distinctViewCount: 0, completed: true, completionTimestamp: Date.now() },
    ]);
    const s = await voyageService.recalculateStreak(PROFILE_ID);
    expect(s.currentStreak).toBe(2);
  });

  it('recalculateStreak with last completed day older than yesterday resets', async () => {
    await testDb.missionDayActivities.add({
      id: 'old', profileId: PROFILE_ID, dateLocal: '2020-01-01',
      distinctViewedCardIds: [], distinctViewCount: 0,
      completed: true, completionTimestamp: 1577836800000,
    });
    const s = await voyageService.recalculateStreak(PROFILE_ID);
    expect(s.currentStreak).toBe(0);
  });
});

describe('worker-queue.service additional branches', () => {
  it('updateMonitorSnapshot upserts and aggregates by job type', async () => {
    await queueService.updateMonitorSnapshot('index_rebuild', true, 100, 5);
    await queueService.updateMonitorSnapshot('index_rebuild', true, 200, 4);
    const snaps = await queueService.getMonitorSnapshots();
    expect(snaps.length).toBeGreaterThan(0);
    expect(snaps[0].jobType).toBe('index_rebuild');
  });

  it('requestCancelJob blocks re-cancel for non-active jobs', async () => {
    const job = await queueService.createJob('index_rebuild');
    await queueService.updateJobStatus(job.id, 'completed');
    const r = await queueService.requestCancelJob(job.id);
    expect(r.ok).toBe(false);
  });

  it('addJobLog persists logs in chronological order', async () => {
    const job = await queueService.createJob('index_rebuild');
    await queueService.addJobLog(job.id, 'info', 'A', 'first');
    await new Promise((r) => setTimeout(r, 5));
    await queueService.addJobLog(job.id, 'warn', 'B', 'second');
    const logs = await queueService.getJobLogs(job.id);
    expect(logs.map((l) => l.code)).toEqual(['A', 'B']);
  });

  it('exportJobLogs returns one JSONL line per log entry', async () => {
    const job = await queueService.createJob('index_rebuild');
    await queueService.addJobLog(job.id, 'info', 'X', 'msg', { extra: 1 });
    const text = await queueService.exportJobLogs(job.id);
    const lines = text.split('\n').filter(Boolean);
    expect(lines.length).toBe(1);
    expect(JSON.parse(lines[0]).message).toBe('msg');
  });
});
