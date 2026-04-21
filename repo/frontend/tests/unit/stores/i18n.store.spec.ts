import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

const STORAGE_KEY = 'nebulaforge_preferences';

async function loadStores() {
  const preferencesModule = await import('../../../src/lib/stores/preferences.store');
  const i18nModule = await import('../../../src/lib/stores/i18n.store');
  return { ...preferencesModule, ...i18nModule };
}

describe('i18n.store', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    document.documentElement.className = '';
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-lang');
    document.documentElement.removeAttribute('data-nav');
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('defaults to English translations and exposes the supported language list', async () => {
    const { t, SUPPORTED_LANGUAGES } = await loadStores();

    expect(SUPPORTED_LANGUAGES).toEqual([
      { code: 'en', label: 'English' },
      { code: 'es', label: 'Espanol' },
    ]);

    expect(get(t)('settings.title')).toBe('Settings');
    expect(get(t)('nav.cards')).toBe('Cards');
  });

  it('updates translated output immediately when the language preference changes', async () => {
    const { t, updatePreference } = await loadStores();

    expect(get(t)('settings.language')).toBe('Language');

    updatePreference('language', 'es');

    expect(get(t)('settings.language')).toBe('Idioma');
    expect(get(t)('settings.navigation')).toBe('Diseno de Navegacion');
    expect(document.documentElement.getAttribute('data-lang')).toBe('es');
  });

  it('rehydrates the translator from persisted preferences', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        theme: 'light',
        navigationLayout: 'topbar',
        footerText: 'Persisted',
        carouselImages: [],
        language: 'es',
        lightingPreset: 'aurora',
        defaultSort: 'title_asc',
        defaultFilters: {},
      })
    );

    vi.resetModules();
    const { preferences, t } = await loadStores();

    expect(get(preferences).language).toBe('es');
    expect(get(t)('settings.title')).toBe('Ajustes');
    expect(get(t)('nav.search')).toBe('Buscar');
    expect(document.documentElement.getAttribute('data-lang')).toBe('es');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.documentElement.getAttribute('data-nav')).toBe('topbar');
  });

  it('falls back to English or the raw key when a translation is unavailable', async () => {
    const { translate } = await loadStores();

    expect(translate('es', 'nav.jobs')).toBe('Trabajos');
    expect(translate('es', 'missing.key')).toBe('missing.key');
  });

  it('persists language changes so a fresh module instance reuses the new locale', async () => {
    let stores = await loadStores();
    stores.updatePreference('language', 'es');

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').language).toBe('es');

    vi.resetModules();
    stores = await loadStores();

    expect(get(stores.t)('settings.reset')).toBe('Restablecer');
    expect(get(stores.preferences).language).toBe('es');
  });
});
