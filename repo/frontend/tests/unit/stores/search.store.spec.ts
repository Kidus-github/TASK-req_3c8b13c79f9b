import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';

import { type NebulaDB, setDbFactory } from '$lib/db/connection';
import { createTestDb, destroyTestDb } from '../../helpers/db-factory';
import { register, logout } from '$lib/stores/auth.store';
import {
  executeSearch,
  rebuildIndexFromCards,
  getCurrentQueryText,
  clearSearch,
  setQueryText,
  setFilters,
  setSort,
  query,
  searchFilters,
  searchSort,
  searchResults,
  searching,
  searchHighlights,
  resultCount,
} from '$lib/stores/search.store';
import { setWorkerFactory, __resetForTests } from '$lib/services/queue-runner.service';
import { fakeWorkerFactory } from '../../helpers/fake-worker';
import * as cardService from '$lib/services/card.service';

let testDb: NebulaDB;

beforeEach(async () => {
  testDb = createTestDb();
  setDbFactory(() => testDb);
  setWorkerFactory(() => fakeWorkerFactory() as unknown as Worker);
  clearSearch();
  await register('demo', 'demopass1');
});

afterEach(async () => {
  __resetForTests();
  clearSearch();
  logout();
  await new Promise((r) => setTimeout(r, 20));
  setDbFactory(null);
  await destroyTestDb(testDb);
});

describe('search store', () => {
  it('clearSearch resets query, results, and highlights', () => {
    setQueryText('alpha');
    clearSearch();
    expect(get(query)).toBe('');
    expect(get(searchResults)).toEqual([]);
    expect(get(searchHighlights)).toEqual([]);
  });

  it('setFilters and setSort update the corresponding stores', () => {
    setFilters({ tags: ['nature'] });
    setSort({ field: 'title', direction: 'asc' });
    expect(get(searchFilters)).toEqual({ tags: ['nature'] });
    expect(get(searchSort)).toEqual({ field: 'title', direction: 'asc' });
  });

  it('getCurrentQueryText returns the current value', () => {
    setQueryText('zeta');
    expect(getCurrentQueryText()).toBe('zeta');
  });

  it('executeSearch is a no-op when no profile is unlocked', async () => {
    logout();
    setQueryText('anything');
    await executeSearch();
    expect(get(searchResults)).toEqual([]);
    expect(get(searching)).toBe(false);
  });

  it('rebuildIndexFromCards returns 0 when no profile is unlocked', async () => {
    logout();
    expect(await rebuildIndexFromCards()).toBe(0);
  });

  it('rebuildIndexFromCards returns the indexed count when cards exist', async () => {
    const profile = await testDb.profiles.toCollection().first();
    await cardService.createCard(profile!.id, {
      title: 'Alpha card', body: 'alpha body content', date: '2024-06-15', mood: 3, tags: ['nature'],
    });
    const indexed = await rebuildIndexFromCards();
    expect(indexed).toBeGreaterThanOrEqual(1);
  });

  it('resultCount derives from searchResults length', async () => {
    expect(get(resultCount)).toBe(0);
  });
});
