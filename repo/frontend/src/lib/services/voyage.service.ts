import { getDb } from '$lib/db/connection';
import type { MissionDayActivity, MissionStreak, ViewLog } from '$lib/types/voyage';
import { type AppResult, ok, err, ErrorCode } from '$lib/types/result';
import { generateId } from '$lib/utils/id';
import { getTodayLocalDate, isYesterday } from '$lib/utils/date';
import { config } from '$lib/config';

const DAILY_GOAL = config.dailyViewGoal;
const STARDUST_STREAK_THRESHOLD = config.stardustStreakDays;

export async function logCardView(profileId: string, cardId: string): Promise<MissionDayActivity> {
  const db = getDb();
  const today = getTodayLocalDate();

  // Log the view
  const viewLog: ViewLog = {
    id: generateId(),
    profileId,
    cardId,
    viewedAt: Date.now(),
    dateLocal: today,
  };
  await db.viewLogs.add(viewLog);

  // Get or create today's activity
  let activity = await db.missionDayActivities
    .where('[profileId+dateLocal]')
    .equals([profileId, today])
    .first();

  if (!activity) {
    activity = {
      id: generateId(),
      profileId,
      dateLocal: today,
      distinctViewedCardIds: [cardId],
      distinctViewCount: 1,
      completed: false,
      completionTimestamp: null,
    };
    await db.missionDayActivities.add(activity);
  } else {
    if (!activity.distinctViewedCardIds.includes(cardId)) {
      activity.distinctViewedCardIds.push(cardId);
      activity.distinctViewCount = activity.distinctViewedCardIds.length;

      if (!activity.completed && activity.distinctViewCount >= DAILY_GOAL) {
        activity.completed = true;
        activity.completionTimestamp = Date.now();
      }

      await db.missionDayActivities.update(activity.id, {
        distinctViewedCardIds: activity.distinctViewedCardIds,
        distinctViewCount: activity.distinctViewCount,
        completed: activity.completed,
        completionTimestamp: activity.completionTimestamp,
      });

      // Update streak if day just completed
      if (activity.completed && activity.distinctViewCount === DAILY_GOAL) {
        await updateStreak(profileId, today);
      }
    }
  }

  return activity;
}

async function updateStreak(profileId: string, completedDate: string): Promise<void> {
  const db = getDb();
  let streak = await db.missionStreaks.where('profileId').equals(profileId).first();

  if (!streak) {
    streak = {
      id: generateId(),
      profileId,
      currentStreak: 1,
      longestStreak: 1,
      lastCompletedDate: completedDate,
      stardustUnlocked: false,
      stardustUnlockedAt: null,
      lastResetDate: null,
    };
    await db.missionStreaks.add(streak);
    return;
  }

  if (streak.lastCompletedDate === completedDate) return; // Already counted

  if (streak.lastCompletedDate && isYesterday(streak.lastCompletedDate, completedDate)) {
    // Consecutive day
    streak.currentStreak += 1;
  } else {
    // Streak broken or first day
    streak.currentStreak = 1;
    if (streak.lastCompletedDate) {
      streak.lastResetDate = completedDate;
    }
  }

  streak.lastCompletedDate = completedDate;
  streak.longestStreak = Math.max(streak.longestStreak, streak.currentStreak);

  if (!streak.stardustUnlocked && streak.currentStreak >= STARDUST_STREAK_THRESHOLD) {
    streak.stardustUnlocked = true;
    streak.stardustUnlockedAt = Date.now();
  }

  await db.missionStreaks.update(streak.id, streak);
}

export async function getStreak(profileId: string): Promise<MissionStreak> {
  const db = getDb();
  const streak = await db.missionStreaks.where('profileId').equals(profileId).first();
  return streak ?? {
    id: '',
    profileId,
    currentStreak: 0,
    longestStreak: 0,
    lastCompletedDate: null,
    stardustUnlocked: false,
    stardustUnlockedAt: null,
    lastResetDate: null,
  };
}

export async function getTodayActivity(profileId: string): Promise<MissionDayActivity | null> {
  const db = getDb();
  const today = getTodayLocalDate();
  return (await db.missionDayActivities
    .where('[profileId+dateLocal]')
    .equals([profileId, today])
    .first()) ?? null;
}

