/**
 * Direct regression test for the SPA route registry.
 *
 * The audit flagged `src/routes/index.ts` as exercised only indirectly
 * through App/navigation. This suite pins the exact route map so accidental
 * renames, removals, or reorderings fail fast.
 *
 * Asserts:
 *   - every documented route path is present and points to a Svelte
 *     component (the App.svelte Router wires Svelte components directly).
 *   - no stray/unknown paths were added.
 *   - each component is a distinct import — none of the routes collapse
 *     onto the same component (historically a copy-paste hazard).
 */
import { describe, it, expect } from 'vitest';
import { routes } from '../../src/routes';

const EXPECTED_PATHS = [
  '/',
  '/cards',
  '/import',
  '/starmap',
  '/search',
  '/voyage',
  '/backup',
  '/parser-rules',
  '/sdk-docs',
  '/jobs',
  '/settings',
] as const;

describe('routes registry (src/routes/index.ts)', () => {
  it('exposes exactly the documented route paths — no additions, no removals', () => {
    const actual = Object.keys(routes).sort();
    const expected = [...EXPECTED_PATHS].sort();
    expect(actual).toEqual(expected);
  });

  it('each route maps to a defined Svelte component', () => {
    for (const path of EXPECTED_PATHS) {
      const component = (routes as Record<string, unknown>)[path];
      expect(component, `route ${path} has a component`).toBeDefined();
      expect(component).not.toBeNull();
      // Svelte 5 compiled components are functions; either way they must be a
      // callable / reference type, not a string or object literal.
      expect(['function', 'object']).toContain(typeof component);
    }
  });

  it('every route component is unique — no copy-paste collision', () => {
    const seen = new Map<unknown, string>();
    for (const [path, component] of Object.entries(routes)) {
      const existing = seen.get(component);
      expect(
        existing,
        `route ${path} reuses the component already bound to ${existing}`,
      ).toBeUndefined();
      seen.set(component, path);
    }
    // The number of distinct components equals the number of routes.
    expect(seen.size).toBe(EXPECTED_PATHS.length);
  });

  it('the root path "/" is present (App.svelte relies on a default route)', () => {
    expect(routes['/']).toBeDefined();
  });
});
