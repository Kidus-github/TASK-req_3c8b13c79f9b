import { describe, it, expect } from 'vitest';
import { extractFromHtml, validateCssSelector, validateXPath } from '$lib/utils/html-parser';

describe('html-parser environment guards', () => {
  it('returns a clear error when DOMParser is unavailable', () => {
    const original = (globalThis as any).DOMParser;
    // @ts-expect-error test override
    delete globalThis.DOMParser;
    try {
      expect(extractFromHtml('<div></div>', 'css', 'div', { title: '.title' })).toEqual({
        rows: [],
        errors: ['DOMParser unavailable in this environment'],
      });
    } finally {
      (globalThis as any).DOMParser = original;
    }
  });

  it('records field-level selector errors for invalid selectors inside matched rows', () => {
    const out = extractFromHtml(
      '<article class="card"><h2 class="title">Alpha</h2></article>',
      'css',
      '.card',
      { title: '.title', broken: '??invalid??' },
    );
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].title).toBe('Alpha');
    expect(out.rows[0].broken).toBe('');
    expect(out.errors[0]).toMatch(/selector error/i);
  });

  it('validateCssSelector and validateXPath return false when DOM primitives are absent', () => {
    const originalParser = (globalThis as any).DOMParser;
    const originalXPath = (globalThis as any).XPathResult;
    const originalDocument = (globalThis as any).document;
    // @ts-expect-error test override
    delete globalThis.DOMParser;
    // @ts-expect-error test override
    delete globalThis.XPathResult;
    // @ts-expect-error test override
    delete globalThis.document;
    try {
      expect(validateCssSelector('.card')).toBe(false);
      expect(validateXPath('//card')).toBe(false);
    } finally {
      (globalThis as any).DOMParser = originalParser;
      (globalThis as any).XPathResult = originalXPath;
      (globalThis as any).document = originalDocument;
    }
  });
});
