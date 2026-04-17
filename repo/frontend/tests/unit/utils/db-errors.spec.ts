import { describe, it, expect } from 'vitest';
import { isDatabaseClosedError, swallowDbClosed } from '$lib/utils/db-errors';

describe('isDatabaseClosedError', () => {
  it('matches errors whose name is DatabaseClosedError', () => {
    expect(isDatabaseClosedError({ name: 'DatabaseClosedError' })).toBe(true);
  });

  it('returns false for any other error name', () => {
    expect(isDatabaseClosedError({ name: 'OpenFailedError' })).toBe(false);
    expect(isDatabaseClosedError(new Error('boom'))).toBe(false);
  });

  it('returns false for nullish and non-object inputs', () => {
    expect(isDatabaseClosedError(null)).toBe(false);
    expect(isDatabaseClosedError(undefined)).toBe(false);
    expect(isDatabaseClosedError('string')).toBe(false);
  });
});

describe('swallowDbClosed', () => {
  it('returns without throwing when err is DatabaseClosedError', () => {
    expect(() => swallowDbClosed({ name: 'DatabaseClosedError' })).not.toThrow();
  });

  it('rethrows any other error', () => {
    const err = new Error('boom');
    expect(() => swallowDbClosed(err)).toThrow(err);
  });
});
