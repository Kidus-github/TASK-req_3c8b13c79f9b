import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDb, destroyTestDb } from '../../helpers/db-factory';
import { type NebulaDB, setDbFactory } from '$lib/db/connection';
import * as cardService from '$lib/services/card.service';

let testDb: NebulaDB;
const PROFILE_ID = 'card-extra-profile';

beforeEach(() => {
  testDb = createTestDb();
  setDbFactory(() => testDb);
});

afterEach(async () => {
  setDbFactory(null);
  await destroyTestDb(testDb);
  vi.restoreAllMocks();
});

describe('card.service extra coverage', () => {
  it('createCard stores an optional thumbnail and links the blob id onto the card', async () => {
    const result = await cardService.createCard(
      PROFILE_ID,
      { title: 'thumb', body: 'body', date: '2024-09-01', mood: 3, tags: [] },
      { thumbnail: new Blob(['img']), thumbnailWidth: 32, thumbnailHeight: 32 },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.thumbnailId).toBeTruthy();
  });

  it('attachCardThumbnail returns NOT_FOUND for an unknown card', async () => {
    const result = await cardService.attachCardThumbnail('missing', new Blob(['x']));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
  });

  it('attachCardThumbnail replaces the previous thumbnail id on an existing card', async () => {
    const created = await cardService.createCard(PROFILE_ID, {
      title: 'replace thumb', body: 'body', date: '2024-09-01', mood: 3, tags: [],
    });
    if (!created.ok) throw new Error('seed failed');
    const first = await cardService.attachCardThumbnail(created.data.id, new Blob(['a']), 10, 10);
    if (!first.ok) throw new Error('first thumbnail failed');
    const second = await cardService.attachCardThumbnail(created.data.id, new Blob(['b']), 20, 20);
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.data.thumbnailId).not.toBe(first.data.thumbnailId);
  });

  it('getCard returns NOT_FOUND for an unknown card id', async () => {
    const result = await cardService.getCard('missing');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
  });

  it('listCards(includeDeleted=true) returns deleted rows too', async () => {
    const created = await cardService.createCard(PROFILE_ID, {
      title: 'keep deleted', body: 'body', date: '2024-09-01', mood: 3, tags: [],
    });
    if (!created.ok) throw new Error('seed failed');
    await cardService.softDeleteCard(created.data.id);
    const cards = await cardService.listCards(PROFILE_ID, true);
    expect(cards).toHaveLength(1);
    expect(cards[0].deletedAt).not.toBeNull();
  });

  it('listCards falls back to the simple profile query when the compound index path throws', async () => {
    const created = await cardService.createCard(PROFILE_ID, {
      title: 'fallback list', body: 'body', date: '2024-09-01', mood: 3, tags: [],
    });
    if (!created.ok) throw new Error('seed failed');
    const db = testDb as any;
    const realCards = db.cards;
    db.cards = {
      ...realCards,
      where: (key: string) => {
        if (key === '[profileId+deletedAt]') throw new Error('compound index unavailable');
        return realCards.where(key);
      },
    };
    try {
      const cards = await cardService.listCards(PROFILE_ID);
      expect(cards.map((c) => c.id)).toEqual([created.data.id]);
    } finally {
      db.cards = realCards;
    }
  });

  it('getCardRevisions returns restore revisions newest-first and countActiveCards ignores deleted rows', async () => {
    const created = await cardService.createCard(PROFILE_ID, {
      title: 'rev', body: 'body', date: '2024-09-01', mood: 3, tags: [],
    });
    if (!created.ok) throw new Error('seed failed');
    await cardService.softDeleteCard(created.data.id);
    await cardService.restoreCard(created.data.id);
    const revisions = await cardService.getCardRevisions(created.data.id);
    expect(revisions.length).toBeGreaterThanOrEqual(1);
    expect(revisions[0].version).toBeGreaterThanOrEqual(revisions.at(-1)!.version);
    expect(await cardService.countActiveCards(PROFILE_ID)).toBe(1);
  });
});
