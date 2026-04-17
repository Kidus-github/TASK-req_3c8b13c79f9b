import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDb, destroyTestDb } from '../../helpers/db-factory';
import { type NebulaDB, setDbFactory } from '$lib/db/connection';
import { generateId } from '$lib/utils/id';

let mockedToday = '2026-04-17';
vi.mock('$lib/utils/date', async () => {
  const actual = await vi.importActual<typeof import('$lib/utils/date')>('$lib/utils/date');
  return {
    ...actual,
    getTodayLocalDate: () => mockedToday,
  };
});

const voyageService = await import('$lib/services/voyage.service');

let testDb: NebulaDB;
const PROFILE_ID = 'streak-test-profile';

beforeEach(() => {
  testDb = createTestDb();
  setDbFactory(() => testDb);
  mockedToday = '2026-04-17';
});

afterEach(async () => {
  setDbFactory(null);
  await destroyTestDb(testDb);
});

async function seedCompletedDay(date: string) {
  await testDb.missionDayActivities.add({
    id: generateId(),
    profileId: PROFILE_ID,
    dateLocal: date,
    distinctViewedCardIds: Array.from({ length: 10 }, (_, i) => `card-${date}-${i}`),
    distinctViewCount: 10,
    completed: true,
    completionTimestamp: Date.parse(`${date}T12:00:00Z`),
  });
}

async function seedStreak(currentStreak: number, lastCompletedDate: string, stardust = false) {
  await testDb.missionStreaks.add({
    id: generateId(),
    profileId: PROFILE_ID,
    currentStreak,
    longestStreak: currentStreak,
    lastCompletedDate,
    stardustUnlocked: stardust,
    stardustUnlockedAt: stardust ? Date.parse(`${lastCompletedDate}T12:00:00Z`) : null,
    lastResetDate: null,
  });
}

describe('voyage streak reset on missed day', () => {
  it('resets currentStreak to 0 when a required day was missed', async () => {
    await seedCompletedDay('2026-04-14');
    await seedStreak(1, '2026-04-14');

    // Today is 2026-04-17 — yesterday (2026-04-16) not completed, so reset.
    mockedToday = '2026-04-17';

    const recalculated = await voyageService.recalculateStreak(PROFILE_ID);
    expect(recalculated.currentStreak).toBe(0);
  });

  it('preserves a streak when the most recent completion is today', async () => {
    await seedCompletedDay('2026-04-16');
    await seedCompletedDay('2026-04-17');
    await seedStreak(2, '2026-04-17');

    mockedToday = '2026-04-17';

    const recalculated = await voyageService.recalculateStreak(PROFILE_ID);
    expect(recalculated.currentStreak).toBe(2);
  });

  it('preserves a streak when the most recent completion is yesterday', async () => {
    await seedCompletedDay('2026-04-15');
    await seedCompletedDay('2026-04-16');
    await seedStreak(2, '2026-04-16');

    mockedToday = '2026-04-17';

    const recalculated = await voyageService.recalculateStreak(PROFILE_ID);
    expect(recalculated.currentStreak).toBe(2);
  });

  it('revokes stardust when the streak resets below the unlock threshold', async () => {
    for (let d = 10; d <= 16; d++) {
      await seedCompletedDay(`2026-04-${String(d).padStart(2, '0')}`);
    }
    await seedStreak(7, '2026-04-16', true);

    mockedToday = '2026-04-20';

    const recalculated = await voyageService.recalculateStreak(PROFILE_ID);
    expect(recalculated.currentStreak).toBe(0);
    expect(recalculated.stardustUnlocked).toBe(false);
    expect(recalculated.lastResetDate).toBe('2026-04-20');
  });

  it('keeps stardust aligned when an existing unlock is still streaking', async () => {
    for (let d = 10; d <= 16; d++) {
      await seedCompletedDay(`2026-04-${String(d).padStart(2, '0')}`);
    }
    await seedStreak(7, '2026-04-16', true);

    mockedToday = '2026-04-17';

    const recalculated = await voyageService.recalculateStreak(PROFILE_ID);
    expect(recalculated.currentStreak).toBe(7);
    expect(recalculated.stardustUnlocked).toBe(true);
  });

  it('returns zeroed streak with no completed activities', async () => {
    mockedToday = '2026-04-17';
    const recalculated = await voyageService.recalculateStreak(PROFILE_ID);
    expect(recalculated.currentStreak).toBe(0);
    expect(recalculated.stardustUnlocked).toBe(false);
  });
});

describe('voyage store loadVoyageData integration', () => {
  it('completed streak -> missed day -> app reload -> streak becomes 0', async () => {
    await seedCompletedDay('2026-04-14');
    await seedStreak(1, '2026-04-14');

    mockedToday = '2026-04-17';

    // Store's load path now recalculates before exposing state.
    const loaded = await voyageService.recalculateStreak(PROFILE_ID);
    expect(loaded.currentStreak).toBe(0);

    const persisted = await testDb.missionStreaks
      .where('profileId')
      .equals(PROFILE_ID)
      .first();
    expect(persisted?.currentStreak).toBe(0);
    expect(persisted?.lastResetDate).toBe('2026-04-17');
  });

  it('a non-missed day does not reset the streak', async () => {
    await seedCompletedDay('2026-04-14');
    await seedCompletedDay('2026-04-15');
    await seedCompletedDay('2026-04-16');
    await seedStreak(3, '2026-04-16');

    mockedToday = '2026-04-17';

    const loaded = await voyageService.recalculateStreak(PROFILE_ID);
    expect(loaded.currentStreak).toBe(3);
  });
});
