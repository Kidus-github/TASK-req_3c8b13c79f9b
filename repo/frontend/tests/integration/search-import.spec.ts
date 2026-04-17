import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, destroyTestDb } from '../helpers/db-factory';
import { type NebulaDB, setDbFactory } from '$lib/db/connection';
import * as cardService from '$lib/services/card.service';
import * as searchService from '$lib/services/search.service';
import * as importService from '$lib/services/import.service';
import type { RawRow, RowValidationResult } from '$lib/workers/protocol';
import { setWorkerFactory, __resetForTests } from '$lib/services/queue-runner.service';
import { fakeWorkerFactory } from '../helpers/fake-worker';

let testDb: NebulaDB;
const PROFILE_ID = 'test-profile-integration';

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

describe('integration: import -> index -> search -> highlight', () => {
  it('imports cards, builds index, and returns searchable highlighted results', async () => {
    // 1. Create import batch for JSON
    const batch = await importService.createImportBatch(PROFILE_ID, 'test.json', 'json');

    const rawRows: RawRow[] = [
      { rowNumber: 1, data: { title: 'Sunset Over Mountains', body: 'A beautiful golden sunset photo', date: '2024-01-15', mood: '5', tags: 'nature,photography' } },
      { rowNumber: 2, data: { title: 'Coffee Morning', body: 'Fresh espresso at the cafe', date: '2024-01-16', mood: '4', tags: 'food,drink' } },
      { rowNumber: 3, data: { title: 'Ocean Waves', body: 'Waves crashing on the shore at sunset', date: '2024-01-17', mood: '5', tags: 'nature,water' } },
    ];

    const validationResults: RowValidationResult[] = rawRows.map(row => ({
      rowNumber: row.rowNumber,
      valid: true,
      normalized: {
        title: row.data.title,
        body: row.data.body,
        date: row.data.date,
        mood: parseInt(row.data.mood, 10),
        tags: row.data.tags.split(',').map(t => t.trim()),
      },
      errors: [],
      warnings: [],
    }));

    await importService.storeValidationResults(batch.id, validationResults, rawRows);

    // 2. Commit valid rows (which should index each card via card.service)
    const commitResult = await importService.commitValidRows(batch.id, PROFILE_ID, 'create_new');
    expect(commitResult.ok).toBe(true);
    if (!commitResult.ok) return;
    expect(commitResult.data.imported).toBe(3);

    // 3. Verify index contains all 3 cards
    const stats = await searchService.getSearchIndexStats();
    expect(stats.totalRecords).toBe(3);

    // 4. Search for "sunset" — should find 2 cards (title and body match)
    const hits = await searchService.searchCards(
      { queryText: 'sunset', filters: {}, sort: { field: 'relevance', direction: 'desc' } },
      PROFILE_ID
    );
    expect(hits.length).toBe(2);
    // Title-weighted card should rank first
    const topCard = await testDb.cards.get(hits[0].cardId);
    expect(topCard?.title).toContain('Sunset');

    // 5. Confirm highlight markup is present for selected result
    const highlighted = searchService.highlightMatches(topCard!.title, 'sunset');
    expect(highlighted).toContain('<mark>');
    expect(highlighted.toLowerCase()).toContain('sunset');

    // 6. Tag filter should narrow results
    const tagHits = await searchService.searchCards(
      { queryText: '', filters: { tags: ['water'] }, sort: { field: 'relevance', direction: 'desc' } },
      PROFILE_ID
    );
    expect(tagHits).toHaveLength(1);
    const tagCard = await testDb.cards.get(tagHits[0].cardId);
    expect(tagCard?.title).toBe('Ocean Waves');
  });

  it('removes card from index on soft delete and restores it on restore', async () => {
    const result = await cardService.createCard(PROFILE_ID, {
      title: 'Temporary Card',
      body: 'Will be deleted',
      date: '2024-03-01',
      mood: 3,
      tags: ['temp'],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    let stats = await searchService.getSearchIndexStats();
    expect(stats.totalRecords).toBe(1);

    // Hit exists
    let hits = await searchService.searchCards(
      { queryText: 'temporary', filters: {}, sort: { field: 'relevance', direction: 'desc' } },
      PROFILE_ID
    );
    expect(hits).toHaveLength(1);

    // Delete removes from index
    await cardService.softDeleteCard(result.data.id);
    stats = await searchService.getSearchIndexStats();
    expect(stats.totalRecords).toBe(0);
    hits = await searchService.searchCards(
      { queryText: 'temporary', filters: {}, sort: { field: 'relevance', direction: 'desc' } },
      PROFILE_ID
    );
    expect(hits).toHaveLength(0);

    // Restore re-adds to index
    await cardService.restoreCard(result.data.id);
    stats = await searchService.getSearchIndexStats();
    expect(stats.totalRecords).toBe(1);
    hits = await searchService.searchCards(
      { queryText: 'temporary', filters: {}, sort: { field: 'relevance', direction: 'desc' } },
      PROFILE_ID
    );
    expect(hits).toHaveLength(1);
  });

  it('updates index when card is edited', async () => {
    const created = await cardService.createCard(PROFILE_ID, {
      title: 'Old Title',
      body: 'Old body content',
      date: '2024-04-01',
      mood: 3,
      tags: ['v1'],
    });
    if (!created.ok) throw new Error('create failed');

    let hits = await searchService.searchCards(
      { queryText: 'old', filters: {}, sort: { field: 'relevance', direction: 'desc' } },
      PROFILE_ID
    );
    expect(hits).toHaveLength(1);

    // Update with new content
    await cardService.updateCard(
      created.data.id,
      { title: 'Fresh Title', body: 'Brand new body text', date: '2024-04-02', mood: 4, tags: ['v2'] },
      1
    );

    hits = await searchService.searchCards(
      { queryText: 'fresh', filters: {}, sort: { field: 'relevance', direction: 'desc' } },
      PROFILE_ID
    );
    expect(hits).toHaveLength(1);

    // Old tokens should no longer match (because we overwrote the record)
    const oldHits = await searchService.searchCards(
      { queryText: 'old', filters: {}, sort: { field: 'relevance', direction: 'desc' } },
      PROFILE_ID
    );
    expect(oldHits).toHaveLength(0);
  });
});
