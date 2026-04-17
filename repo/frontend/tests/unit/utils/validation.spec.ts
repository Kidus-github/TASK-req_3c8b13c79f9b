import { describe, it, expect } from 'vitest';
import {
  validateCardDraft,
  normalizeTags,
  isValidCalendarDate,
  validateUsername,
  validatePassword,
} from '$lib/utils/validation';
import type { CardDraft } from '$lib/types/card';

function validDraft(overrides: Partial<CardDraft> = {}): CardDraft {
  return {
    title: 'Test Title',
    body: 'Test body content',
    date: '2024-06-15',
    mood: 3,
    tags: ['design', 'color'],
    ...overrides,
  };
}

describe('validateCardDraft', () => {
  it('accepts a valid draft', () => {
    expect(validateCardDraft(validDraft())).toEqual([]);
  });

  it('rejects empty title', () => {
    const errors = validateCardDraft(validDraft({ title: '' }));
    expect(errors).toContainEqual({ field: 'title', message: 'Title is required' });
  });

  it('rejects title exceeding 30 chars', () => {
    const errors = validateCardDraft(validDraft({ title: 'a'.repeat(31) }));
    expect(errors).toContainEqual({ field: 'title', message: 'Title must be 30 characters or fewer' });
  });

  it('accepts title of exactly 30 chars', () => {
    const errors = validateCardDraft(validDraft({ title: 'a'.repeat(30) }));
    expect(errors).toEqual([]);
  });

  it('rejects empty body', () => {
    const errors = validateCardDraft(validDraft({ body: '' }));
    expect(errors).toContainEqual({ field: 'body', message: 'Body is required' });
  });

  it('rejects body exceeding 500 chars', () => {
    const errors = validateCardDraft(validDraft({ body: 'x'.repeat(501) }));
    expect(errors).toContainEqual({ field: 'body', message: 'Body must be 500 characters or fewer' });
  });

  it('rejects invalid date format', () => {
    const errors = validateCardDraft(validDraft({ date: '06-15-2024' }));
    expect(errors).toContainEqual({ field: 'date', message: 'Date must be in YYYY-MM-DD format' });
  });

  it('rejects invalid calendar date', () => {
    const errors = validateCardDraft(validDraft({ date: '2024-02-30' }));
    expect(errors).toContainEqual({ field: 'date', message: 'Date must be a valid calendar date' });
  });

  it('accepts leap day on leap year', () => {
    const errors = validateCardDraft(validDraft({ date: '2024-02-29' }));
    expect(errors).toEqual([]);
  });

  it('rejects leap day on non-leap year', () => {
    const errors = validateCardDraft(validDraft({ date: '2023-02-29' }));
    expect(errors.some(e => e.field === 'date')).toBe(true);
  });

  it('rejects mood < 1', () => {
    const errors = validateCardDraft(validDraft({ mood: 0 }));
    expect(errors).toContainEqual({ field: 'mood', message: 'Mood must be an integer from 1 to 5' });
  });

  it('rejects mood > 5', () => {
    const errors = validateCardDraft(validDraft({ mood: 6 }));
    expect(errors).toContainEqual({ field: 'mood', message: 'Mood must be an integer from 1 to 5' });
  });

  it('rejects non-integer mood', () => {
    const errors = validateCardDraft(validDraft({ mood: 2.5 }));
    expect(errors).toContainEqual({ field: 'mood', message: 'Mood must be an integer from 1 to 5' });
  });

  it('rejects more than 5 tags after normalization', () => {
    const errors = validateCardDraft(validDraft({ tags: ['a', 'b', 'c', 'd', 'e', 'f'] }));
    expect(errors).toContainEqual({ field: 'tags', message: 'Maximum 5 tags allowed' });
  });

  it('accepts 5 tags', () => {
    const errors = validateCardDraft(validDraft({ tags: ['a', 'b', 'c', 'd', 'e'] }));
    expect(errors).toEqual([]);
  });

  it('accepts 0 tags', () => {
    const errors = validateCardDraft(validDraft({ tags: [] }));
    expect(errors).toEqual([]);
  });
});

describe('normalizeTags', () => {
  it('lowercases and trims', () => {
    expect(normalizeTags(['  Design  ', ' COLOR '])).toEqual(['design', 'color']);
  });

  it('removes empty tags', () => {
    expect(normalizeTags(['a', '', '  ', 'b'])).toEqual(['a', 'b']);
  });

  it('removes duplicates', () => {
    expect(normalizeTags(['Design', 'design', 'DESIGN'])).toEqual(['design']);
  });
});

describe('isValidCalendarDate', () => {
  it('accepts valid dates', () => {
    expect(isValidCalendarDate('2024-01-01')).toBe(true);
    expect(isValidCalendarDate('2024-12-31')).toBe(true);
  });

  it('rejects impossible dates', () => {
    expect(isValidCalendarDate('2024-13-01')).toBe(false);
    expect(isValidCalendarDate('2024-00-01')).toBe(false);
    expect(isValidCalendarDate('2024-04-31')).toBe(false);
  });
});

describe('validateUsername', () => {
  it('accepts valid username', () => {
    expect(validateUsername('alice')).toBeNull();
  });

  it('rejects empty username', () => {
    expect(validateUsername('')).toBe('Username is required');
  });

  it('rejects username > 50 chars', () => {
    expect(validateUsername('a'.repeat(51))).toBe('Username must be 50 characters or fewer');
  });
});

describe('validatePassword', () => {
  it('accepts valid password', () => {
    expect(validatePassword('secret123')).toBeNull();
  });

  it('rejects short password', () => {
    expect(validatePassword('abc1')).toBe('Password must be at least 8 characters');
  });

  it('rejects long password', () => {
    expect(validatePassword('a'.repeat(20) + '1')).toBe('Password must be 20 characters or fewer');
  });

  it('rejects password without digit', () => {
    expect(validatePassword('abcdefgh')).toBe('Password must contain at least one number');
  });

  it('accepts password of exactly 8 chars with digit', () => {
    expect(validatePassword('abcdefg1')).toBeNull();
  });

  it('accepts password of exactly 20 chars with digit', () => {
    expect(validatePassword('a'.repeat(19) + '1')).toBeNull();
  });
});
