import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, destroyTestDb } from '../../helpers/db-factory';
import { type NebulaDB, setDbFactory } from '$lib/db/connection';
import * as importService from '$lib/services/import.service';
import type { RawRow, RowValidationResult } from '$lib/workers/protocol';
import { setWorkerFactory, __resetForTests } from '$lib/services/queue-runner.service';
import { fakeWorkerFactory } from '../../helpers/fake-worker';
import { config } from '$lib/config';

let testDb: NebulaDB;

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

const PROFILE_ID = 'test-profile';

function makeValidResults(count: number): { results: RowValidationResult[]; rawRows: RawRow[] } {
  const results: RowValidationResult[] = [];
  const rawRows: RawRow[] = [];

  for (let i = 0; i < count; i++) {
    rawRows.push({
      rowNumber: i + 1,
      data: { title: `Card ${i}`, body: `Body ${i}`, date: '2024-01-01', mood: '3', tags: 'test' },
    });
    results.push({
      rowNumber: i + 1,
      valid: true,
      normalized: {
        title: `Card ${i}`,
        body: `Body ${i}`,
        date: '2024-01-01',
        mood: 3,
        tags: ['test'],
      },
      errors: [],
      warnings: [],
    });
  }

  return { results, rawRows };
}

describe('import.service', () => {
  describe('createImportBatch', () => {
    it('creates a batch in draft status', async () => {
      const batch = await importService.createImportBatch(PROFILE_ID, 'test.csv', 'csv');
      expect(batch.status).toBe('draft');
      expect(batch.fileName).toBe('test.csv');
      expect(batch.fileType).toBe('csv');
      expect(batch.profileId).toBe(PROFILE_ID);
    });
  });

  describe('storeValidationResults', () => {
    it('stores results and updates batch status to review', async () => {
      const batch = await importService.createImportBatch(PROFILE_ID, 'test.csv', 'csv');
      const { results, rawRows } = makeValidResults(5);

      // Add one invalid
      results[2] = {
        rowNumber: 3,
        valid: false,
        normalized: null,
        errors: [{ field: 'title', message: 'Required' }],
        warnings: [],
      };

      await importService.storeValidationResults(batch.id, results, rawRows);

      const updated = await importService.getImportBatch(batch.id);
      expect(updated?.status).toBe('review');
      expect(updated?.validRowCount).toBe(4);
      expect(updated?.invalidRowCount).toBe(1);

      const rows = await importService.getImportRows(batch.id);
      expect(rows).toHaveLength(5);

      const invalidRows = await importService.getImportRows(batch.id, 'invalid');
      expect(invalidRows).toHaveLength(1);
    });
  });

  describe('commitValidRows', () => {
    it('imports valid rows as cards', async () => {
      const batch = await importService.createImportBatch(PROFILE_ID, 'test.csv', 'csv');
      const { results, rawRows } = makeValidResults(3);
      await importService.storeValidationResults(batch.id, results, rawRows);

      const result = await importService.commitValidRows(batch.id, PROFILE_ID);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.imported).toBe(3);
        expect(result.data.skipped).toBe(0);
        expect(result.data.failed).toBe(0);
      }

      // Verify cards were created
      const cards = await testDb.cards.where('profileId').equals(PROFILE_ID).toArray();
      expect(cards).toHaveLength(3);
    });

    it('skips exact duplicates when mode is skip_exact_duplicate', async () => {
      // First import
      const batch1 = await importService.createImportBatch(PROFILE_ID, 'test.csv', 'csv');
      const { results, rawRows } = makeValidResults(2);
      await importService.storeValidationResults(batch1.id, results, rawRows);
      await importService.commitValidRows(batch1.id, PROFILE_ID);

      // Second import with same data
      const batch2 = await importService.createImportBatch(PROFILE_ID, 'test2.csv', 'csv', 'skip_exact_duplicate');
      await importService.storeValidationResults(batch2.id, results, rawRows);

      const result = await importService.commitValidRows(batch2.id, PROFILE_ID, 'skip_exact_duplicate');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.skipped).toBe(2);
        expect(result.data.imported).toBe(0);
      }
    });

    it('rejects commit when not in review state', async () => {
      const batch = await importService.createImportBatch(PROFILE_ID, 'test.csv', 'csv');
      const result = await importService.commitValidRows(batch.id, PROFILE_ID);
      expect(result.ok).toBe(false);
    });
  });

  describe('overwrite_by_id', () => {
    async function createImportForRow(row: RawRow & { id?: string }) {
      const batch = await importService.createImportBatch(PROFILE_ID, 'overwrite.csv', 'csv', 'overwrite_by_id');
      const result: RowValidationResult = {
        rowNumber: row.rowNumber,
        valid: true,
        normalized: {
          title: row.data.title,
          body: row.data.body,
          date: row.data.date,
          mood: parseInt(row.data.mood, 10),
          tags: row.data.tags ? row.data.tags.split(',').map(t => t.trim()) : [],
        },
        errors: [],
        warnings: [],
      };
      await importService.storeValidationResults(batch.id, [result], [row]);
      return batch;
    }

    it('updates the existing card in-place without creating a duplicate', async () => {
      // Seed one card up front.
      const cardService = await import('$lib/services/card.service');
      const created = await cardService.createCard(PROFILE_ID, {
        title: 'Original',
        body: 'Original body',
        date: '2024-05-01',
        mood: 3,
        tags: ['first'],
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const targetId = created.data.id;

      const row: RawRow = {
        rowNumber: 1,
        data: { id: targetId, title: 'Updated', body: 'Updated body', date: '2024-05-02', mood: '5', tags: 'second' },
      };
      const batch = await createImportForRow(row);

      const result = await importService.commitValidRows(batch.id, PROFILE_ID, 'overwrite_by_id');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.imported).toBe(1);
      expect(result.data.failed).toBe(0);

      // No duplicate card.
      const cards = await testDb.cards.where('profileId').equals(PROFILE_ID).toArray();
      expect(cards).toHaveLength(1);

      const after = cards[0];
      expect(after.id).toBe(targetId);
      expect(after.title).toBe('Updated');
      expect(after.body).toBe('Updated body');
      expect(after.date).toBe('2024-05-02');
      expect(after.mood).toBe(5);
      expect(after.tags).toEqual(['second']);
      // Version must be bumped and a revision row written.
      expect(after.version).toBe(created.data.version + 1);
      const revisions = await testDb.cardRevisions.where('cardId').equals(targetId).toArray();
      expect(revisions.length).toBeGreaterThanOrEqual(1);
      expect(revisions.some(r => r.editSource === 'import_overwrite')).toBe(true);

      // Search index must reflect the updated content.
      const indexRec = await testDb.searchIndex.get(targetId);
      expect(indexRec).toBeTruthy();
      expect(Object.keys(indexRec!.tokenMap)).toEqual(expect.arrayContaining(['title:updated']));
      // Old tokens no longer present.
      expect(Object.keys(indexRec!.tokenMap)).not.toEqual(expect.arrayContaining(['title:original']));
    });

    it('persists overwriteMode on the batch when dedupeMode=overwrite_by_id', async () => {
      const batch = await importService.createImportBatch(PROFILE_ID, 'o.csv', 'csv', 'overwrite_by_id');
      expect(batch.overwriteMode).toBe(true);
      const vanilla = await importService.createImportBatch(PROFILE_ID, 'v.csv', 'csv', 'create_new');
      expect(vanilla.overwriteMode).toBe(false);
    });

    it('fails explicitly when the id column does not match any existing card', async () => {
      const row: RawRow = {
        rowNumber: 1,
        data: { id: 'does-not-exist', title: 'T', body: 'B', date: '2024-05-02', mood: '3', tags: '' },
      };
      const batch = await createImportForRow(row);

      const result = await importService.commitValidRows(batch.id, PROFILE_ID, 'overwrite_by_id');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.imported).toBe(0);
      expect(result.data.failed).toBe(1);

      // No card was created by the failed overwrite.
      const cards = await testDb.cards.where('profileId').equals(PROFILE_ID).toArray();
      expect(cards).toHaveLength(0);

      const rows = await importService.getImportRows(batch.id);
      expect(rows[0].status).toBe('failed');
      expect(rows[0].errors.some(e => e.field === 'commit' && /does-not-exist/.test(e.message))).toBe(true);
    });

    it('fails explicitly when the row is missing the id column entirely', async () => {
      const row: RawRow = {
        rowNumber: 1,
        data: { title: 'No ID', body: 'Body', date: '2024-05-02', mood: '3', tags: '' },
      };
      const batch = await createImportForRow(row);

      const result = await importService.commitValidRows(batch.id, PROFILE_ID, 'overwrite_by_id');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.imported).toBe(0);
      expect(result.data.failed).toBe(1);

      const cards = await testDb.cards.where('profileId').equals(PROFILE_ID).toArray();
      expect(cards).toHaveLength(0);

      const rows = await importService.getImportRows(batch.id);
      expect(rows[0].status).toBe('failed');
      expect(rows[0].errors.some(e => e.field === 'commit' && /id column/i.test(e.message))).toBe(true);
    });
  });

  describe('cancelImport', () => {
    it('cancels a batch', async () => {
      const batch = await importService.createImportBatch(PROFILE_ID, 'test.csv', 'csv');
      const result = await importService.cancelImport(batch.id);
      expect(result.ok).toBe(true);

      const updated = await importService.getImportBatch(batch.id);
      expect(updated?.status).toBe('cancelled');
    });
  });

  describe('config-driven thresholds', () => {
    // Regression guard: earlier builds exported a hardcoded `MAX_BATCH_ROWS`
    // constant that feature code used instead of `config.maxImportRows`. The
    // service now routes through config; the helper reflects live config, and
    // the legacy named export is gone.
    const originalMaxRows = config.maxImportRows;
    afterEach(() => {
      config.maxImportRows = originalMaxRows;
    });

    it('getMaxImportRows reflects the current config value', () => {
      config.maxImportRows = 7;
      expect(importService.getMaxImportRows()).toBe(7);
      config.maxImportRows = 321;
      expect(importService.getMaxImportRows()).toBe(321);
    });

    it('does not export the legacy MAX_BATCH_ROWS constant', async () => {
      const mod = await import('$lib/services/import.service');
      expect((mod as any).MAX_BATCH_ROWS).toBeUndefined();
    });
  });

  describe('generateErrorLog', () => {
    it('generates error log for invalid rows', async () => {
      const batch = await importService.createImportBatch(PROFILE_ID, 'test.csv', 'csv');
      const { results, rawRows } = makeValidResults(3);
      results[1] = {
        rowNumber: 2,
        valid: false,
        normalized: null,
        errors: [{ field: 'title', message: 'Required' }],
        warnings: [],
      };
      await importService.storeValidationResults(batch.id, results, rawRows);

      const log = await importService.generateErrorLog(batch.id);
      expect(log).toContain('title');
      expect(log).toContain('Required');
    });
  });
});
