import { describe, it, expect } from 'vitest';
import { validateCardDraft, validatePassword } from '$lib/utils/validation';
import type { CardDraft } from '$lib/types/card';

describe('validateCardDraft missing-field branches', () => {
  function draft(overrides: Partial<CardDraft> = {}): CardDraft {
    return { title: 'T', body: 'b body', date: '2024-06-15', mood: 3, tags: [], ...overrides };
  }

  it('rejects when date is empty / unset', () => {
    const errs = validateCardDraft({ ...draft(), date: '' });
    expect(errs.some((e) => e.field === 'date' && /required/i.test(e.message))).toBe(true);
  });

  it('rejects when mood is null', () => {
    const errs = validateCardDraft({ ...draft(), mood: null as unknown as 3 });
    expect(errs.some((e) => e.field === 'mood' && /required/i.test(e.message))).toBe(true);
  });
});

describe('validatePassword empty-input branch', () => {
  it('returns "Password is required" for empty input', () => {
    expect(validatePassword('')).toBe('Password is required');
  });
});
