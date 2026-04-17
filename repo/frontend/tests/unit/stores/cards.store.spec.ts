/**
 * cards store: loadCards, createCard, updateCard, deleteCard, restoreCard,
 * selectCard, derived stores (activeCards, cardsByTag, cardsByMood).
 *
 * Runs against the real card.service backed by fake-indexeddb.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';

import { type NebulaDB, setDbFactory } from '$lib/db/connection';
import { createTestDb, destroyTestDb } from '../../helpers/db-factory';
import { register, logout } from '$lib/stores/auth.store';
import {
  loadCards,
  createCard as createCardStore,
  updateCard as updateCardStore,
  deleteCard,
  restoreCard,
  selectCard,
  cards,
  selected,
  loading,
  error,
  activeCards,
  cardsByTag,
  cardsByMood,
} from '$lib/stores/cards.store';

let testDb: NebulaDB;

beforeEach(async () => {
  testDb = createTestDb();
  setDbFactory(() => testDb);
  await register('demo', 'demopass1');
  // The cards store is module-scoped — re-loading from the fresh DB clears
  // any cards left over from a previous test's profile.
  await loadCards();
});

afterEach(async () => {
  logout();
  selectCard(null);
  setDbFactory(null);
  await destroyTestDb(testDb);
});

describe('cards store', () => {
  it('loadCards is a no-op when no profile is unlocked', async () => {
    logout();
    await loadCards();
    expect(get(cards)).toEqual([]);
    expect(get(loading)).toBe(false);
  });

  it('createCard pushes the new card into the store', async () => {
    const created = await createCardStore({
      title: 'Hello',
      body: 'World body',
      date: '2024-06-15',
      mood: 3,
      tags: ['greeting'],
    });
    expect(created).not.toBeNull();
    expect(get(cards)).toHaveLength(1);
    expect(get(cards)[0].title).toBe('Hello');
  });

  it('createCard returns null and surfaces error for invalid drafts', async () => {
    const created = await createCardStore({
      title: '',
      body: '',
      date: 'not-a-date',
      mood: 9 as 1 | 2 | 3 | 4 | 5,
      tags: [],
    });
    expect(created).toBeNull();
    expect(get(error)).toBeTruthy();
  });

  it('updateCard mutates the card in the store on success', async () => {
    const created = await createCardStore({
      title: 'Old',
      body: 'Old body',
      date: '2024-06-15',
      mood: 3,
      tags: [],
    });
    expect(created).not.toBeNull();
    const updated = await updateCardStore(
      created!.id,
      {
        title: 'New',
        body: 'Old body',
        date: '2024-06-15',
        mood: 3,
        tags: [],
      },
      created!.version
    );
    expect(updated?.title).toBe('New');
    expect(get(cards).find((c) => c.id === created!.id)?.title).toBe('New');
  });

  it('updateCard with a stale version returns null and sets error', async () => {
    const created = await createCardStore({
      title: 'Card', body: 'Body', date: '2024-06-15', mood: 3, tags: [],
    });
    const stale = await updateCardStore(created!.id, {
      title: 'Stale', body: 'Body', date: '2024-06-15', mood: 3, tags: [],
    }, 99);
    expect(stale).toBeNull();
    expect(get(error)).toBeTruthy();
    expect(get(error)).toMatch(/version|conflict|modified/i);
  });

  it('deleteCard removes the card from the store and clears selection', async () => {
    const created = await createCardStore({
      title: 'Doomed', body: 'Body', date: '2024-06-15', mood: 3, tags: [],
    });
    selectCard(created!.id);
    expect(get(selected)).toBe(created!.id);
    const ok = await deleteCard(created!.id);
    expect(ok).toBe(true);
    expect(get(cards).find((c) => c.id === created!.id)).toBeUndefined();
    expect(get(selected)).toBeNull();
  });

  it('restoreCard re-adds a deleted card to the store', async () => {
    const created = await createCardStore({
      title: 'Phoenix', body: 'Body', date: '2024-06-15', mood: 3, tags: [],
    });
    await deleteCard(created!.id);
    const ok = await restoreCard(created!.id);
    expect(ok).toBe(true);
    expect(get(cards).some((c) => c.id === created!.id)).toBe(true);
  });

  it('activeCards excludes soft-deleted cards', async () => {
    await createCardStore({ title: 'A', body: 'a body', date: '2024-06-15', mood: 3, tags: [] });
    const b = await createCardStore({ title: 'B', body: 'b body', date: '2024-06-16', mood: 3, tags: [] });
    await deleteCard(b!.id);
    // The store removed B from cards on delete; activeCards filter still returns the remainder.
    expect(get(activeCards).length).toBeGreaterThanOrEqual(1);
    expect(get(activeCards).every((c) => c.deletedAt === null)).toBe(true);
  });

  it('cardsByTag groups by first tag (or "untagged")', async () => {
    await createCardStore({ title: 'P', body: 'body', date: '2024-06-15', mood: 3, tags: ['photo'] });
    await createCardStore({ title: 'Q', body: 'body', date: '2024-06-15', mood: 3, tags: ['photo', 'extra'] });
    await createCardStore({ title: 'R', body: 'body', date: '2024-06-15', mood: 3, tags: [] });
    const map = get(cardsByTag);
    expect(map.get('photo')?.length).toBe(2);
    expect(map.get('untagged')?.length).toBe(1);
  });

  it('cardsByMood counts cards per mood bucket', async () => {
    await createCardStore({ title: 'A', body: 'b', date: '2024-06-15', mood: 1, tags: [] });
    await createCardStore({ title: 'B', body: 'b', date: '2024-06-15', mood: 1, tags: [] });
    await createCardStore({ title: 'C', body: 'b', date: '2024-06-15', mood: 5, tags: [] });
    const counts = get(cardsByMood);
    expect(counts[1]).toBe(2);
    expect(counts[5]).toBe(1);
    expect(counts[3]).toBe(0);
  });

  it('selectCard sets and clears the selected store', () => {
    selectCard('xyz');
    expect(get(selected)).toBe('xyz');
    selectCard(null);
    expect(get(selected)).toBeNull();
  });

  it('loadCards refreshes from the database', async () => {
    await createCardStore({ title: 'Pre', body: 'b', date: '2024-06-15', mood: 3, tags: [] });
    await loadCards();
    expect(get(cards).length).toBe(1);
  });
});
