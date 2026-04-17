/**
 * Last-mile branch coverage to push parser-rule, voyage, and import.service
 * past the 90% branch threshold.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { type NebulaDB, setDbFactory } from '$lib/db/connection';
import { createTestDb, destroyTestDb } from '../../helpers/db-factory';
import * as voyageService from '$lib/services/voyage.service';
import * as importService from '$lib/services/import.service';
import * as cardService from '$lib/services/card.service';
import { setWorkerFactory, __resetForTests } from '$lib/services/queue-runner.service';
import { fakeWorkerFactory } from '../../helpers/fake-worker';

let testDb: NebulaDB;
const PROFILE_ID = 'last-mile';

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

describe('voyage.service stardust transitions', () => {
  it('unlocks stardust on the streak boundary day and clears it on a reset', async () => {
    const today = new Date().toISOString().slice(0, 10);
    // Seed 7 consecutive completed days ending today.
    const acts = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(Date.now() - (6 - i) * 86_400_000).toISOString().slice(0, 10);
      return {
        id: `act-${i}`, profileId: PROFILE_ID, dateLocal: d,
        distinctViewedCardIds: [], distinctViewCount: 0,
        completed: true, completionTimestamp: Date.now() - (6 - i) * 86_400_000,
      };
    });
    await testDb.missionDayActivities.bulkAdd(acts);

    const s1 = await voyageService.recalculateStreak(PROFILE_ID);
    expect(s1.stardustUnlocked).toBe(true);
    expect(s1.currentStreak).toBeGreaterThanOrEqual(7);

    // Now blank everything (lockout, missed day) and recalc on the same record.
    await testDb.missionDayActivities.clear();
    const s2 = await voyageService.recalculateStreak(PROFILE_ID);
    expect(s2.currentStreak).toBe(0);
    expect(s2.stardustUnlocked).toBe(false);
  });
});

describe('import.service overwrite + skip + create_new flows', () => {
  async function seedActiveCard(title: string) {
    const r = await cardService.createCard(PROFILE_ID, {
      title, body: 'b body', date: '2024-06-15', mood: 3, tags: [],
    });
    if (!r.ok) throw new Error('seed failed');
    return r.data;
  }

  it('skip_exact_duplicate path skips rows whose normalized data matches an existing card', async () => {
    const existing = await seedActiveCard('Same Title');
    const batch = await importService.createImportBatch(PROFILE_ID, 'i.json', 'json');
    await importService.storeValidationResults(batch.id, [
      {
        rowNumber: 1, valid: true,
        normalized: { title: 'Same Title', body: 'b body', date: '2024-06-15', mood: 3, tags: [] },
        errors: [], warnings: [],
      },
    ], [{ rowNumber: 1, data: { title: 'Same Title' } }]);
    const r = await importService.commitValidRows(batch.id, PROFILE_ID, 'skip_exact_duplicate');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.skipped).toBe(1);
      expect(r.data.imported).toBe(0);
    }
    void existing;
  });

  it('overwrite_by_id path updates an existing card when an "id" column matches', async () => {
    const existing = await seedActiveCard('Original');
    const batch = await importService.createImportBatch(PROFILE_ID, 'i.json', 'json');
    await importService.storeValidationResults(batch.id, [
      {
        rowNumber: 1, valid: true,
        normalized: { title: 'Replaced', body: 'b body', date: '2024-06-15', mood: 4, tags: [] },
        errors: [], warnings: [],
      },
    ], [{ rowNumber: 1, data: { id: existing.id, title: 'Replaced' } }]);
    const r = await importService.commitValidRows(batch.id, PROFILE_ID, 'overwrite_by_id');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.imported).toBe(1);
    const updated = await testDb.cards.get(existing.id);
    expect(updated?.title).toBe('Replaced');
  });

  it('overwrite_by_id with a non-matching id records the row as failed', async () => {
    const batch = await importService.createImportBatch(PROFILE_ID, 'i.json', 'json');
    await importService.storeValidationResults(batch.id, [
      {
        rowNumber: 1, valid: true,
        normalized: { title: 'X', body: 'b body', date: '2024-06-15', mood: 3, tags: [] },
        errors: [], warnings: [],
      },
    ], [{ rowNumber: 1, data: { id: 'no-such-id', title: 'X' } }]);
    const r = await importService.commitValidRows(batch.id, PROFILE_ID, 'overwrite_by_id');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.failed).toBe(1);
  });
});
