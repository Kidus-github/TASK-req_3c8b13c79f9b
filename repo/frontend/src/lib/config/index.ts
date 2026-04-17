/**
 * Centralized Configuration Module
 *
 * Single source of truth for all application settings.
 *
 * Rules enforced by this module:
 *   1. Every value is read exactly once at module load from Vite's
 *      compile-time env (`import.meta.env`). Raw `process.env` access
 *      is forbidden in business logic — import `config` from here.
 *   2. Every value is validated with a type-specific parser that fails
 *      loudly on invalid input (`ConfigValidationError`). Silent
 *      fallbacks to arbitrary defaults are only used when the variable
 *      is UNSET or the empty string.
 *   3. The exported object is frozen and typed via `AppConfig`.
 */

export interface AppConfig {
  // Application metadata
  appTitle: string;
  appVersion: string;

  // Security toggles
  enableTLS: boolean;

  // Auth settings
  maxFailedLoginAttempts: number;
  baseCooldownMs: number;
  cooldownIncrementMs: number;
  maxCooldownMs: number;
  pbkdf2Iterations: number;
  passwordMinLength: number;
  passwordMaxLength: number;

  // Import settings
  maxImportRows: number;

  // Voyage Mission settings
  dailyViewGoal: number;
  stardustStreakDays: number;

  // Parser settings
  canaryFailureThreshold: number;
  canaryMinSampleSize: number;
  canaryMaxSampleSize: number;

  // Search settings
  searchDebounceMs: number;
  titleWeight: number;
  tagsWeight: number;
  bodyWeight: number;

  // UI defaults
  defaultTheme: 'dark' | 'light';
  defaultLightingPreset: string;
  defaultSort: string;

  // Storage keys
  preferencesStorageKey: string;
  dbName: string;

  workerHealth: {
    queueLengthThreshold: number;
    failureRateThreshold: number;
    repeatedFailureThreshold: number;
    throughputDegradationRatio: number;
    alertCooldownMs: number;
    pollIntervalMs: number;
  };
}

export class ConfigValidationError extends Error {
  constructor(public readonly key: string, public readonly value: unknown, message: string) {
    super(`[config] ${key}=${JSON.stringify(value)} is invalid: ${message}`);
    this.name = 'ConfigValidationError';
  }
}

function isUnset(value: string | undefined): boolean {
  return value === undefined || value === '';
}

export function parseBoolean(
  key: string,
  value: string | undefined,
  fallback: boolean
): boolean {
  if (isUnset(value)) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  throw new ConfigValidationError(key, value, 'expected a boolean (true/false/1/0)');
}

export function parseNumber(
  key: string,
  value: string | undefined,
  fallback: number,
  opts: { min?: number; max?: number; integer?: boolean } = {}
): number {
  if (isUnset(value)) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new ConfigValidationError(key, value, 'expected a finite number');
  }
  if (opts.integer && !Number.isInteger(parsed)) {
    throw new ConfigValidationError(key, value, 'expected an integer');
  }
  if (opts.min !== undefined && parsed < opts.min) {
    throw new ConfigValidationError(key, value, `must be >= ${opts.min}`);
  }
  if (opts.max !== undefined && parsed > opts.max) {
    throw new ConfigValidationError(key, value, `must be <= ${opts.max}`);
  }
  return parsed;
}

export function parseString(
  _key: string,
  value: string | undefined,
  fallback: string
): string {
  if (isUnset(value)) return fallback;
  const trimmed = String(value).trim();
  return trimmed === '' ? fallback : trimmed;
}

export function parseEnum<T extends string>(
  key: string,
  value: string | undefined,
  allowed: readonly T[],
  fallback: T
): T {
  if (isUnset(value)) return fallback;
  const trimmed = String(value).trim() as T;
  if (!allowed.includes(trimmed)) {
    throw new ConfigValidationError(
      key,
      value,
      `must be one of ${allowed.join(', ')}`
    );
  }
  return trimmed;
}

type EnvMap = Record<string, string | undefined>;

function readViteEnv(): EnvMap {
  // `import.meta.env` is injected at build time by Vite. We deliberately
  // do NOT read `process.env` here so the same module works in the
  // browser bundle.
  if (typeof import.meta !== 'undefined') {
    return ((import.meta as unknown as { env?: EnvMap }).env ?? {}) as EnvMap;
  }
  return {};
}

