import { describe, it, expect } from 'vitest';
import { MOOD_COLORS, moodToColor, moodToHSL, hexToRgb, tagToColor } from '$lib/utils/color';

describe('moodToColor', () => {
  it('returns the mood-specific color for valid moods', () => {
    for (const mood of [1, 2, 3, 4, 5]) {
      expect(moodToColor(mood)).toBe(MOOD_COLORS[mood]);
    }
  });

  it('falls back to mood 3 for an unknown mood', () => {
    expect(moodToColor(99)).toBe(MOOD_COLORS[3]);
    expect(moodToColor(0)).toBe(MOOD_COLORS[3]);
    expect(moodToColor(-1)).toBe(MOOD_COLORS[3]);
  });
});

describe('moodToHSL', () => {
  it('returns h/s/l for each known mood', () => {
    for (const mood of [1, 2, 3, 4, 5]) {
      const hsl = moodToHSL(mood);
      expect(hsl.h).toBeGreaterThanOrEqual(0);
      expect(hsl.h).toBeLessThan(360);
      expect(hsl.s).toBeGreaterThanOrEqual(0);
      expect(hsl.s).toBeLessThanOrEqual(100);
      expect(hsl.l).toBeGreaterThanOrEqual(0);
      expect(hsl.l).toBeLessThanOrEqual(100);
    }
  });

  it('falls back to mood 3 for unknown', () => {
    const fallback = moodToHSL(3);
    expect(moodToHSL(42)).toEqual(fallback);
  });
});

describe('hexToRgb', () => {
  it('parses a 6-digit hex with leading #', () => {
    const c = hexToRgb('#ff8000');
    expect(c.r).toBeCloseTo(1, 5);
    expect(c.g).toBeCloseTo(0x80 / 255, 5);
    expect(c.b).toBeCloseTo(0, 5);
  });

  it('parses a 6-digit hex without leading #', () => {
    const c = hexToRgb('00ff00');
    expect(c.r).toBe(0);
    expect(c.g).toBeCloseTo(1, 5);
    expect(c.b).toBe(0);
  });

  it('is case-insensitive', () => {
    expect(hexToRgb('#A1B2C3')).toEqual(hexToRgb('#a1b2c3'));
  });

  it('returns black for invalid input', () => {
    expect(hexToRgb('not-a-hex')).toEqual({ r: 0, g: 0, b: 0 });
    expect(hexToRgb('#abc')).toEqual({ r: 0, g: 0, b: 0 }); // 3-digit not supported
    expect(hexToRgb('')).toEqual({ r: 0, g: 0, b: 0 });
  });
});

describe('tagToColor', () => {
  it('returns a stable HSL string for the same tag', () => {
    const a = tagToColor('design');
    const b = tagToColor('design');
    expect(a).toBe(b);
    expect(a).toMatch(/^hsl\(\d+, 70%, 60%\)$/);
  });

  it('produces different colors for different tags', () => {
    const a = tagToColor('design');
    const b = tagToColor('coding');
    expect(a).not.toBe(b);
  });

  it('handles empty string without throwing', () => {
    expect(() => tagToColor('')).not.toThrow();
  });
});
