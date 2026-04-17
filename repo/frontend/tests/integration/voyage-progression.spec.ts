import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, destroyTestDb } from '../helpers/db-factory';
import { type NebulaDB, setDbFactory } from '$lib/db/connection';
import * as cardService from '$lib/services/card.service';
import * as voyageService from '$lib/services/voyage.service';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

let testDb: NebulaDB;
const PROFILE_ID = 'voyager-1';

beforeEach(() => {
  testDb = createTestDb();
  setDbFactory(() => testDb);
});

afterEach(async () => {
  setDbFactory(null);
  await destroyTestDb(testDb);
});

async function seedCards(n: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const r = await cardService.createCard(PROFILE_ID, {
      title: `Card ${i}`,
      body: `Body number ${i} content here`,
      date: '2024-06-15',
      mood: 3,
      tags: ['voyage'],
    });
    if (!r.ok) throw new Error('seed card failed');
    ids.push(r.data.id);
  }
  return ids;
}

describe('integration: voyage mission progression', () => {
  it('completes the 10-distinct-card mission through normal usage', async () => {
    const ids = await seedCards(10);

    for (const id of ids) {
      await voyageService.logCardView(PROFILE_ID, id);
    }

    const activity = await voyageService.getTodayActivity(PROFILE_ID);
    expect(activity).not.toBeNull();
    expect(activity!.distinctViewCount).toBe(10);
    expect(activity!.completed).toBe(true);
    expect(activity!.completionTimestamp).not.toBeNull();
  });

  it('does not count duplicate views of the same card', async () => {
    const [id] = await seedCards(1);
    for (let i = 0; i < 5; i++) await voyageService.logCardView(PROFILE_ID, id);

    const activity = await voyageService.getTodayActivity(PROFILE_ID);
    expect(activity!.distinctViewCount).toBe(1);
    expect(activity!.completed).toBe(false);
  });

  it('the Search / StarMap / Cards route handlers invoke recordCardView', () => {
    // Source files are the contract: every card-view entry point must call recordCardView.
    const here = path.dirname(fileURLToPath(import.meta.url));
    const routesDir = path.resolve(here, '../../src/routes');
    const cardsRoute = readFileSync(path.join(routesDir, 'Cards.svelte'), 'utf8');
    const searchRoute = readFileSync(path.join(routesDir, 'Search.svelte'), 'utf8');
    const starMapRoute = readFileSync(path.join(routesDir, 'StarMap.svelte'), 'utf8');

    expect(cardsRoute).toMatch(/recordCardView\s*\(/);
    expect(searchRoute).toMatch(/recordCardView\s*\(/);
    expect(starMapRoute).toMatch(/recordCardView\s*\(/);
  });
});
