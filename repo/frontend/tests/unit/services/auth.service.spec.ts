import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, destroyTestDb } from '../../helpers/db-factory';
import { type NebulaDB, setDbFactory } from '$lib/db/connection';
import { registerProfile, loginProfile, getCooldownRemainingMs } from '$lib/services/auth.service';

let testDb: NebulaDB;

beforeEach(() => {
  testDb = createTestDb();
  setDbFactory(() => testDb);
});

afterEach(async () => {
  setDbFactory(null);
  await destroyTestDb(testDb);
});

describe('auth.service', () => {
  describe('registerProfile', () => {
    it('creates a profile with valid credentials', async () => {
      const result = await registerProfile('alice', 'password1');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.username).toBe('alice');
        expect(result.data.passwordHash).toBeTruthy();
        expect(result.data.passwordSalt).toBeTruthy();
        expect(result.data.failedAttemptCount).toBe(0);
      }
    });

    it('rejects invalid username', async () => {
      const result = await registerProfile('', 'password1');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('VALIDATION');
      }
    });

    it('rejects invalid password (no digit)', async () => {
      const result = await registerProfile('bob', 'password');
      expect(result.ok).toBe(false);
    });

    it('rejects invalid password (too short)', async () => {
      const result = await registerProfile('bob', 'pass1');
      expect(result.ok).toBe(false);
    });

    it('rejects duplicate username', async () => {
      await registerProfile('alice', 'password1');
      const result = await registerProfile('alice', 'other1234');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('DUPLICATE');
      }
    });

    it('stores password as hash, not plaintext', async () => {
      const result = await registerProfile('alice', 'mySecret1');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.passwordHash).not.toBe('mySecret1');
        expect(result.data.passwordHash).not.toContain('mySecret1');
      }
    });
  });

  describe('loginProfile', () => {
    it('succeeds with correct credentials', async () => {
      await registerProfile('alice', 'password1');
      const result = await loginProfile('alice', 'password1');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.username).toBe('alice');
        expect(result.data.lastSuccessfulEntryAt).toBeGreaterThan(0);
      }
    });

    it('fails with wrong password', async () => {
      await registerProfile('alice', 'password1');
      const result = await loginProfile('alice', 'wrongpass1');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('AUTH_FAILED');
      }
    });

    it('fails with non-existent username', async () => {
      const result = await loginProfile('nobody', 'password1');
      expect(result.ok).toBe(false);
    });

    it('resets failed attempt count on successful login', async () => {
      await registerProfile('alice', 'password1');
      await loginProfile('alice', 'wrong1234');
      await loginProfile('alice', 'wrong1234');
      const result = await loginProfile('alice', 'password1');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.failedAttemptCount).toBe(0);
      }
    });

    it('triggers cooldown after 5 failed attempts', async () => {
      await registerProfile('alice', 'password1');
      for (let i = 0; i < 5; i++) {
        await loginProfile('alice', 'wrong1234');
      }
      const result = await loginProfile('alice', 'password1');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('COOLDOWN');
      }
    });

    it('increases cooldown on additional failed attempts', async () => {
      await registerProfile('alice', 'password1');
      for (let i = 0; i < 5; i++) {
        await loginProfile('alice', 'wrong1234');
      }

      const profile = await testDb.profiles.where('username').equals('alice').first();
      expect(profile!.cooldownUntil).toBeTruthy();
      expect(profile!.cooldownUntil! - Date.now()).toBeLessThanOrEqual(60000);
      expect(profile!.cooldownUntil! - Date.now()).toBeGreaterThan(0);
    });
  });

  describe('getCooldownRemainingMs', () => {
    it('returns 0 when no cooldown', async () => {
      const result = await registerProfile('alice', 'password1');
      if (result.ok) {
        expect(getCooldownRemainingMs(result.data)).toBe(0);
      }
    });
  });
});
