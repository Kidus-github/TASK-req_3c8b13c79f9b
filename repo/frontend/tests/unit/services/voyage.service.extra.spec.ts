import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDb, destroyTestDb } from '../../helpers/db-factory';
import { type NebulaDB, setDbFactory } from '$lib/db/connection';
import * as voyageService from '$lib/services/voyage.service';

let testDb: NebulaDB;
const PROFILE_ID = 'voyage-extra-profile';

beforeEach(() => {
  testDb = createTestDb();
  setDbFactory(() => testDb);
});

afterEach(async () => {
  setDbFactory(null);
  await destroyTestDb(testDb);
  vi.restoreAllMocks();
});

describe('voyage.service extra branches', () => {
  it('recalculateStreak resets an existing streak when there are no completed days left', async () => {
    await testDb.missionStreaks.add({
      id: 'streak-1',
      profileId: PROFILE_ID,
      currentStreak: 4,
      longestStreak: 6,
      lastCompletedDate: '2024-01-01',
      stardustUnlocked: true,
      stardustUnlockedAt: 10,
      lastResetDate: null,
    });
    const streak = await voyageService.recalculateStreak(PROFILE_ID);
    expect(streak.currentStreak).toBe(0);
    expect(streak.stardustUnlocked).toBe(false);
    expect(streak.lastResetDate).toBeTruthy();
  });

  it('precomputeStardust forwards explicit and default values to the worker runner', async () => {
    const runJob = vi.fn(async () => ({
      result: { enabled: true, particles: [], count: 12, kind: 'stardust' },
    }));
    vi.doMock('$lib/services/queue-runner.service', () => ({ runJob }));
    const mod = await import('$lib/services/voyage.service');

    const explicit = await mod.precomputeStardust({
      kind: 'stardust',
      stardustUnlocked: true,
      seed: 7,
      particleCount: 50,
      bounds: { x: 1, y: 2, z: 3 },
    });
    expect(explicit.count).toBe(12);
    expect(runJob.mock.calls[0][1]).toMatchObject({ seed: 7, particleCount: 50, bounds: { x: 1, y: 2, z: 3 } });

    await mod.precomputeStardust({ kind: 'stardust', stardustUnlocked: false });
    expect(runJob.mock.calls[1][1]).toMatchObject({
      seed: 42,
      particleCount: 600,
      bounds: { x: 30, y: 18, z: 30 },
    });
  });
});
