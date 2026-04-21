import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { createTestDb, destroyTestDb } from '../../helpers/db-factory';
import { type NebulaDB, setDbFactory } from '$lib/db/connection';
import { register, logout } from '$lib/stores/auth.store';
import {
  loadCards,
  createCard as createCardStore,
  updateCard as updateCardStore,
  deleteCard,
  restoreCard,
  cards,
  error,
} from '$lib/stores/cards.store';
import { syncService } from '$lib/services/sync.service';

let testDb: NebulaDB;

beforeEach(async () => {
  testDb = createTestDb();
  setDbFactory(() => testDb);
  await register('demo', 'demopass1');
  await loadCards();
});

afterEach(async () => {
  logout();
  setDbFactory(null);
  await destroyTestDb(testDb);
  vi.restoreAllMocks();
});

describe('cards.store extra failure and sync paths', () => {
  it('loadCards swallows a closed-database race and clears loading', async () => {
    const mod = await import('$lib/stores/cards.store');
    const swallowSpy = vi.spyOn(await import('$lib/utils/db-errors'), 'swallowDbClosed');
    testDb.close();
    await mod.loadCards();
    expect(swallowSpy).toHaveBeenCalled();
    expect(get(mod.loading)).toBe(false);
  });

  it('updateCard/deleteCard/restoreCard surface service errors through the error store', async () => {
    expect(await updateCardStore('missing', {
      title: 'x', body: 'y', date: '2024-10-01', mood: 3, tags: [],
    }, 1)).toBeNull();
    expect(get(error)).toMatch(/not found/i);

    expect(await deleteCard('missing')).toBe(false);
    expect(get(error)).toMatch(/not found/i);

    expect(await restoreCard('missing')).toBe(false);
    expect(get(error)).toMatch(/not found/i);
  });

  it('cross-tab DATA_CHANGED messages trigger a reload when cards change', async () => {
    const mod = await import('$lib/stores/cards.store');
    const created = await createCardStore({
      title: 'reload me', body: 'body', date: '2024-10-01', mood: 3, tags: [],
    });
    if (!created) throw new Error('seed failed');
    await testDb.cards.update(created.id, { title: 'reloaded title' });

    syncService.__injectMessage({
      type: 'DATA_CHANGED',
      tabId: 'other-tab',
      timestamp: Date.now(),
      payload: { entity: 'cards', ids: [created.id] },
    });

    await new Promise((r) => setTimeout(r, 20));
    expect(get(mod.cards).find((c) => c.id === created.id)?.title).toBe('reloaded title');
  });
});
