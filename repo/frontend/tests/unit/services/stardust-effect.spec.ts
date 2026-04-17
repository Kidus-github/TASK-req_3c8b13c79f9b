import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, destroyTestDb } from '../../helpers/db-factory';
import { type NebulaDB, setDbFactory } from '$lib/db/connection';
import * as voyageService from '$lib/services/voyage.service';
import { setWorkerFactory, __resetForTests } from '$lib/services/queue-runner.service';
import { fakeWorkerFactory } from '../../helpers/fake-worker';

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

describe('stardust precompute + state flow', () => {
  it('returns an empty particle list when stardust is locked', async () => {
    const out = await voyageService.precomputeStardust({ kind: 'stardust', stardustUnlocked: false });
    expect(out.enabled).toBe(false);
    expect(out.particles).toEqual([]);
  });

  it('returns a populated, shape-correct particle list when unlocked', async () => {
    const out = await voyageService.precomputeStardust({ kind: 'stardust', stardustUnlocked: true, particleCount: 128, seed: 7 });
    expect(out.enabled).toBe(true);
    expect(out.particles.length).toBeGreaterThan(0);
    for (const p of out.particles) {
      expect(p).toHaveProperty('x');
      expect(p).toHaveProperty('y');
      expect(p).toHaveProperty('z');
      expect(p).toHaveProperty('size');
      expect(p).toHaveProperty('hue');
      expect(p).toHaveProperty('twinkle');
    }
  });

  it('seed gives deterministic particles', async () => {
    const a = await voyageService.precomputeStardust({ kind: 'stardust', stardustUnlocked: true, particleCount: 32, seed: 42 });
    const b = await voyageService.precomputeStardust({ kind: 'stardust', stardustUnlocked: true, particleCount: 32, seed: 42 });
    expect(a.particles).toEqual(b.particles);
  });
});
