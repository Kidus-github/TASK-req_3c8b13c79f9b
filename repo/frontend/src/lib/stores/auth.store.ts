import { writable, derived } from 'svelte/store';
import type { ProfileCredential, EntrySessionState } from '$lib/types/profile';
import * as authService from '$lib/services/auth.service';
import { swallowDbClosed } from '$lib/utils/db-errors';

const profileStore = writable<ProfileCredential | null>(null);
const sessionStatus = writable<'locked' | 'entering' | 'cooldown' | 'unlocked'>('locked');
const cooldownRemainingMs = writable(0);
const authError = writable<string | null>(null);
const isRegistering = writable(false);

let cooldownTimer: ReturnType<typeof setInterval> | null = null;

function startCooldownTimer(profile: ProfileCredential) {
  stopCooldownTimer();
  const updateRemaining = () => {
    const remaining = authService.getCooldownRemainingMs(profile);
    cooldownRemainingMs.set(remaining);
    if (remaining <= 0) {
      stopCooldownTimer();
      sessionStatus.set('locked');
    }
  };
  updateRemaining();
  cooldownTimer = setInterval(updateRemaining, 1000);
  sessionStatus.set('cooldown');
}

function stopCooldownTimer() {
  if (cooldownTimer) {
    clearInterval(cooldownTimer);
    cooldownTimer = null;
  }
}

export async function register(username: string, password: string): Promise<boolean> {
  authError.set(null);
  const result = await authService.registerProfile(username, password);
  if (result.ok) {
    profileStore.set(result.data);
    sessionStatus.set('unlocked');
    return true;
  }
  authError.set(result.error.message);
  return false;
}

export async function login(username: string, password: string): Promise<boolean> {
  authError.set(null);
  sessionStatus.set('entering');
  const result = await authService.loginProfile(username, password);
  if (result.ok) {
    profileStore.set(result.data);
    sessionStatus.set('unlocked');
    stopCooldownTimer();
    return true;
  }

  if (result.error.code === 'COOLDOWN') {
    const details = result.error.details as { cooldownRemainingMs: number } | undefined;
    if (details) {
      const profile = await authService.getProfileByUsername(username);
      if (profile) {
        startCooldownTimer(profile);
      }
    }
  } else {
    sessionStatus.set('locked');
  }

  authError.set(result.error.message);
  return false;
}

export function logout() {
  profileStore.set(null);
  sessionStatus.set('locked');
  stopCooldownTimer();
  authError.set(null);
}

export async function checkExistingProfile(): Promise<boolean> {
  try {
    return await authService.hasAnyProfile();
  } catch (err) {
    // LoginGate fires this from onMount; a closed DB here means shutdown or
    // test teardown, not a real failure. Treat as "no profile found".
    swallowDbClosed(err);
    return false;
  }
}

export const currentProfile = { subscribe: profileStore.subscribe };
export const entryStatus = { subscribe: sessionStatus.subscribe };
export const cooldownRemaining = { subscribe: cooldownRemainingMs.subscribe };
export const error = { subscribe: authError.subscribe };
export const registering = {
  subscribe: isRegistering.subscribe,
  set: isRegistering.set,
};

export const isUnlocked = derived(sessionStatus, $s => $s === 'unlocked');
export const currentProfileId = derived(profileStore, $p => $p?.id ?? null);
