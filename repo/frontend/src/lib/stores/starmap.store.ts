import { writable, derived, get } from 'svelte/store';
import type { StarNode, Galaxy, CameraState, LightingPreset } from '$lib/types/starmap';
import { cardsToStarNodes, cardsToGalaxies } from '$lib/services/starmap.service';
import { activeCards } from './cards.store';
import { preferences, updatePreference } from './preferences.store';

const VALID_PRESETS: LightingPreset[] = ['nebula', 'deep-space', 'aurora', 'twilight', 'cosmic-dawn'];

function coerceLighting(value: unknown): LightingPreset {
  return VALID_PRESETS.includes(value as LightingPreset) ? (value as LightingPreset) : 'nebula';
}

const starNodes = writable<StarNode[]>([]);
const galaxies = writable<Galaxy[]>([]);
const selectedStarId = writable<string | null>(null);
const highlightedCardIds = writable<string[]>([]);
// Initialize the lighting preset from persisted preferences so the canvas
// boots with the user's last-selected preset instead of the hard-coded default.
const lightingPreset = writable<LightingPreset>(coerceLighting(get(preferences).lightingPreset));

// Keep lighting in lockstep with preferences in both directions:
// - Preferences change (Settings UI) -> scene updates
// - setLighting() called directly -> preferences persist
preferences.subscribe($prefs => {
  const next = coerceLighting($prefs.lightingPreset);
  if (get(lightingPreset) !== next) lightingPreset.set(next);
});

export function refreshStarMap(cards: import('$lib/types/card').Card[]) {
  const nodes = cardsToStarNodes(cards);
  const gals = cardsToGalaxies(cards);
  starNodes.set(nodes);
  galaxies.set(gals);
}

export function selectStar(starId: string | null) {
  selectedStarId.set(starId);
}

export function highlightCards(ids: string[]) {
  highlightedCardIds.set(ids);
}

export function clearHighlights() {
  highlightedCardIds.set([]);
}

export function setLighting(preset: LightingPreset) {
  const next = coerceLighting(preset);
  lightingPreset.set(next);
  if (get(preferences).lightingPreset !== next) {
    updatePreference('lightingPreset', next);
  }
}

export const stars = { subscribe: starNodes.subscribe };
export const galaxyList = { subscribe: galaxies.subscribe };
export const selectedStar = { subscribe: selectedStarId.subscribe };
export const highlighted = { subscribe: highlightedCardIds.subscribe };
export const lighting = { subscribe: lightingPreset.subscribe };

export const selectedStarNode = derived(
  [starNodes, selectedStarId],
  ([$nodes, $id]) => $id ? $nodes.find(n => n.id === $id) ?? null : null
);
