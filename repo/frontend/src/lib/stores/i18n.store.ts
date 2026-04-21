import { derived } from 'svelte/store';
import { preferences, type LanguageCode } from './preferences.store';

type StringBundle = Record<string, string>;

const BUNDLES: Record<LanguageCode, StringBundle> = {
  en: {
    'nav.dashboard': 'Dashboard',
    'nav.cards': 'Cards',
    'nav.starmap': 'Star Map',
    'nav.search': 'Search',
    'nav.voyage': 'Voyage',
    'nav.import': 'Import',
    'nav.backup': 'Backup',
    'nav.parserRules': 'Rules',
    'nav.sdk': 'SDK',
    'nav.jobs': 'Jobs',
    'nav.settings': 'Settings',
    'settings.title': 'Settings',
    'settings.subtitle': 'Preferences are stored locally on this device.',
    'settings.appearance': 'Appearance',
    'settings.theme': 'Theme',
    'settings.navigation': 'Navigation Layout',
    'settings.lighting': 'Star Map Lighting',
    'settings.language': 'Language',
    'settings.footer': 'Footer text',
    'settings.carousel': 'Dashboard carousel images',
    'settings.carousel.add': 'Add image',
    'settings.carousel.empty': 'No carousel images configured.',
    'settings.defaults': 'Defaults',
    'settings.defaultSort': 'Default Sort',
    'settings.reset': 'Reset to Defaults',
    'app.lock': 'Lock',
  },
  es: {
    'nav.dashboard': 'Panel',
    'nav.cards': 'Tarjetas',
    'nav.starmap': 'Mapa Estelar',
    'nav.search': 'Buscar',
    'nav.voyage': 'Travesia',
    'nav.import': 'Importar',
    'nav.backup': 'Respaldo',
    'nav.parserRules': 'Reglas',
    'nav.sdk': 'SDK',
    'nav.jobs': 'Trabajos',
    'nav.settings': 'Ajustes',
    'settings.title': 'Ajustes',
    'settings.subtitle': 'Las preferencias se guardan localmente en este dispositivo.',
    'settings.appearance': 'Apariencia',
    'settings.theme': 'Tema',
    'settings.navigation': 'Diseno de Navegacion',
    'settings.lighting': 'Iluminacion del Mapa',
    'settings.language': 'Idioma',
    'settings.footer': 'Texto del pie',
    'settings.carousel': 'Imagenes del carrusel',
    'settings.carousel.add': 'Agregar imagen',
    'settings.carousel.empty': 'Sin imagenes configuradas.',
    'settings.defaults': 'Valores predeterminados',
    'settings.defaultSort': 'Orden predeterminado',
    'settings.reset': 'Restablecer',
    'app.lock': 'Bloquear',
  },
};

export const SUPPORTED_LANGUAGES: { code: LanguageCode; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Espanol' },
];

export function translate(lang: LanguageCode, key: string): string {
  return BUNDLES[lang]?.[key] ?? BUNDLES.en[key] ?? key;
}

export const t = derived(preferences, ($prefs) => (key: string) => translate($prefs.language, key));
