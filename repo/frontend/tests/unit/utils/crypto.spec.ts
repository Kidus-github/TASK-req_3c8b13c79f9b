import { describe, it, expect } from 'vitest';
import { generateSalt, hashPassword, verifyPassword } from '$lib/utils/crypto';

describe('crypto utils', () => {
  it('generateSalt produces 32-char hex string', async () => {
    const salt = await generateSalt();
    expect(salt).toHaveLength(32);
    expect(/^[0-9a-f]+$/.test(salt)).toBe(true);
  });

  it('generateSalt produces unique values', async () => {
    const s1 = await generateSalt();
    const s2 = await generateSalt();
    expect(s1).not.toBe(s2);
  });

  it('hashPassword produces consistent hash for same input', async () => {
    const salt = await generateSalt();
    const h1 = await hashPassword('password123', salt);
    const h2 = await hashPassword('password123', salt);
    expect(h1).toBe(h2);
  });

  it('hashPassword produces different hash for different password', async () => {
    const salt = await generateSalt();
    const h1 = await hashPassword('password123', salt);
    const h2 = await hashPassword('password456', salt);
    expect(h1).not.toBe(h2);
  });

  it('hashPassword produces different hash for different salt', async () => {
    const s1 = await generateSalt();
    const s2 = await generateSalt();
    const h1 = await hashPassword('password123', s1);
    const h2 = await hashPassword('password123', s2);
    expect(h1).not.toBe(h2);
  });

  it('verifyPassword returns true for correct password', async () => {
    const salt = await generateSalt();
    const hash = await hashPassword('mySecret1', salt);
    expect(await verifyPassword('mySecret1', salt, hash)).toBe(true);
  });

  it('verifyPassword returns false for wrong password', async () => {
    const salt = await generateSalt();
    const hash = await hashPassword('mySecret1', salt);
    expect(await verifyPassword('wrongPass1', salt, hash)).toBe(false);
  });
});
