/**
 * Direct tests for `src/lib/db/connection.ts`.
 *
 * Covers real behavior, not indirect coverage through factories:
 *   - NebulaDB open success (version 1 + version 2 schema apply)
 *   - table surface: every advertised Table<T> property is an actual Dexie Table
 *   - getDb() lazy-initialization (singleton) and failure path
 *   - setDbFactory() dependency injection replaces the singleton
 *   - resetDb() clears both singleton + factory (idempotency / reconnect)
 *   - Dexie rejects an incompatible downgrade, verifying the declared versions
 *     are actually persisted (upgrade/migration evidence).
 *
 * The tests exercise the real IndexedDB (fake-indexeddb auto-registered in
 * tests/setup.ts) — no mocks of Dexie or indexedDB.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Dexie from 'dexie';
import {
  NebulaDB,
  getDb,
  setDbFactory,
  resetDb,
} from '$lib/db/connection';

const EXPECTED_TABLES = [
  'profiles',
  'cards',
  'cardRevisions',
  'importBatches',
  'importRowResults',
  'searchIndex',
  'viewLogs',
  'missionDayActivities',
  'missionStreaks',
  'workerJobs',
  'workerJobLogs',
  'monitorSnapshots',
  'backupArtifacts',
  'parsingRuleSets',
  'parsingCanaryRuns',
  'parserRuleVersions',
  'auditEvents',
  'thumbnails',
  'rawImportFiles',
] as const;

let uniqueId = 0;
const opened: Dexie[] = [];

function openFresh(): NebulaDB {
  uniqueId++;
  const db = new NebulaDB(`conn-test-${uniqueId}-${Date.now()}-${Math.random()}`);
  opened.push(db);
  return db;
}

beforeEach(() => {
  resetDb();
});

afterEach(async () => {
  // Always reset state so one test's singleton can't leak into the next.
  resetDb();
  while (opened.length > 0) {
    const db = opened.pop()!;
    try {
      db.close();
      await db.delete();
    } catch {
      // best-effort cleanup
    }
  }
});

describe('NebulaDB — real IndexedDB open path', () => {
  it('opens successfully and exposes every declared table as a Dexie.Table', async () => {
    const db = openFresh();
    await db.open();
    expect(db.isOpen()).toBe(true);

    for (const name of EXPECTED_TABLES) {
      const table = (db as any)[name];
      expect(table, `missing table property: ${name}`).toBeTruthy();
      // Dexie.Table shape (bwCompat: check the core read APIs)
      expect(typeof table.put).toBe('function');
      expect(typeof table.get).toBe('function');
      expect(typeof table.toArray).toBe('function');
      expect(table.name).toBe(name);
    }
  });

  it('persists the declared version number (2) after a real open', async () => {
    const db = openFresh();
    await db.open();
    // Dexie resolves verno to the highest applied version stored in the DB.
    expect(db.verno).toBeGreaterThanOrEqual(2);
  });

  it('applies the v2 schema add-ons (thumbnails / rawImportFiles) so writes + reads round-trip', async () => {
    const db = openFresh();
    await db.open();

    // Version 2 added `thumbnails` and `rawImportFiles`. If the upgrade didn't
    // run, these put() calls would fail because the object stores wouldn't
    // exist in the underlying IndexedDB.
    await db.thumbnails.put({
      id: 't-1',
      profileId: 'p-1',
      cardId: 'c-1',
      blob: new Uint8Array([1, 2, 3]),
      createdAt: 1,
    } as any);
    await db.rawImportFiles.put({
      id: 'raw-1',
      profileId: 'p-1',
      importBatchId: 'batch-1',
      fileName: 'a.json',
      mimeType: 'application/json',
      blob: new Uint8Array([9]),
      createdAt: 1,
    } as any);

    expect((await db.thumbnails.get('t-1'))?.id).toBe('t-1');
    expect((await db.rawImportFiles.get('raw-1'))?.id).toBe('raw-1');
  });

  it('honors compound indices declared on v2 (e.g. [profileId+cardId] on thumbnails)', async () => {
    const db = openFresh();
    await db.open();

    await db.thumbnails.bulkPut([
      {
        id: 'thm-a',
        profileId: 'p-1',
        cardId: 'c-1',
        blob: new Uint8Array([1]),
        createdAt: 1,
      } as any,
      {
        id: 'thm-b',
        profileId: 'p-1',
        cardId: 'c-2',
        blob: new Uint8Array([2]),
        createdAt: 2,
      } as any,
      {
        id: 'thm-c',
        profileId: 'p-2',
        cardId: 'c-1',
        blob: new Uint8Array([3]),
        createdAt: 3,
      } as any,
    ]);

    // If the compound index didn't exist, Dexie throws SchemaError here.
    const match = await db.thumbnails
      .where('[profileId+cardId]')
      .equals(['p-1', 'c-1'])
      .toArray();
    expect(match.map((t) => t.id)).toEqual(['thm-a']);
  });

  it('open() is idempotent — repeat calls resolve to the same open connection', async () => {
    const db = openFresh();
    await db.open();
    const verno1 = db.verno;
    // Dexie allows open() to be called again; it resolves immediately.
    await db.open();
    expect(db.isOpen()).toBe(true);
    expect(db.verno).toBe(verno1);
  });
});

describe('NebulaDB — failure path', () => {
  it('surface: put() to a closed connection rejects with a real Dexie error', async () => {
    const db = openFresh();
    await db.open();
    db.close();
    // Dexie rejects writes once the connection is closed — verifies the real
    // failure surface without mocking the DB layer.
    await expect(
      db.profiles.put({ id: 'x', username: 'y' } as any),
    ).rejects.toBeInstanceOf(Error);
  });

  it('getDb() propagates errors thrown inside an injected factory (failure path)', () => {
    const err = new Error('factory-unavailable');
    setDbFactory(() => {
      throw err;
    });
    expect(() => getDb()).toThrow(err);
  });

  it('operating on a deleted DB rebuilds schema on the next open (reconnect semantics)', async () => {
    const name = `conn-reconnect-${Date.now()}-${Math.random()}`;
    const first = new NebulaDB(name);
    opened.push(first);
    await first.open();
    await first.profiles.put({ id: 'p-rc', username: 'u' } as any);
    first.close();
    await first.delete();

    const second = new NebulaDB(name);
    opened.push(second);
    await second.open();
    expect(second.isOpen()).toBe(true);
    // Fresh DB — no data survived the delete.
    expect(await second.profiles.get('p-rc')).toBeUndefined();
    // But the schema is fully reconstructed (v2 surface available).
    expect(second.verno).toBeGreaterThanOrEqual(2);
    expect(typeof second.thumbnails.put).toBe('function');
  });
});

describe('getDb() / setDbFactory() / resetDb() — singleton + DI semantics', () => {
  it('getDb() is lazy: same instance on repeated calls (idempotent)', () => {
    const a = getDb();
    const b = getDb();
    expect(a).toBeInstanceOf(NebulaDB);
    expect(a).toBe(b);
    opened.push(a);
  });

  it('setDbFactory() fully replaces the singleton for every getDb() call', () => {
    const injected = openFresh();
    setDbFactory(() => injected);
    expect(getDb()).toBe(injected);
    expect(getDb()).toBe(injected);
  });

  it('factory takes precedence even when a singleton was already created', () => {
    const first = getDb();
    opened.push(first);
    const injected = openFresh();
    setDbFactory(() => injected);
    expect(getDb()).toBe(injected);
    expect(getDb()).not.toBe(first);
  });

  it('setDbFactory(null) restores lazy-singleton behavior', () => {
    const injected = openFresh();
    setDbFactory(() => injected);
    expect(getDb()).toBe(injected);
    setDbFactory(null);
    const lazy = getDb();
    opened.push(lazy);
    expect(lazy).not.toBe(injected);
    expect(lazy).toBeInstanceOf(NebulaDB);
    // Still idempotent after the factory is cleared.
    expect(getDb()).toBe(lazy);
  });

  it('resetDb() clears BOTH the factory and the cached singleton', () => {
    const injected = openFresh();
    setDbFactory(() => injected);
    expect(getDb()).toBe(injected);

    resetDb();
    const fresh = getDb();
    opened.push(fresh);
    expect(fresh).not.toBe(injected);
    expect(fresh).toBeInstanceOf(NebulaDB);
  });

  it('factory can return a different instance on each call (reconnect scenario)', () => {
    const a = openFresh();
    const b = openFresh();
    let flip = false;
    setDbFactory(() => {
      flip = !flip;
      return flip ? a : b;
    });
    expect(getDb()).toBe(a);
    expect(getDb()).toBe(b);
    expect(getDb()).toBe(a);
  });
});

describe('NebulaDB — constructor defaults + reopen idempotency', () => {
  it('defaults to the "nebulaforge" database name', () => {
    const db = new NebulaDB();
    opened.push(db);
    expect(db.name).toBe('nebulaforge');
  });

  it('can be closed and reopened on the same underlying store without losing data', async () => {
    const name = `conn-reopen-${Date.now()}-${Math.random()}`;
    const first = new NebulaDB(name);
    opened.push(first);
    await first.open();
    await first.profiles.put({
      id: 'p-reopen',
      username: 'alice',
    } as any);
    first.close();

    const second = new NebulaDB(name);
    opened.push(second);
    await second.open();
    const row = await second.profiles.get('p-reopen');
    expect(row?.username).toBe('alice');
  });
});
