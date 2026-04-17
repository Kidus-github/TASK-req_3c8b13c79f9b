import { writable } from 'svelte/store';

export interface CarouselImage {
  id: string;
  src: string;
  caption: string;
}

export type ThemeOption = 'dark' | 'light';
export type NavigationLayout = 'sidebar' | 'topbar';
export type LanguageCode = 'en' | 'es';

export interface AppPreferences {
  theme: ThemeOption;
  navigationLayout: NavigationLayout;
  footerText: string;
  carouselImages: CarouselImage[];
  language: LanguageCode;
  lightingPreset: string;
  defaultSort: string;
  defaultFilters: Record<string, unknown>;
}

const STORAGE_KEY = 'nebulaforge_preferences';

const DEFAULT_PREFERENCES: AppPreferences = {
  theme: 'dark',
  navigationLayout: 'sidebar',
  footerText: 'Offline-first. Your data stays local.',
  carouselImages: [],
  language: 'en',
  lightingPreset: 'nebula',
  defaultSort: 'date_desc',
  defaultFilters: {},
};

function isCarouselImage(v: unknown): v is CarouselImage {
  if (!v || typeof v !== 'object') return false;
  const x = v as Record<string, unknown>;
  return typeof x.id === 'string' && typeof x.src === 'string' && typeof x.caption === 'string';
}

function normalize(partial: Partial<AppPreferences>): AppPreferences {
  const base = { ...DEFAULT_PREFERENCES, ...partial };
  if (base.theme !== 'dark' && base.theme !== 'light') base.theme = 'dark';
  if (base.navigationLayout !== 'sidebar' && base.navigationLayout !== 'topbar') base.navigationLayout = 'sidebar';
  if (base.language !== 'en' && base.language !== 'es') base.language = 'en';
  if (typeof base.footerText !== 'string') base.footerText = DEFAULT_PREFERENCES.footerText;
  const images = Array.isArray(base.carouselImages) ? base.carouselImages.filter(isCarouselImage) : [];
  base.carouselImages = images;
  return base;
}

function loadFromStorage(): AppPreferences {
  try {
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<AppPreferences>;
      return normalize(parsed);
    }
  } catch {
    // Invalid preference payload falls back to safe defaults
  }
  return { ...DEFAULT_PREFERENCES };
}

function saveToStorage(prefs: AppPreferences): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    }
  } catch {
    // localStorage full or unavailable
  }
}

const prefsStore = writable<AppPreferences>(loadFromStorage());

prefsStore.subscribe(value => {
  saveToStorage(value);
  applyThemeSideEffects(value);
});

function applyThemeSideEffects(prefs: AppPreferences): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (!root) return;
  root.classList.remove('theme-light', 'theme-dark');
  root.classList.add(prefs.theme === 'light' ? 'theme-light' : 'theme-dark');
  root.setAttribute('data-theme', prefs.theme);
  root.setAttribute('data-lang', prefs.language);
  root.setAttribute('data-nav', prefs.navigationLayout);
}

export function updatePreference<K extends keyof AppPreferences>(
  key: K,
  value: AppPreferences[K]
): void {
  prefsStore.update(prefs => ({ ...prefs, [key]: value }));
}

export function addCarouselImage(image: Omit<CarouselImage, 'id'>): CarouselImage {
  const id = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const record: CarouselImage = { id, src: image.src, caption: image.caption };
  prefsStore.update(prefs => ({ ...prefs, carouselImages: [...prefs.carouselImages, record] }));
  return record;
}

export function removeCarouselImage(id: string): void {
  prefsStore.update(prefs => ({ ...prefs, carouselImages: prefs.carouselImages.filter(i => i.id !== id) }));
}

export function updateCarouselImage(id: string, changes: Partial<Omit<CarouselImage, 'id'>>): void {
  prefsStore.update(prefs => ({
    ...prefs,
    carouselImages: prefs.carouselImages.map(i => (i.id === id ? { ...i, ...changes } : i)),
  }));
}

export function resetPreferences(): void {
  prefsStore.set({ ...DEFAULT_PREFERENCES });
}

export const preferences = { subscribe: prefsStore.subscribe };
export { DEFAULT_PREFERENCES };
