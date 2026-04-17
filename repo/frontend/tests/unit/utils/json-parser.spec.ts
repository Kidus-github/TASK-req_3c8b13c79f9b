import { describe, it, expect } from 'vitest';
import { parseJsonImport, evaluateJsonPath } from '$lib/utils/json-parser';

describe('parseJsonImport', () => {
  it('parses array of objects', () => {
    const json = JSON.stringify([
      { title: 'A', body: 'B', date: '2024-01-01', mood: 3, tags: 'x,y' },
    ]);
    const result = parseJsonImport(json);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].title).toBe('A');
    expect(result.rows[0].mood).toBe('3');
  });

  it('parses wrapper object with array', () => {
    const json = JSON.stringify({
      cards: [
        { title: 'A', body: 'B', date: '2024-01-01', mood: 1 },
      ],
    });
    const result = parseJsonImport(json);
    expect(result.rows).toHaveLength(1);
  });

  it('converts array values to comma-separated strings', () => {
    const json = JSON.stringify([{ title: 'T', body: 'B', date: '2024-01-01', mood: 1, tags: ['a', 'b'] }]);
    const result = parseJsonImport(json);
    expect(result.rows[0].tags).toBe('a, b');
  });

  it('handles null values', () => {
    const json = JSON.stringify([{ title: 'T', body: null }]);
    const result = parseJsonImport(json);
    expect(result.rows[0].body).toBe('');
  });

  it('rejects invalid JSON', () => {
    const result = parseJsonImport('not json');
    expect(result.rows).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
  });

  it('rejects non-object JSON', () => {
    const result = parseJsonImport('"string"');
    expect(result.rows).toHaveLength(0);
  });
});

describe('evaluateJsonPath', () => {
  it('evaluates simple path', () => {
    const obj = { a: { b: 'value' } };
    expect(evaluateJsonPath(obj, '$.a.b')).toEqual(['value']);
  });

  it('evaluates wildcard on object', () => {
    const obj = { items: { a: 1, b: 2 } };
    expect(evaluateJsonPath(obj, '$.items.*')).toEqual([1, 2]);
  });

  it('evaluates wildcard on array', () => {
    const obj = { items: [1, 2, 3] };
    expect(evaluateJsonPath(obj, '$.items.*')).toEqual([1, 2, 3]);
  });

  it('returns empty for non-existent path', () => {
    expect(evaluateJsonPath({ a: 1 }, '$.b.c')).toEqual([]);
  });
});
