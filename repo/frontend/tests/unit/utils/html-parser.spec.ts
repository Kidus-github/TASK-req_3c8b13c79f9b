import { describe, it, expect } from 'vitest';
import { extractFromHtml, validateCssSelector, validateXPath } from '$lib/utils/html-parser';

const SAMPLE = `<html><body>
  <div class="card">
    <h2 class="title">First Title</h2>
    <p class="body">First body content</p>
    <span class="date">2024-01-01</span>
    <span class="mood">3</span>
  </div>
  <div class="card">
    <h2 class="title">Second Title</h2>
    <p class="body">Second body content</p>
    <span class="date">2024-01-02</span>
    <span class="mood">5</span>
  </div>
</body></html>`;

describe('extractFromHtml (CSS)', () => {
  it('extracts every container with the configured field selectors', () => {
    const result = extractFromHtml(SAMPLE, 'css', '.card', {
      title: '.title',
      body: '.body',
      date: '.date',
      mood: '.mood',
    });
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({
      title: 'First Title',
      body: 'First body content',
      date: '2024-01-01',
      mood: '3',
    });
    expect(result.rows[1].mood).toBe('5');
  });

  it('returns empty rows + an error when the container matches nothing', () => {
    const result = extractFromHtml(SAMPLE, 'css', '.no-such-class', { t: '.title' });
    expect(result.rows).toEqual([]);
    expect(result.errors[0]).toMatch(/No elements matched/);
  });

  it('flags an invalid CSS selector as a parse error', () => {
    const result = extractFromHtml(SAMPLE, 'css', ':::invalid:::', { t: '.title' });
    expect(result.rows).toEqual([]);
    expect(result.errors[0]).toMatch(/Invalid CSS selector/);
  });

  it('returns empty string for missing field selector matches without aborting', () => {
    const result = extractFromHtml(SAMPLE, 'css', '.card', { ghost: '.does-not-exist' });
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].ghost).toBe('');
  });
});

describe('extractFromHtml (XPath)', () => {
  it('extracts containers via xpath and reads field values via xpath', () => {
    const result = extractFromHtml(SAMPLE, 'xpath', "//div[@class='card']", {
      title: ".//h2[@class='title']/text()",
      body: ".//p[@class='body']/text()",
    });
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].title).toBe('First Title');
    expect(result.rows[1].body).toBe('Second body content');
  });

  it('flags invalid XPath as a parse error', () => {
    const result = extractFromHtml(SAMPLE, 'xpath', '///not-valid', { t: 'a' });
    expect(result.rows).toEqual([]);
    expect(result.errors[0]).toMatch(/Invalid XPath/);
  });
});

describe('validateCssSelector', () => {
  it('returns true for valid selectors', () => {
    expect(validateCssSelector('.card')).toBe(true);
    expect(validateCssSelector('div > p.body')).toBe(true);
    expect(validateCssSelector('[data-id="1"]')).toBe(true);
  });

  it('returns false for invalid selectors', () => {
    expect(validateCssSelector(':::invalid:::')).toBe(false);
  });
});

describe('validateXPath', () => {
  it('returns true for a simple absolute path', () => {
    expect(validateXPath('//div')).toBe(true);
    expect(validateXPath('/root/child')).toBe(true);
  });

  it('returns false for malformed expressions', () => {
    expect(validateXPath('////')).toBe(false);
    expect(validateXPath('not[valid]xpath{')).toBe(false);
  });
});
