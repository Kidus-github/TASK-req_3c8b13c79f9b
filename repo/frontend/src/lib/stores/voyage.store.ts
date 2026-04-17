import { writable, derived, get } from 'svelte/store';
import type { MissionStreak, MissionDayActivity } from '$lib/types/voyage';
import * as voyageService from '$lib/services/voyage.service';
import { currentProfileId } from './auth.store';
import { swallowDbClosed } from '$lib/utils/db-errors';

const streak = writable<MissionStreak>({
  id: '',
  profileId: '',
  currentStreak: 0,
  longestStreak: 0,
  lastCompletedDate: null,
  stardustUnlocked: false,
  stardustUnlockedAt: null,
  lastResetDate: null,
});

const todayActivity = writable<MissionDayActivity | null>(null);

export async function loadVoyageData() {
  const profileId = get(currentProfileId);
  if (!profileId) return;

  try {
    // Recalculate against today's date so a missed day resets the live streak
    // and stardust state before the UI ever sees stale persisted values.
    const s = await voyageService.recalculateStreak(profileId);
    streak.set(s);

    const activity = await voyageService.getTodayActivity(profileId);
    todayActivity.set(activity);
  } catch (err) {
    // App.svelte fires this as `void loadVoyageData()` on unlock. A closed DB
    // here is a shutdown/teardown race — nothing to load, nothing to surface.
    swallowDbClosed(err);
  }
}

export async function recordCardView(cardId: string) {
  const profileId = get(currentProfileId);
  if (!profileId) return;

  const activity = await voyageService.logCardView(profileId, cardId);
  todayActivity.set(activity);

  const s = await voyageService.recalculateStreak(profileId);
  streak.set(s);
}

export const currentStreak = { subscribe: streak.subscribe };
export const todayProgress = { subscribe: todayActivity.subscribe };

export const todayViewCount = derived(todayActivity, $a => $a?.distinctViewCount ?? 0);
export const todayCompleted = derived(todayActivity, $a => $a?.completed ?? false);
export const stardustUnlocked = derived(streak, $s => $s.stardustUnlocked);
