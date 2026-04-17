import type { CardDraft, CardValidationError } from '$lib/types/card';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function validateCardDraft(draft: CardDraft): CardValidationError[] {
  const errors: CardValidationError[] = [];

  const title = (draft.title ?? '').trim();
  if (!title) {
    errors.push({ field: 'title', message: 'Title is required' });
  } else if (title.length > 30) {
    errors.push({ field: 'title', message: 'Title must be 30 characters or fewer' });
  }

  const body = (draft.body ?? '').trim();
  if (!body) {
    errors.push({ field: 'body', message: 'Body is required' });
  } else if (body.length > 500) {
    errors.push({ field: 'body', message: 'Body must be 500 characters or fewer' });
  }

  if (!draft.date) {
    errors.push({ field: 'date', message: 'Date is required' });
  } else if (!DATE_REGEX.test(draft.date)) {
    errors.push({ field: 'date', message: 'Date must be in YYYY-MM-DD format' });
  } else if (!isValidCalendarDate(draft.date)) {
    errors.push({ field: 'date', message: 'Date must be a valid calendar date' });
  }

  if (draft.mood == null) {
    errors.push({ field: 'mood', message: 'Mood is required' });
  } else if (!Number.isInteger(draft.mood) || draft.mood < 1 || draft.mood > 5) {
    errors.push({ field: 'mood', message: 'Mood must be an integer from 1 to 5' });
  }

  const normalizedTags = normalizeTags(draft.tags ?? []);
  if (normalizedTags.length > 5) {
    errors.push({ field: 'tags', message: 'Maximum 5 tags allowed' });
  }

  return errors;
}

export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of tags) {
    const trimmed = tag.trim().toLowerCase();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      result.push(trimmed);
    }
  }
  return result;
}

export function isValidCalendarDate(dateStr: string): boolean {
  if (!DATE_REGEX.test(dateStr)) return false;
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

export function validateUsername(username: string): string | null {
  const trimmed = username.trim();
  if (!trimmed) return 'Username is required';
  if (trimmed.length > 50) return 'Username must be 50 characters or fewer';
  return null;
}

export function validatePassword(password: string): string | null {
  if (!password) return 'Password is required';
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (password.length > 20) return 'Password must be 20 characters or fewer';
  if (!/\d/.test(password)) return 'Password must contain at least one number';
  return null;
}
