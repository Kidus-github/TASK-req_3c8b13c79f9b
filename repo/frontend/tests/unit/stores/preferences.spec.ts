import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

describe('preferences store', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
    vi.resetModules();
  });

  it('hydrates defaults when nothing is persisted', async () => {
    const mod = await import('$lib/stores/preferences.store');
    const prefs = get(mod.preferences);
    expect(prefs.theme).toBe('dark');
    expect(prefs.navigationLayout).toBe('sidebar');
    expect(prefs.language).toBe('en');
    expect(prefs.carouselImages).toEqual([]);
    expect(typeof prefs.footerText).toBe('string');
  });

  it('rehydrates persisted preferences across reload', async () => {
    localStorage.setItem(
      'nebulaforge_preferences',
      JSON.stringify({
        theme: 'light',
        navigationLayout: 'topbar',
        language: 'es',
        footerText: 'Hola',
        carouselImages: [{ id: 'a', src: '/a.png', caption: 'A' }],
      })
    );
    const mod = await import('$lib/stores/preferences.store');
    const prefs = get(mod.preferences);
    expect(prefs.theme).toBe('light');
    expect(prefs.navigationLayout).toBe('topbar');
    expect(prefs.language).toBe('es');
    expect(prefs.footerText).toBe('Hola');
    expect(prefs.carouselImages).toHaveLength(1);
  });

  it('filters bogus carousel entries during hydration', async () => {
    localStorage.setItem(
      'nebulaforge_preferences',
      JSON.stringify({ carouselImages: [{ id: 'ok', src: '/x.png', caption: '' }, { junk: true }] })
    );
    const mod = await import('$lib/stores/preferences.store');
    const prefs = get(mod.preferences);
    expect(prefs.carouselImages.map(i => i.id)).toEqual(['ok']);
  });

  it('applying theme toggles the theme class on the document element', async () => {
    const mod = await import('$lib/stores/preferences.store');
    mod.updatePreference('theme', 'light');
    expect(document.documentElement.classList.contains('theme-light')).toBe(true);
    mod.updatePreference('theme', 'dark');
    expect(document.documentElement.classList.contains('theme-dark')).toBe(true);
    expect(document.documentElement.classList.contains('theme-light')).toBe(false);
  });

  it('mirrors language + navigation layout on the document element attributes', async () => {
    const mod = await import('$lib/stores/preferences.store');
    mod.updatePreference('language', 'es');
    mod.updatePreference('navigationLayout', 'topbar');
    expect(document.documentElement.getAttribute('data-lang')).toBe('es');
    expect(document.documentElement.getAttribute('data-nav')).toBe('topbar');
  });

  it('add/update/remove carousel images persists to localStorage', async () => {
    const mod = await import('$lib/stores/preferences.store');
    const a = mod.addCarouselImage({ src: '/a.png', caption: 'Alpha' });
    mod.addCarouselImage({ src: '/b.png', caption: 'Beta' });
    expect(get(mod.preferences).carouselImages).toHaveLength(2);

    mod.updateCarouselImage(a.id, { caption: 'Alpha 2' });
    expect(get(mod.preferences).carouselImages[0].caption).toBe('Alpha 2');

    mod.removeCarouselImage(a.id);
    expect(get(mod.preferences).carouselImages).toHaveLength(1);

    const stored = JSON.parse(localStorage.getItem('nebulaforge_preferences')!);
    expect(stored.carouselImages).toHaveLength(1);
    expect(stored.carouselImages[0].caption).toBe('Beta');
  });

  it('resetPreferences restores defaults and keeps downstream subscribers consistent', async () => {
    const mod = await import('$lib/stores/preferences.store');
    mod.updatePreference('theme', 'light');
    mod.updatePreference('footerText', 'Custom footer');
    mod.resetPreferences();
    const p = get(mod.preferences);
    expect(p.theme).toBe('dark');
    expect(p.footerText).not.toBe('Custom footer');
  });
});

describe('i18n helper', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('translates navigation keys to the active language', async () => {
    const prefs = await import('$lib/stores/preferences.store');
    const i18n = await import('$lib/stores/i18n.store');
    prefs.updatePreference('language', 'en');
    expect(get(i18n.t)('nav.dashboard')).toBe('Dashboard');
    prefs.updatePreference('language', 'es');
    expect(get(i18n.t)('nav.dashboard')).toBe('Panel');
  });

  it('falls back to English when the key is missing in the active bundle', async () => {
    const prefs = await import('$lib/stores/preferences.store');
    const i18n = await import('$lib/stores/i18n.store');
    prefs.updatePreference('language', 'es');
    expect(get(i18n.t)('totally.unknown.key')).toBe('totally.unknown.key');
  });

  it('exposes at least English and Spanish as real languages', async () => {
    const i18n = await import('$lib/stores/i18n.store');
    const codes = i18n.SUPPORTED_LANGUAGES.map(l => l.code);
    expect(codes).toContain('en');
    expect(codes).toContain('es');
  });
});
