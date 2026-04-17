import { describe, it, expect } from 'vitest';
import {
  dateToEpochDay,
  getLocalDateString,
  computeOrbitalDistance,
  getTodayLocalDate,
  isYesterday,
} from '$lib/utils/date';

describe('dateToEpochDay', () => {
  it('returns increasing values for later dates', () => {
    const a = dateToEpochDay('2024-01-01');
    const b = dateToEpochDay('2024-01-02');
    expect(b - a).toBe(1);
  });
});

describe('getLocalDateString', () => {
  it('formats the current date as YYYY-MM-DD when no timestamp is given', () => {
    const s = getLocalDateString();
    expect(s).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('formats a specific timestamp', () => {
    const ts = new Date(2024, 0, 1).getTime();
    expect(getLocalDateString(ts)).toBe('2024-01-01');
  });

  it('zero-pads single-digit month and day', () => {
    const ts = new Date(2024, 2, 5).getTime();
    expect(getLocalDateString(ts)).toBe('2024-03-05');
  });
});

describe('computeOrbitalDistance', () => {
  it('returns baseRadius + maxOrbitalRadius/2 when min === max', () => {
    expect(computeOrbitalDistance('2024-01-01', '2024-01-01', '2024-01-01', 2, 10)).toBe(7);
  });

  it('places earliest date at baseRadius', () => {
    expect(computeOrbitalDistance('2024-01-01', '2024-01-01', '2024-01-31', 2, 10)).toBeCloseTo(2);
  });

  it('places latest date at baseRadius + maxOrbitalRadius', () => {
    expect(computeOrbitalDistance('2024-01-31', '2024-01-01', '2024-01-31', 2, 10)).toBeCloseTo(12);
  });

  it('places mid-range date at baseRadius + maxOrbitalRadius/2', () => {
    const r = computeOrbitalDistance('2024-01-16', '2024-01-01', '2024-01-31', 2, 10);
    expect(r).toBeCloseTo(7, 0);
  });

  it('uses the documented default radii when omitted', () => {
    const r = computeOrbitalDistance('2024-01-15', '2024-01-01', '2024-01-31');
    expect(r).toBeGreaterThan(2);
    expect(r).toBeLessThan(12);
  });
});

describe('getTodayLocalDate', () => {
  it('matches getLocalDateString() with no argument', () => {
    expect(getTodayLocalDate()).toBe(getLocalDateString());
  });
});

describe('isYesterday', () => {
  it('returns true when date is exactly one day before today', () => {
    expect(isYesterday('2024-06-14', '2024-06-15')).toBe(true);
  });

  it('returns false when date is two days before today', () => {
    expect(isYesterday('2024-06-13', '2024-06-15')).toBe(false);
  });

  it('returns false when date equals today', () => {
    expect(isYesterday('2024-06-15', '2024-06-15')).toBe(false);
  });

  it('returns false when date is in the future', () => {
    expect(isYesterday('2024-06-16', '2024-06-15')).toBe(false);
  });
});
