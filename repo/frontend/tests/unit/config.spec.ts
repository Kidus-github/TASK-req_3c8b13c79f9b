import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildConfig, ConfigValidationError, parseBoolean, parseNumber, parseEnum } from '$lib/config';

const here = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(here, '../..');
const repoRoot = path.resolve(frontendRoot, '..');

describe('config module', () => {
  it('uses VITE_* env values when provided', () => {
    const cfg = buildConfig({
      VITE_MAX_IMPORT_ROWS: '42',
      VITE_DAILY_VIEW_GOAL: '7',
      VITE_STARDUST_STREAK_DAYS: '3',
      VITE_ENABLE_TLS: 'true',
      VITE_APP_TITLE: 'Custom Forge',
    });
    expect(cfg.maxImportRows).toBe(42);
    expect(cfg.dailyViewGoal).toBe(7);
    expect(cfg.stardustStreakDays).toBe(3);
    expect(cfg.enableTLS).toBe(true);
    expect(cfg.appTitle).toBe('Custom Forge');
  });

  it('falls back to defaults when env is missing or empty', () => {
    const cfg = buildConfig({
      VITE_MAX_IMPORT_ROWS: undefined,
      VITE_APP_TITLE: '',
    });
    expect(cfg.maxImportRows).toBe(1000);
    expect(cfg.appTitle).toBe('NebulaForge Creator Nebula');
  });

  it('defaults ENABLE_TLS to false', () => {
    const cfg = buildConfig({});
    expect(cfg.enableTLS).toBe(false);
  });

  it('returns a frozen object', () => {
    const cfg = buildConfig({});
    expect(Object.isFrozen(cfg)).toBe(true);
  });

  it('rejects non-numeric numeric env as ConfigValidationError', () => {
    expect(() => buildConfig({ VITE_DAILY_VIEW_GOAL: 'not-a-number' })).toThrow(ConfigValidationError);
  });

  it('rejects non-boolean boolean env as ConfigValidationError', () => {
    expect(() => buildConfig({ VITE_ENABLE_TLS: 'maybe' })).toThrow(ConfigValidationError);
  });

  it('rejects out-of-range numeric env', () => {
    expect(() => buildConfig({ VITE_CANARY_FAILURE_THRESHOLD: '2' })).toThrow(ConfigValidationError);
  });

  it('rejects unknown enum values', () => {
    expect(() => buildConfig({ VITE_DEFAULT_THEME: 'rainbow' })).toThrow(ConfigValidationError);
  });
});

describe('config parser primitives', () => {
  it('parseBoolean accepts 1/0/yes/no/on/off case-insensitively', () => {
    expect(parseBoolean('k', 'YES', false)).toBe(true);
    expect(parseBoolean('k', 'NO', true)).toBe(false);
    expect(parseBoolean('k', 'On', false)).toBe(true);
    expect(parseBoolean('k', 'off', true)).toBe(false);
    expect(parseBoolean('k', '1', false)).toBe(true);
    expect(parseBoolean('k', '0', true)).toBe(false);
  });

  it('parseNumber enforces integer flag', () => {
    expect(() => parseNumber('k', '3.5', 0, { integer: true })).toThrow(ConfigValidationError);
  });

  it('parseEnum returns fallback when unset', () => {
    expect(parseEnum('k', undefined, ['a', 'b'] as const, 'a')).toBe('a');
  });
});

describe('config wiring with docker-compose + README', () => {
  function readFile(rel: string, root = repoRoot): string {
    return readFileSync(path.join(root, rel), 'utf8');
  }

  it('docker-compose env keys are all VITE_-prefixed (except runtime NODE_ENV/FRONTEND_PORT)', () => {
    const compose = readFile('docker-compose.yml');
    const envBlock = compose
      .split('\n')
      .filter(line => /^\s*-\s+[A-Z_]+=/.test(line))
      .map(line => line.trim().replace(/^- /, ''));

    expect(envBlock.length).toBeGreaterThan(5);
    for (const entry of envBlock) {
      const key = entry.split('=')[0];
      if (key === 'NODE_ENV' || key === 'FRONTEND_PORT') continue;
      expect(key.startsWith('VITE_')).toBe(true);
    }
  });

  it('README documents every VITE_* key used in docker-compose', () => {
    const compose = readFile('docker-compose.yml');
    const readme = readFile('README.md');

    const composeKeys = [...compose.matchAll(/\b(VITE_[A-Z_]+)\b/g)].map(m => m[1]);
    const unique = [...new Set(composeKeys)];
    for (const key of unique) {
      expect(readme, `README should mention ${key}`).toContain(key);
    }
  });

  it('README uses the exact "docker-compose up --build" command (hyphen variant)', () => {
    const readme = readFile('README.md');
    expect(readme).toContain('docker-compose up --build');
  });

  it('README declares both guest and user roles with credentials', () => {
    const readme = readFile('README.md');
    expect(readme).toMatch(/\|\s*`?guest`?\s*\|/);
    expect(readme).toMatch(/\|\s*`?user`?\s*\|/);
    // password field must be present for guest row too (even if N/A).
    expect(readme).toMatch(/guest.*N\/A/);
  });
});

describe('config wiring with docker-compose + README', () => {
  function readFile(rel: string, root = repoRoot): string {
    return readFileSync(path.join(root, rel), 'utf8');
  }

  it('docker-compose env keys are all VITE_-prefixed (except runtime NODE_ENV)', () => {
    const compose = readFile('docker-compose.yml');
    const envBlock = compose
      .split('\n')
      .filter(line => /^\s*-\s+[A-Z_]+=/.test(line))
      .map(line => line.trim().replace(/^- /, ''));

    expect(envBlock.length).toBeGreaterThan(5);
    for (const entry of envBlock) {
      const key = entry.split('=')[0];
      if (key === 'NODE_ENV' || key === 'FRONTEND_PORT') continue;
      expect(key.startsWith('VITE_')).toBe(true);
    }
  });

  it('README documents the same VITE_* keys as docker-compose', () => {
    const compose = readFile('docker-compose.yml');
    const readme = readFile('README.md');

    const composeKeys = [...compose.matchAll(/\b(VITE_[A-Z_]+)\b/g)].map(m => m[1]);
    const unique = [...new Set(composeKeys)];
    for (const key of unique) {
      expect(readme).toContain(key);
    }
  });
});
