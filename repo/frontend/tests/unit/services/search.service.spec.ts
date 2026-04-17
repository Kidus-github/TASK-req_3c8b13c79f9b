import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, destroyTestDb } from '../../helpers/db-factory';
import { type NebulaDB, setDbFactory } from '$lib/db/connection';
import * as searchService from '$lib/services/search.service';
import * as cardService from '$lib/services/card.service';
import type { SearchQuery } from '$lib/types/search';

let testDb: NebulaDB;
const PROFILE_ID = 'test-profile';

beforeEach(() => {
  testDb = createTestDb();
  setDbFactory(() => testDb);
});

afterEach(async () => {
  setDbFactory(null);
  await destroyTestDb(testDb);
});

async function createAndIndex(title: string, body: string, tags: string[], mood = 3, date = '2024-06-15') {
  const result = await cardService.createCard(PROFILE_ID, { title, body, date, mood, tags });
  if (result.ok) {
    await searchService.buildSearchIndex(result.data);
    return result.data;
  }
  throw new Error('Failed to create card');
}

describe('search.service', () => {
  describe('tokenize', () => {
    it('lowercases and splits', () => {
      const tokens = searchService.tokenize('Hello World');
      expect(tokens).toContain('hello');
      expect(tokens).toContain('world');
    });

    it('removes stop words', () => {
      const tokens = searchService.tokenize('the quick brown fox');
      expect(tokens).not.toContain('the');
      expect(tokens).toContain('quick');
    });

    it('removes short tokens', () => {
      const tokens = searchService.tokenize('a b cd ef');
      expect(tokens).not.toContain('a');
      expect(tokens).not.toContain('b');
      expect(tokens).toContain('cd');
    });
  });

  describe('searchCards', () => {
    it('finds cards by title', async () => {
      await createAndIndex('Sunset Photography', 'Beautiful sunset', ['nature']);
      await createAndIndex('Morning Coffee', 'Great coffee today', ['food']);

      const query: SearchQuery = {
        queryText: 'sunset',
        filters: {},
        sort: { field: 'relevance', direction: 'desc' },
      };

      const hits = await searchService.searchCards(query, PROFILE_ID);
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0].matchedFields).toContain('title');
    });

    it('weighs title matches higher than body', async () => {
      const card1 = await createAndIndex('Beautiful', 'A sunset photo', ['nature']);
      const card2 = await createAndIndex('Sunset', 'A normal day', ['nature']);

      const query: SearchQuery = {
        queryText: 'sunset',
        filters: {},
        sort: { field: 'relevance', direction: 'desc' },
      };

      const hits = await searchService.searchCards(query, PROFILE_ID);
      // Card with 'sunset' in title should rank higher
      expect(hits[0].cardId).toBe(card2.id);
    });

    it('filters by mood', async () => {
      await createAndIndex('Happy Day', 'Great', ['mood'], 5);
      await createAndIndex('Sad Day', 'Bad', ['mood'], 1);

      const query: SearchQuery = {
        queryText: '',
        filters: { moodMin: 4 },
        sort: { field: 'mood', direction: 'desc' },
      };

      const hits = await searchService.searchCards(query, PROFILE_ID);
      expect(hits).toHaveLength(1);
    });

    it('filters by date range', async () => {
      await createAndIndex('January', 'Content', ['time'], 3, '2024-01-15');
      await createAndIndex('June', 'Content', ['time'], 3, '2024-06-15');
      await createAndIndex('December', 'Content', ['time'], 3, '2024-12-15');

      const query: SearchQuery = {
        queryText: '',
        filters: { dateStart: '2024-05-01', dateEnd: '2024-07-01' },
        sort: { field: 'date', direction: 'asc' },
      };

      const hits = await searchService.searchCards(query, PROFILE_ID);
      expect(hits).toHaveLength(1);
    });

    it('filters by tags', async () => {
      await createAndIndex('Nature Card', 'Trees', ['nature']);
      await createAndIndex('Design Card', 'Colors', ['design']);

      const query: SearchQuery = {
        queryText: '',
        filters: { tags: ['nature'] },
        sort: { field: 'relevance', direction: 'desc' },
      };

      const hits = await searchService.searchCards(query, PROFILE_ID);
      expect(hits).toHaveLength(1);
    });

    it('returns all cards for empty query with no filters', async () => {
      await createAndIndex('Card A', 'Body A', ['tag']);
      await createAndIndex('Card B', 'Body B', ['tag']);

      const query: SearchQuery = {
        queryText: '',
        filters: {},
        sort: { field: 'title', direction: 'asc' },
      };

      const hits = await searchService.searchCards(query, PROFILE_ID);
      expect(hits).toHaveLength(2);
    });

    it('sorts by date', async () => {
      const c1 = await createAndIndex('Older', 'Body', ['tag'], 3, '2024-01-01');
      const c2 = await createAndIndex('Newer', 'Body', ['tag'], 3, '2024-12-01');

      const query: SearchQuery = {
        queryText: '',
        filters: {},
        sort: { field: 'date', direction: 'asc' },
      };

      const hits = await searchService.searchCards(query, PROFILE_ID);
      expect(hits[0].cardId).toBe(c1.id);
      expect(hits[1].cardId).toBe(c2.id);
    });
  });

  describe('rebuildSearchIndex', () => {
    it('rebuilds index from cards', async () => {
      const c1 = await createAndIndex('Card One', 'Body', ['tag']);
      const c2 = await createAndIndex('Card Two', 'Body', ['tag']);

      // Clear index
      await testDb.searchIndex.clear();
      const statsBefore = await searchService.getSearchIndexStats();
      expect(statsBefore.totalRecords).toBe(0);

      // Rebuild
      const allCards = await testDb.cards.toArray();
      const count = await searchService.rebuildSearchIndex(allCards);
      expect(count).toBe(2);

      const statsAfter = await searchService.getSearchIndexStats();
      expect(statsAfter.totalRecords).toBe(2);
    });
  });

  describe('profile isolation', () => {
    const PROFILE_A = 'profile-a';
    const PROFILE_B = 'profile-b';

    async function seed(profile: string, title: string, body: string) {
      const r = await cardService.createCard(profile, {
        title,
        body,
        date: '2024-06-15',
        mood: 3,
        tags: ['shared-tag'],
      });
      if (!r.ok) throw new Error('seed failed');
      await searchService.buildSearchIndex(r.data);
      return r.data;
    }

    it('persists profileId on every SearchIndexRecord', async () => {
      const card = await seed(PROFILE_A, 'Alpha Card', 'Alpha body content');
      const record = await testDb.searchIndex.get(card.id);
      expect(record?.profileId).toBe(PROFILE_A);
    });

    it('prevents one profile from discovering another profile’s cards', async () => {
      const alpha = await seed(PROFILE_A, 'Alpha Secret', 'Alpha private note');
      const beta = await seed(PROFILE_B, 'Beta Secret', 'Beta private note');

      // Profile A should only see its own card.
      const queryA = {
        queryText: 'secret',
        filters: {},
        sort: { field: 'relevance' as const, direction: 'desc' as const },
      };
      const hitsA = await searchService.searchCards(queryA, PROFILE_A);
      expect(hitsA.map(h => h.cardId)).toEqual([alpha.id]);

      // Empty query with the shared tag should still not leak.
      const hitsAllA = await searchService.searchCards(
        { queryText: '', filters: { tags: ['shared-tag'] }, sort: { field: 'relevance', direction: 'desc' } },
        PROFILE_A
      );
      expect(hitsAllA.map(h => h.cardId).sort()).toEqual([alpha.id]);

      const hitsB = await searchService.searchCards(queryA, PROFILE_B);
      expect(hitsB.map(h => h.cardId)).toEqual([beta.id]);
    });

    it('scoped rebuild only clears the requested profile', async () => {
      await seed(PROFILE_A, 'A1', 'Body A one');
      await seed(PROFILE_B, 'B1', 'Body B one');

      const aCards = await testDb.cards.where('profileId').equals(PROFILE_A).toArray();
      await searchService.rebuildSearchIndex(aCards, PROFILE_A);

      const remaining = await testDb.searchIndex.toArray();
      const profiles = new Set(remaining.map(r => r.profileId));
      expect(profiles.has(PROFILE_A)).toBe(true);
      expect(profiles.has(PROFILE_B)).toBe(true);
    });
  });
});