export function buildConfig(env: EnvMap = readViteEnv()): AppConfig {
  const cfg: AppConfig = {
    appTitle: parseString('VITE_APP_TITLE', env.VITE_APP_TITLE, 'NebulaForge Creator Nebula'),
    appVersion: parseString('VITE_APP_VERSION', env.VITE_APP_VERSION, '1.0.0'),

    // Default: TLS OFF. Operator enables it explicitly via VITE_ENABLE_TLS=true.
    enableTLS: parseBoolean('VITE_ENABLE_TLS', env.VITE_ENABLE_TLS, false),

    maxFailedLoginAttempts: parseNumber(
      'VITE_MAX_FAILED_LOGIN_ATTEMPTS',
      env.VITE_MAX_FAILED_LOGIN_ATTEMPTS,
      5,
      { min: 1, integer: true }
    ),
    baseCooldownMs: parseNumber('VITE_BASE_COOLDOWN_MS', env.VITE_BASE_COOLDOWN_MS, 60_000, { min: 0, integer: true }),
    cooldownIncrementMs: parseNumber('VITE_COOLDOWN_INCREMENT_MS', env.VITE_COOLDOWN_INCREMENT_MS, 30_000, { min: 0, integer: true }),
    maxCooldownMs: parseNumber('VITE_MAX_COOLDOWN_MS', env.VITE_MAX_COOLDOWN_MS, 300_000, { min: 0, integer: true }),
    pbkdf2Iterations: parseNumber('VITE_PBKDF2_ITERATIONS', env.VITE_PBKDF2_ITERATIONS, 100_000, { min: 1000, integer: true }),
    passwordMinLength: 8,
    passwordMaxLength: 20,

    maxImportRows: parseNumber('VITE_MAX_IMPORT_ROWS', env.VITE_MAX_IMPORT_ROWS, 1000, { min: 1, integer: true }),

    dailyViewGoal: parseNumber('VITE_DAILY_VIEW_GOAL', env.VITE_DAILY_VIEW_GOAL, 10, { min: 1, integer: true }),
    stardustStreakDays: parseNumber('VITE_STARDUST_STREAK_DAYS', env.VITE_STARDUST_STREAK_DAYS, 7, { min: 1, integer: true }),

    canaryFailureThreshold: parseNumber('VITE_CANARY_FAILURE_THRESHOLD', env.VITE_CANARY_FAILURE_THRESHOLD, 0.2, { min: 0, max: 1 }),
    canaryMinSampleSize: 5,
    canaryMaxSampleSize: 20,

    searchDebounceMs: 250,
    titleWeight: 3.0,
    tagsWeight: 2.0,
    bodyWeight: 1.0,

    defaultTheme: parseEnum('VITE_DEFAULT_THEME', env.VITE_DEFAULT_THEME, ['dark', 'light'] as const, 'dark'),
    defaultLightingPreset: parseString('VITE_DEFAULT_LIGHTING', env.VITE_DEFAULT_LIGHTING, 'nebula'),
    defaultSort: parseString('VITE_DEFAULT_SORT', env.VITE_DEFAULT_SORT, 'date_desc'),

    preferencesStorageKey: 'nebulaforge_preferences',
    dbName: 'nebulaforge',

    workerHealth: {
      queueLengthThreshold: parseNumber('VITE_WORKER_QUEUE_LENGTH_THRESHOLD', env.VITE_WORKER_QUEUE_LENGTH_THRESHOLD, 10, { min: 0, integer: true }),
      failureRateThreshold: parseNumber('VITE_WORKER_FAILURE_RATE_THRESHOLD', env.VITE_WORKER_FAILURE_RATE_THRESHOLD, 0.25, { min: 0, max: 1 }),
      repeatedFailureThreshold: parseNumber('VITE_WORKER_REPEATED_FAILURE_THRESHOLD', env.VITE_WORKER_REPEATED_FAILURE_THRESHOLD, 3, { min: 1, integer: true }),
      throughputDegradationRatio: parseNumber('VITE_WORKER_THROUGHPUT_DEGRADATION_RATIO', env.VITE_WORKER_THROUGHPUT_DEGRADATION_RATIO, 0.5, { min: 0, max: 1 }),
      alertCooldownMs: parseNumber('VITE_WORKER_ALERT_COOLDOWN_MS', env.VITE_WORKER_ALERT_COOLDOWN_MS, 60_000, { min: 0, integer: true }),
      pollIntervalMs: parseNumber('VITE_WORKER_POLL_INTERVAL_MS', env.VITE_WORKER_POLL_INTERVAL_MS, 5_000, { min: 100, integer: true }),
    },
  };
  return Object.freeze(cfg);
}

// Internal backing object — frozen, replaceable only via the test helper.
// Consumers never see this directly; they read through the `config` Proxy
// so a test override (per-test mutation of one field) takes effect even in
// modules that imported `config` before the override.
let _activeConfig: AppConfig = buildConfig();

export const config: AppConfig = new Proxy({} as AppConfig, {
  get(_target, key: string | symbol) {
    return (_activeConfig as Record<string | symbol, unknown>)[key];
  },
  set(_target, key: string | symbol, value: unknown) {
    // Test-only mutation — rebuild a fresh frozen object with the override.
    _activeConfig = Object.freeze({ ..._activeConfig, [key]: value }) as AppConfig;
    return true;
  },
  has(_target, key) {
    return key in _activeConfig;
  },
  ownKeys() {
    return Reflect.ownKeys(_activeConfig);
  },
  getOwnPropertyDescriptor(_target, key) {
    const descriptor = Object.getOwnPropertyDescriptor(_activeConfig, key);
    if (descriptor) descriptor.configurable = true;
    return descriptor;
  },
}) as AppConfig;

/** Test-only: rebuild config from a fresh env map (or empty for defaults). */
export function __setConfigForTests(env: EnvMap = {}): void {
  _activeConfig = buildConfig(env);
}

/** Test-only: snapshot then restore. */
export function __snapshotConfigForTests(): AppConfig {
  return _activeConfig;
}
export function __restoreConfigForTests(snapshot: AppConfig): void {
  _activeConfig = snapshot;
}
