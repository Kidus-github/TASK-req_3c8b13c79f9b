<script lang="ts">
  import { currentStreak, todayViewCount, todayCompleted, stardustUnlocked } from '$lib/stores/voyage.store';
  import { DAILY_GOAL, STARDUST_STREAK_THRESHOLD } from '$lib/services/voyage.service';

  $: progressPercent = Math.min(100, ($todayViewCount / DAILY_GOAL) * 100);
</script>

<div class="space-y-4">
  <div class="text-center">
    <div class="relative w-24 h-24 mx-auto">
      <svg class="w-24 h-24 transform -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" stroke-width="6" class="text-surface-700" />
        <circle
          cx="50" cy="50" r="45" fill="none"
          stroke={$todayCompleted ? '#22c55e' : '#3b82f6'}
          stroke-width="6"
          stroke-dasharray={`${progressPercent * 2.83} ${283 - progressPercent * 2.83}`}
          stroke-linecap="round"
        />
      </svg>
      <div class="absolute inset-0 flex items-center justify-center">
        <span class="text-lg font-bold text-surface-100">{$todayViewCount}/{DAILY_GOAL}</span>
      </div>
    </div>
    <p class="text-sm text-surface-400 mt-2">
      {$todayCompleted ? 'Day completed!' : 'View distinct cards to complete today'}
    </p>
  </div>

  <div class="grid grid-cols-3 gap-3 text-center">
    <div class="p-3 rounded-lg bg-surface-800 border border-surface-700">
      <p class="text-2xl font-bold text-surface-100">{$currentStreak.currentStreak}</p>
      <p class="text-xs text-surface-400">Current</p>
    </div>
    <div class="p-3 rounded-lg bg-surface-800 border border-surface-700">
      <p class="text-2xl font-bold text-surface-100">{$currentStreak.longestStreak}</p>
      <p class="text-xs text-surface-400">Longest</p>
    </div>
    <div class="p-3 rounded-lg bg-surface-800 border border-surface-700">
      <p class="text-2xl font-bold {$stardustUnlocked ? 'text-yellow-300' : 'text-surface-500'}">
        {$stardustUnlocked ? 'Yes' : `${STARDUST_STREAK_THRESHOLD}d`}
      </p>
      <p class="text-xs text-surface-400">Stardust</p>
    </div>
  </div>

  {#if $stardustUnlocked}
    <div class="text-center p-3 rounded-lg bg-yellow-900/20 border border-yellow-800/50">
      <p class="text-sm text-yellow-300 font-medium">Stardust Unlocked!</p>
      <p class="text-xs text-yellow-400/70 mt-1">
        Unlocked on {$currentStreak.stardustUnlockedAt ? new Date($currentStreak.stardustUnlockedAt).toLocaleDateString() : 'unknown'}
      </p>
    </div>
  {/if}
</div>
