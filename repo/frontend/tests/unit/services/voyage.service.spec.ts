import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDb, destroyTestDb } from '../../helpers/db-factory';
import { type NebulaDB, setDbFactory } from '$lib/db/connection';

let testDb: NebulaDB;
const PROFILE_ID = 'test-profile';

beforeEach(() => {
  testDb = createTestDb();
  setDbFactory(() => testDb);
});

afterEach(async () => {
  setDbFactory(null);
  await destroyTestDb(testDb);
  vi.restoreAllMocks();
});

const voyageService = await import('$lib/services/voyage.service');
const dateUtils = await import('$lib/utils/date');

describe('voyage.service', () => {
  describe('logCardView', () => {
    it('creates activity for first view', async () => {
      const activity = await voyageService.logCardView(PROFILE_ID, 'card-1');
      expect(activity.distinctViewCount).toBe(1);
      expect(activity.completed).toBe(false);
    });

    it('counts distinct cards only', async () => {
      await voyageService.logCardView(PROFILE_ID, 'card-1');
      await voyageService.logCardView(PROFILE_ID, 'card-1');
      const activity = await voyageService.logCardView(PROFILE_ID, 'card-1');
      expect(activity.distinctViewCount).toBe(1);
    });

    it('increments distinct count for different cards', async () => {
      await voyageService.logCardView(PROFILE_ID, 'card-1');
      await voyageService.logCardView(PROFILE_ID, 'card-2');
      const activity = await voyageService.logCardView(PROFILE_ID, 'card-3');
      expect(activity.distinctViewCount).toBe(3);
    });

    it('marks day complete at 10 distinct views', async () => {
      for (let i = 1; i <= 9; i++) {
        await voyageService.logCardView(PROFILE_ID, `card-${i}`);
      }
      const activity = await voyageService.logCardView(PROFILE_ID, 'card-10');
      expect(activity.completed).toBe(true);
      expect(activity.distinctViewCount).toBe(10);
    });

    it('allows views beyond 10 without changing completion', async () => {
      for (let i = 1; i <= 10; i++) {
        await voyageService.logCardView(PROFILE_ID, `card-${i}`);
      }
      const activity = await voyageService.logCardView(PROFILE_ID, 'card-11');
      expect(activity.completed).toBe(true);
      expect(activity.distinctViewCount).toBe(11);
    });
  });

  describe('getStreak', () => {
    it('returns zero streak for new profile', async () => {
      const streak = await voyageService.getStreak(PROFILE_ID);
      expect(streak.currentStreak).toBe(0);
      expect(streak.longestStreak).toBe(0);
      expect(streak.stardustUnlocked).toBe(false);
    });

    it('starts streak at 1 after first completed day', async () => {
      for (let i = 1; i <= 10; i++) {
        await voyageService.logCardView(PROFILE_ID, `card-${i}`);
      }
      const streak = await voyageService.getStreak(PROFILE_ID);
      expect(streak.currentStreak).toBe(1);
    });
  });

  describe('stardust unlock', () => {
    it('does not unlock stardust with fewer than 7 days', async () => {
      const streak = await voyageService.getStreak(PROFILE_ID);
      expect(streak.stardustUnlocked).toBe(false);
    });
  });
});
