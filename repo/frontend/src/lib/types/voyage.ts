export interface MissionDayActivity {
  id: string;
  profileId: string;
  dateLocal: string;
  distinctViewedCardIds: string[];
  distinctViewCount: number;
  completed: boolean;
  completionTimestamp: number | null;
}

export interface MissionStreak {
  id: string;
  profileId: string;
  currentStreak: number;
  longestStreak: number;
  lastCompletedDate: string | null;
  stardustUnlocked: boolean;
  stardustUnlockedAt: number | null;
  lastResetDate: string | null;
}

export interface ViewLog {
  id: string;
  profileId: string;
  cardId: string;
  viewedAt: number;
  dateLocal: string;
}
