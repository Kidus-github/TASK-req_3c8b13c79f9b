import { describe, it, expect } from 'vitest';
import { parseCsv } from '$lib/utils/csv-parser';

describe('parseCsv', () => {
  it('parses simple CSV', () => {
    const result = parseCsv('title,body,date,mood,tags\nHello,World,2024-01-01,3,a');
    expect(result.headers).toEqual(['title', 'body', 'date', 'mood', 'tags']);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual({
      title: 'Hello',
      body: 'World',
      date: '2024-01-01',
      mood: '3',
      tags: 'a',
    });
  });

  it('handles quoted fields', () => {
    const result = parseCsv('title,body\n"Hello, World","Line1"');
    expect(result.rows[0].title).toBe('Hello, World');
  });

  it('handles escaped quotes', () => {
    const result = parseCsv('title,body\n"He said ""hi""",test');
    expect(result.rows[0].title).toBe('He said "hi"');
  });

  it('handles multi-line quoted fields', () => {
    const result = parseCsv('title,body\n"Hello","Line1\nLine2"');
    expect(result.rows[0].body).toBe('Line1\nLine2');
  });

  it('handles empty file', () => {
    const result = parseCsv('');
    expect(result.rows).toHaveLength(0);
    expect(result.errors).toContain('Empty CSV file');
  });

  it('handles multiple rows', () => {
    const csv = 'title,body,date,mood,tags\nA,B,2024-01-01,1,x\nC,D,2024-02-01,2,y';
    const result = parseCsv(csv);
    expect(result.rows).toHaveLength(2);
  });

  it('handles trailing newline', () => {
    const csv = 'title,body\nA,B\n';
    const result = parseCsv(csv);
    expect(result.rows).toHaveLength(1);
  });

  it('handles CRLF line endings', () => {
    const csv = 'title,body\r\nA,B\r\nC,D\r\n';
    const result = parseCsv(csv);
    expect(result.rows).toHaveLength(2);
  });

  it('trims header whitespace', () => {
    const result = parseCsv(' title , body \nA,B');
    expect(result.headers).toEqual(['title', 'body']);
  });

  it('trims cell whitespace', () => {
    const result = parseCsv('title,body\n  Hello ,  World  ');
    expect(result.rows[0].title).toBe('Hello');
    expect(result.rows[0].body).toBe('World');
  });
});
