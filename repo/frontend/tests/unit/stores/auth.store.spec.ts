/**
 * auth store: register, login, cooldown timer, error state, logout.
 *
 * Real auth.service backed by fake-indexeddb.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { get } from 'svelte/store';

import { type NebulaDB, setDbFactory } from '$lib/db/connection';
import { createTestDb, destroyTestDb } from '../../helpers/db-factory';
import {
  register,
  login,
  logout,
  checkExistingProfile,
  currentProfile,
  currentProfileId,
  isUnlocked,
  entryStatus,
  cooldownRemaining,
  error,
  registering,
} from '$lib/stores/auth.store';

let testDb: NebulaDB;

beforeEach(() => {
  testDb = createTestDb();
  setDbFactory(() => testDb);
});

afterEach(async () => {
  logout();
  registering.set(false);
  await new Promise((r) => setTimeout(r, 20));
  setDbFactory(null);
  await destroyTestDb(testDb);
  vi.useRealTimers();
});

describe('auth store', () => {
  it('locked state on init: no profile, no current id', () => {
    expect(get(currentProfile)).toBeNull();
    expect(get(currentProfileId)).toBeNull();
    expect(get(isUnlocked)).toBe(false);
    expect(get(entryStatus)).toBe('locked');
  });

  it('register() unlocks the session and clears prior error', async () => {
    const ok = await register('demo', 'demopass1');
    expect(ok).toBe(true);
    expect(get(isUnlocked)).toBe(true);
    expect(get(currentProfile)?.username).toBe('demo');
    expect(get(error)).toBeNull();
  });

  it('register() with an invalid password sets the error and returns false', async () => {
    const ok = await register('demo', 'short');
    expect(ok).toBe(false);
    expect(get(isUnlocked)).toBe(false);
    expect(get(error)).toBeTruthy();
  });

  it('login() success unlocks the session', async () => {
    await register('demo', 'demopass1');
    logout();
    const ok = await login('demo', 'demopass1');
    expect(ok).toBe(true);
    expect(get(isUnlocked)).toBe(true);
  });

  it('login() with wrong password returns false and surfaces error', async () => {
    await register('demo', 'demopass1');
    logout();
    const ok = await login('demo', 'wrongpass1');
    expect(ok).toBe(false);
    expect(get(isUnlocked)).toBe(false);
    expect(get(error)).toBeTruthy();
  });

  it('login() with non-existent username returns false', async () => {
    const ok = await login('ghost', 'whatever1');
    expect(ok).toBe(false);
    expect(get(error)).toBeTruthy();
  });

  it('cooldown is reported via the cooldownRemaining store', async () => {
    await register('demo', 'demopass1');
    logout();
    for (let i = 0; i < 6; i++) await login('demo', 'wrongpass1');
    // The 6th attempt should trigger cooldown
    expect(get(cooldownRemaining)).toBeGreaterThan(0);
    expect(get(entryStatus)).toBe('cooldown');
  });

  it('logout clears the profile, status, and stops timers', async () => {
    await register('demo', 'demopass1');
    logout();
    expect(get(currentProfile)).toBeNull();
    expect(get(entryStatus)).toBe('locked');
    expect(get(error)).toBeNull();
  });

  it('checkExistingProfile reflects database state', async () => {
    expect(await checkExistingProfile()).toBe(false);
    await register('demo', 'demopass1');
    expect(await checkExistingProfile()).toBe(true);
  });

  it('registering store toggles via .set', () => {
    registering.set(true);
    expect(get(registering)).toBe(true);
    registering.set(false);
    expect(get(registering)).toBe(false);
  });
});
