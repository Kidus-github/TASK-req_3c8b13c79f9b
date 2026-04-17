/**
 * Extra coverage for config helpers + Proxy plumbing not exercised by the
 * baseline config.spec.ts.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  config,
  buildConfig,
  __setConfigForTests,
  __snapshotConfigForTests,
  __restoreConfigForTests,
  parseString,
  parseEnum,
} from '$lib/config';

afterEach(() => {
  __setConfigForTests({});
});

describe('config Proxy + test helpers', () => {
  it('writes to config update the active config seen by every reader', () => {
    config.maxImportRows = 12345;
    expect(config.maxImportRows).toBe(12345);
  });

  it('__setConfigForTests rebuilds with the supplied env map', () => {
    __setConfigForTests({ VITE_DAILY_VIEW_GOAL: '17' });
    expect(config.dailyViewGoal).toBe(17);
    __setConfigForTests({});
    expect(config.dailyViewGoal).toBe(10);
  });

  it('snapshot + restore preserves and rolls back overrides', () => {
    const snap = __snapshotConfigForTests();
    config.maxImportRows = 9999;
    expect(config.maxImportRows).toBe(9999);
    __restoreConfigForTests(snap);
    expect(config.maxImportRows).toBe(snap.maxImportRows);
  });

  it('the Proxy reflects ownKeys + has + getOwnPropertyDescriptor', () => {
    expect('maxImportRows' in config).toBe(true);
    const keys = Object.keys(config);
    expect(keys).toContain('maxImportRows');
    expect(keys).toContain('enableTLS');
    const desc = Object.getOwnPropertyDescriptor(config, 'enableTLS');
    expect(desc).toBeDefined();
  });
});

describe('config primitives — extra', () => {
  it('parseString trims and falls back when blank', () => {
    expect(parseString('K', '   ', 'fallback')).toBe('fallback');
    expect(parseString('K', '  hello  ', 'fallback')).toBe('hello');
  });

  it('parseEnum throws for unknown values', () => {
    expect(() => parseEnum('K', 'rainbow', ['red', 'blue'] as const, 'red')).toThrow();
  });

  it('buildConfig accepts every documented worker-health env var', () => {
    const cfg = buildConfig({
      VITE_WORKER_QUEUE_LENGTH_THRESHOLD: '50',
      VITE_WORKER_FAILURE_RATE_THRESHOLD: '0.4',
      VITE_WORKER_REPEATED_FAILURE_THRESHOLD: '7',
      VITE_WORKER_THROUGHPUT_DEGRADATION_RATIO: '0.6',
      VITE_WORKER_ALERT_COOLDOWN_MS: '120000',
      VITE_WORKER_POLL_INTERVAL_MS: '2500',
    });
    expect(cfg.workerHealth.queueLengthThreshold).toBe(50);
    expect(cfg.workerHealth.failureRateThreshold).toBeCloseTo(0.4);
    expect(cfg.workerHealth.repeatedFailureThreshold).toBe(7);
    expect(cfg.workerHealth.throughputDegradationRatio).toBeCloseTo(0.6);
    expect(cfg.workerHealth.alertCooldownMs).toBe(120000);
    expect(cfg.workerHealth.pollIntervalMs).toBe(2500);
  });
});