export async function recalculateStreak(profileId: string): Promise<MissionStreak> {
  const db = getDb();
  const today = getTodayLocalDate();
  const activities = await db.missionDayActivities
    .where('profileId')
    .equals(profileId)
    .toArray();

  const completedDates = activities
    .filter(a => a.completed)
    .map(a => a.dateLocal)
    .sort();

  let streak = await db.missionStreaks.where('profileId').equals(profileId).first();

  if (completedDates.length === 0) {
    if (streak && streak.currentStreak !== 0) {
      streak.currentStreak = 0;
      streak.stardustUnlocked = false;
      streak.stardustUnlockedAt = null;
      streak.lastResetDate = today;
      await db.missionStreaks.update(streak.id, streak);
    }
    return streak ?? {
      id: '',
      profileId,
      currentStreak: 0,
      longestStreak: 0,
      lastCompletedDate: null,
      stardustUnlocked: false,
      stardustUnlockedAt: null,
      lastResetDate: null,
    };
  }

  let currentStreak = 1;
  let longestStreak = 1;

  for (let i = completedDates.length - 1; i > 0; i--) {
    if (isYesterday(completedDates[i - 1], completedDates[i])) {
      currentStreak++;
      longestStreak = Math.max(longestStreak, currentStreak);
    } else {
      break;
    }
  }

  // Check if the most recent completed date is today or yesterday; otherwise
  // a required day was missed and the current streak must reset.
  const lastCompleted = completedDates[completedDates.length - 1];
  const missedDay = lastCompleted !== today && !isYesterday(lastCompleted, today);
  if (missedDay) {
    currentStreak = 0;
  }

  const stardustEarned = currentStreak >= STARDUST_STREAK_THRESHOLD;

  if (!streak) {
    streak = {
      id: generateId(),
      profileId,
      currentStreak,
      longestStreak,
      lastCompletedDate: lastCompleted,
      stardustUnlocked: stardustEarned,
      stardustUnlockedAt: stardustEarned ? Date.now() : null,
      lastResetDate: missedDay ? today : null,
    };
    await db.missionStreaks.add(streak);
  } else {
    const wasReset = missedDay && streak.currentStreak !== 0;
    streak.currentStreak = currentStreak;
    streak.longestStreak = Math.max(streak.longestStreak, longestStreak);
    streak.lastCompletedDate = lastCompleted;

    // Stardust depends on the live streak. A reset invalidates an existing
    // unlock so the UI never shows stardust while the streak is broken.
    if (stardustEarned) {
      if (!streak.stardustUnlocked) {
        streak.stardustUnlocked = true;
        streak.stardustUnlockedAt = Date.now();
      }
    } else {
      streak.stardustUnlocked = false;
      streak.stardustUnlockedAt = null;
    }

    if (wasReset) {
      streak.lastResetDate = today;
    }
    await db.missionStreaks.update(streak.id, streak);
  }

  return streak;
}

export interface StardustPrecomputeRequest {
  kind: string;
  stardustUnlocked: boolean;
  seed?: number;
  particleCount?: number;
  bounds?: { x: number; y: number; z: number };
}

export interface StardustParticle {
  x: number;
  y: number;
  z: number;
  size: number;
  hue: number;
  twinkle: number;
}

/**
 * Precompute stardust halo particles on the heavy-task worker. Returns
 * `{ enabled: false, particles: [] }` when the reward is locked — the scene
 * can safely call this unconditionally.
 */
export async function precomputeStardust(
  req: StardustPrecomputeRequest,
): Promise<{ enabled: boolean; particles: StardustParticle[]; count: number; kind: string }> {
  const { runJob } = await import('./queue-runner.service');
  const { result } = await runJob<{ enabled: boolean; particles: StardustParticle[]; count: number; kind: string }>(
    'effect_precompute',
    {
      kind: req.kind,
      stardustUnlocked: req.stardustUnlocked,
      seed: req.seed ?? 42,
      particleCount: req.particleCount ?? 600,
      bounds: req.bounds ?? { x: 30, y: 18, z: 30 },
    },
  );
  return result;
}

export { DAILY_GOAL, STARDUST_STREAK_THRESHOLD };
