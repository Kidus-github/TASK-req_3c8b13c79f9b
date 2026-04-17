import { describe, it, expect, beforeEach, vi } from 'vitest';
import { logger } from '$lib/logging';

beforeEach(() => {
  logger.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('logger', () => {
  it('records info entries silently and exposes them via getEntries', () => {
    logger.info('mod', 'act', 'hello', { foo: 'bar' });
    const all = logger.getEntries();
    expect(all).toHaveLength(1);
    expect(all[0].level).toBe('info');
    expect(all[0].module).toBe('mod');
    expect(all[0].message).toBe('hello');
  });

  it('routes warn to console.warn and error to console.error', () => {
    logger.warn('mod', 'act', 'caution');
    logger.error('mod', 'act', 'boom');
    expect(console.warn).toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it('debug entries are kept in the buffer but not emitted to console', () => {
    logger.debug('mod', 'act', 'noisy');
    const debugs = logger.getEntries('debug');
    expect(debugs).toHaveLength(1);
  });

  it('redacts sensitive keys in details', () => {
    logger.info('auth', 'login', 'attempt', {
      username: 'demo',
      password: 'secret123',
      token: 'abcdef',
      nested: { passphrase: 'topsecret', other: 'safe' },
    });
    const [entry] = logger.getEntries();
    expect(entry.details?.username).toBe('demo');
    expect(entry.details?.password).toBe('[REDACTED]');
    expect(entry.details?.token).toBe('[REDACTED]');
    const nested = entry.details?.nested as Record<string, unknown>;
    expect(nested.passphrase).toBe('[REDACTED]');
    expect(nested.other).toBe('safe');
  });

  it('getEntries(level) filters by level', () => {
    logger.info('m', 'a', '1');
    logger.warn('m', 'a', '2');
    logger.error('m', 'a', '3');
    expect(logger.getEntries('warn').map((e) => e.message)).toEqual(['2']);
  });

  it('exportLogs returns one line per entry with timestamp + level prefix', () => {
    logger.info('m', 'a', 'one');
    logger.warn('m', 'b', 'two');
    const text = logger.exportLogs();
    const lines = text.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/\[INFO\]/);
    expect(lines[1]).toMatch(/\[WARN\]/);
  });

  it('clear empties the buffer', () => {
    logger.info('m', 'a', 'x');
    expect(logger.getEntries().length).toBe(1);
    logger.clear();
    expect(logger.getEntries().length).toBe(0);
  });

  it('drops oldest entries past the 1000-entry cap', () => {
    for (let i = 0; i < 1005; i++) logger.info('m', 'a', `msg-${i}`);
    const all = logger.getEntries();
    expect(all.length).toBe(1000);
    expect(all[0].message).toBe('msg-5');
    expect(all[999].message).toBe('msg-1004');
  });

  it('details argument is optional', () => {
    logger.info('m', 'a', 'no details');
    const [entry] = logger.getEntries();
    expect(entry.details).toBeUndefined();
  });
});
