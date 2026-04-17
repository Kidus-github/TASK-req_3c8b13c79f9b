import { describe, it, expect } from 'vitest';
import { parseJsonImport, evaluateJsonPath } from '$lib/utils/json-parser';

describe('parseJsonImport extra branches', () => {
  it('wraps a single bare object as a one-row import', () => {
    const json = JSON.stringify({ title: 'Solo', body: 'body', mood: 4 });
    const result = parseJsonImport(json);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].title).toBe('Solo');
  });

  it('emits an item-level error for non-object array entries', () => {
    const json = JSON.stringify(['plain', 42, null, { title: 'OK' }]);
    const result = parseJsonImport(json);
    // Only the last entry is a valid object; the others get individual errors.
    expect(result.rows).toHaveLength(1);
    expect(result.errors.length).toBe(3);
  });

  it('coerces undefined values to empty strings', () => {
    const json = JSON.stringify([{ title: 'Card', extra: null }]);
    const result = parseJsonImport(json);
    expect(result.rows[0].extra).toBe('');
  });

  it('rejects literal numeric / boolean payloads', () => {
    expect(parseJsonImport('123').rows).toEqual([]);
    expect(parseJsonImport('true').rows).toEqual([]);
    expect(parseJsonImport('null').rows).toEqual([]);
  });
});

describe('evaluateJsonPath extra branches', () => {
  it('returns empty for paths that don\'t start with $', () => {
    expect(evaluateJsonPath({ a: 1 }, 'a')).toEqual([]);
  });

  it('handles indexed array access via key[i] notation', () => {
    const obj = { items: ['x', 'y', 'z'] };
    expect(evaluateJsonPath(obj, '$.items[1]')).toEqual(['y']);
  });

  it('returns empty for indexed access on a non-array', () => {
    const obj = { items: 'not-an-array' };
    expect(evaluateJsonPath(obj, '$.items[0]')).toEqual([]);
  });

  it('returns empty for indexed access with NaN index', () => {
    const obj = { items: ['x', 'y'] };
    expect(evaluateJsonPath(obj, '$.items[abc]')).toEqual([]);
  });

  it('skips null/undefined intermediates without throwing', () => {
    expect(evaluateJsonPath(null, '$.a')).toEqual([]);
    expect(evaluateJsonPath({ a: null }, '$.a.b')).toEqual([]);
  });

  it('handles a $-only path as identity', () => {
    expect(evaluateJsonPath({ a: 1 }, '$')).toEqual([{ a: 1 }]);
  });
});
