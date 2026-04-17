import { describe, it, expect } from 'vitest';
import { highlightMatches, extractSnippet } from '$lib/services/search.service';

describe('search.service highlightMatches', () => {
  it('returns escaped text when query is empty', () => {
    expect(highlightMatches('Hello & <world>', '')).toBe('Hello &amp; &lt;world&gt;');
  });

  it('wraps each token occurrence in a <mark>', () => {
    const out = highlightMatches('Sunset over mountains', 'sunset');
    expect(out.toLowerCase()).toContain('<mark>sunset</mark>');
  });

  it('handles multiple distinct tokens', () => {
    const out = highlightMatches('Sunset over mountains', 'sunset mountains');
    expect(out).toMatch(/<mark>Sunset<\/mark>/);
    expect(out).toMatch(/<mark>mountains<\/mark>/);
  });
});

describe('search.service extractSnippet', () => {
  it('returns short text unchanged when shorter than maxLength', () => {
    expect(extractSnippet('Short text', 'short', 100)).toBe('Short text');
  });

  it('returns first slice when query has no tokens', () => {
    expect(extractSnippet('A long text with many words to slice', '', 10)).toBe('A long tex');
  });

  it('extracts a window around the first match with ellipses on both sides', () => {
    const text = 'Lorem ipsum dolor sit amet consectetur adipiscing elit and many more long lorem ipsum words to make this body very long';
    const snip = extractSnippet(text, 'consectetur', 50);
    expect(snip).toContain('consectetur');
    expect(snip.startsWith('...') || snip.startsWith('Lorem')).toBe(true);
  });

  it('returns first slice when no tokens match', () => {
    const text = 'A'.repeat(200);
    const snip = extractSnippet(text, 'zzz', 50);
    expect(snip.length).toBe(50);
  });
});
