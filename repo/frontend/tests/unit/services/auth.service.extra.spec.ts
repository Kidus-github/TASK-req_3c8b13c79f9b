import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, destroyTestDb } from '../../helpers/db-factory';
import { type NebulaDB, setDbFactory } from '$lib/db/connection';
import {
  registerProfile,
  getProfile,
  getProfileByUsername,
  hasAnyProfile,
  getCooldownRemainingMs,
} from '$lib/services/auth.service';

let testDb: NebulaDB;

beforeEach(() => {
  testDb = createTestDb();
  setDbFactory(() => testDb);
});

afterEach(async () => {
  setDbFactory(null);
  await destroyTestDb(testDb);
});

describe('auth.service extra read helpers', () => {
  it('getProfile returns NOT_FOUND for an unknown id', async () => {
    const result = await getProfile('missing-profile');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
  });

  it('getProfile returns a stored profile by id', async () => {
    const created = await registerProfile('alice', 'password1');
    if (!created.ok) throw new Error('seed failed');
    const found = await getProfile(created.data.id);
    expect(found.ok).toBe(true);
    if (found.ok) expect(found.data.username).toBe('alice');
  });

  it('getProfileByUsername trims surrounding whitespace', async () => {
    const created = await registerProfile('trim-user', 'password1');
    if (!created.ok) throw new Error('seed failed');
    const found = await getProfileByUsername('  trim-user  ');
    expect(found?.id).toBe(created.data.id);
  });

  it('hasAnyProfile reflects an empty and then populated database', async () => {
    expect(await hasAnyProfile()).toBe(false);
    await registerProfile('present', 'password1');
    expect(await hasAnyProfile()).toBe(true);
  });

  it('getCooldownRemainingMs clamps expired cooldowns to zero', async () => {
    const created = await registerProfile('expired', 'password1');
    if (!created.ok) throw new Error('seed failed');
    expect(getCooldownRemainingMs({ ...created.data, cooldownUntil: Date.now() - 1000 })).toBe(0);
  });
});
