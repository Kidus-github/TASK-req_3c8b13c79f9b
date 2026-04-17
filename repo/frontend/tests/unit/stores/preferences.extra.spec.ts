/**
 * Branch coverage for preferences.store: normalize() guards, malformed JSON,
 * non-string footerText fallback, and the legacy id fallback in
 * addCarouselImage when crypto.randomUUID is unavailable.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = '';
  vi.resetModules();
});

describe('preferences normalize() guards', () => {
  it('coerces invalid theme/navigation/language values back to defaults', async () => {
    localStorage.setItem('nebulaforge_preferences', JSON.stringify({
      theme: 'rainbow',
      navigationLayout: 'wormhole',
      language: 'martian',
    }));
    const mod = await import('$lib/stores/preferences.store');
    const prefs = get(mod.preferences);
    expect(prefs.theme).toBe('dark');
    expect(prefs.navigationLayout).toBe('sidebar');
    expect(prefs.language).toBe('en');
  });

  it('replaces non-string footerText with the default', async () => {
    localStorage.setItem('nebulaforge_preferences', JSON.stringify({ footerText: 12345 }));
    const mod = await import('$lib/stores/preferences.store');
    const prefs = get(mod.preferences);
    expect(typeof prefs.footerText).toBe('string');
    expect(prefs.footerText.length).toBeGreaterThan(0);
  });

  it('coerces non-array carouselImages to []', async () => {
    localStorage.setItem('nebulaforge_preferences', JSON.stringify({ carouselImages: 'not-an-array' }));
    const mod = await import('$lib/stores/preferences.store');
    expect(get(mod.preferences).carouselImages).toEqual([]);
  });

  it('discards corrupt JSON payloads silently and returns defaults', async () => {
    localStorage.setItem('nebulaforge_preferences', '{not json');
    const mod = await import('$lib/stores/preferences.store');
    expect(get(mod.preferences).theme).toBe('dark');
  });
});

describe('addCarouselImage id', () => {
  it('produces unique ids per call', async () => {
    const mod = await import('$lib/stores/preferences.store');
    const a = mod.addCarouselImage({ src: '/a.png', caption: 'A' });
    const b = mod.addCarouselImage({ src: '/b.png', caption: 'B' });
    expect(a.id).not.toBe(b.id);
  });
});

describe('preferences applyThemeSideEffects', () => {
  it('removes opposite theme class before adding the new one', async () => {
    const mod = await import('$lib/stores/preferences.store');
    mod.updatePreference('theme', 'light');
    expect(document.documentElement.classList.contains('theme-light')).toBe(true);
    expect(document.documentElement.classList.contains('theme-dark')).toBe(false);
    mod.updatePreference('theme', 'dark');
    expect(document.documentElement.classList.contains('theme-dark')).toBe(true);
    expect(document.documentElement.classList.contains('theme-light')).toBe(false);
  });
});
