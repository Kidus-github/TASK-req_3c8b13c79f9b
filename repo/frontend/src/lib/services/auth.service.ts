import { getDb } from '$lib/db/connection';
import type { ProfileCredential } from '$lib/types/profile';
import { type AppResult, ok, err, ErrorCode } from '$lib/types/result';
import { generateSalt, hashPassword, verifyPassword } from '$lib/utils/crypto';
import { generateId } from '$lib/utils/id';
import { validateUsername, validatePassword } from '$lib/utils/validation';
import { logAuditEvent } from './audit.service';
import { config } from '$lib/config';
import { logger } from '$lib/logging';

const MAX_FAILED_ATTEMPTS = config.maxFailedLoginAttempts;
const BASE_COOLDOWN_MS = config.baseCooldownMs;
const COOLDOWN_INCREMENT_MS = config.cooldownIncrementMs;
const MAX_COOLDOWN_MS = config.maxCooldownMs;

export async function registerProfile(
  username: string,
  password: string
): Promise<AppResult<ProfileCredential>> {
  logger.info('auth', 'register', 'Registration attempt', { username });
  const usernameError = validateUsername(username);
  if (usernameError) {
    logger.warn('auth', 'register', 'Validation failed', { username, reason: usernameError });
    return err(ErrorCode.VALIDATION, usernameError);
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    return err(ErrorCode.VALIDATION, passwordError);
  }

  const db = getDb();
  const trimmedUsername = username.trim();

  const existing = await db.profiles.where('username').equals(trimmedUsername).first();
  if (existing) {
    return err(ErrorCode.DUPLICATE, 'A profile with this username already exists on this device');
  }

  const salt = await generateSalt();
  const hash = await hashPassword(password, salt);

  const profile: ProfileCredential = {
    id: generateId(),
    username: trimmedUsername,
    passwordHash: hash,
    passwordSalt: salt,
    failedAttemptCount: 0,
    cooldownUntil: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastSuccessfulEntryAt: null,
  };

  await db.profiles.add(profile);
  await logAuditEvent('auth_register', profile.id, { username: trimmedUsername });

  return ok(profile);
}

export async function loginProfile(
  username: string,
  password: string
): Promise<AppResult<ProfileCredential>> {
  logger.info('auth', 'login', 'Login attempt', { username });
  const db = getDb();
  const trimmedUsername = username.trim();

  const profile = await db.profiles.where('username').equals(trimmedUsername).first();
  if (!profile) {
    return err(ErrorCode.AUTH_FAILED, 'Invalid username or password');
  }

  if (profile.cooldownUntil && Date.now() < profile.cooldownUntil) {
    const remainingMs = profile.cooldownUntil - Date.now();
    await logAuditEvent('auth_login_failed', profile.id, { reason: 'cooldown_active', remainingMs });
    return err(ErrorCode.COOLDOWN, `Too many failed attempts. Please wait ${Math.ceil(remainingMs / 1000)} seconds.`, {
      cooldownRemainingMs: remainingMs,
    });
  }

  const isValid = await verifyPassword(password, profile.passwordSalt, profile.passwordHash);

  if (!isValid) {
    const newFailedCount = profile.failedAttemptCount + 1;
    const updates: Partial<ProfileCredential> = {
      failedAttemptCount: newFailedCount,
      updatedAt: Date.now(),
    };

    if (newFailedCount >= MAX_FAILED_ATTEMPTS) {
      const cooldownMs = computeCooldown(newFailedCount);
      updates.cooldownUntil = Date.now() + cooldownMs;
      await logAuditEvent('auth_cooldown_start', profile.id, {
        failedAttempts: newFailedCount,
        cooldownMs,
      });
    }

    await db.profiles.update(profile.id, updates);
    await logAuditEvent('auth_login_failed', profile.id, { failedAttempts: newFailedCount });

    if (newFailedCount >= MAX_FAILED_ATTEMPTS) {
      const cooldownMs = computeCooldown(newFailedCount);
      return err(ErrorCode.COOLDOWN, `Too many failed attempts. Please wait ${Math.ceil(cooldownMs / 1000)} seconds.`, {
        cooldownRemainingMs: cooldownMs,
      });
    }

    return err(ErrorCode.AUTH_FAILED, 'Invalid username or password');
  }

  await db.profiles.update(profile.id, {
    failedAttemptCount: 0,
    cooldownUntil: null,
    lastSuccessfulEntryAt: Date.now(),
    updatedAt: Date.now(),
  });

  await logAuditEvent('auth_login_success', profile.id);

  const updated = await db.profiles.get(profile.id);
  return ok(updated!);
}

function computeCooldown(failedAttempts: number): number {
  const excessAttempts = failedAttempts - MAX_FAILED_ATTEMPTS;
  const cooldown = BASE_COOLDOWN_MS + excessAttempts * COOLDOWN_INCREMENT_MS;
  return Math.min(cooldown, MAX_COOLDOWN_MS);
}

export async function getProfile(profileId: string): Promise<AppResult<ProfileCredential>> {
  const db = getDb();
  const profile = await db.profiles.get(profileId);
  if (!profile) {
    return err(ErrorCode.NOT_FOUND, 'Profile not found');
  }
  return ok(profile);
}

export async function getProfileByUsername(username: string): Promise<ProfileCredential | null> {
  const db = getDb();
  return (await db.profiles.where('username').equals(username.trim()).first()) ?? null;
}

export async function hasAnyProfile(): Promise<boolean> {
  const db = getDb();
  return (await db.profiles.count()) > 0;
}

export function getCooldownRemainingMs(profile: ProfileCredential): number {
  if (!profile.cooldownUntil) return 0;
  const remaining = profile.cooldownUntil - Date.now();
  return Math.max(0, remaining);
}
