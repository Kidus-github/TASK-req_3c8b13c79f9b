/**
 * Search UI integration: SearchBar, SearchFilters, SearchResults.
 *
 * Runs against the real search store, real search.service, a fake-indexeddb
 * database, and the real fake-worker factory. No UI-level mocks.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { get } from 'svelte/store';

import SearchBar from '../../src/components/search/SearchBar.svelte';
import SearchFilters from '../../src/components/search/SearchFilters.svelte';
import SearchResults from '../../src/components/search/SearchResults.svelte';

import { type NebulaDB, setDbFactory } from '$lib/db/connection';
import { createTestDb, destroyTestDb } from '../helpers/db-factory';
import { register, logout } from '$lib/stores/auth.store';
import { createCard } from '$lib/services/card.service';
import {
  query,
  searchResults,
  searchFilters as filtersStore,
  searchSort,
  clearSearch,
  executeSearch,
  setQueryText,
} from '$lib/stores/search.store';
import { setWorkerFactory, __resetForTests } from '$lib/services/queue-runner.service';
import { fakeWorkerFactory } from '../helpers/fake-worker';

let testDb: NebulaDB;
let profileId: string;

beforeEach(async () => {
  testDb = createTestDb();
  setDbFactory(() => testDb);
  setWorkerFactory(() => fakeWorkerFactory() as unknown as Worker);
  clearSearch();
  await register('demo', 'demopass1');
  const profile = await testDb.profiles.toCollection().first();
  profileId = profile!.id;

  await createCard(profileId, { title: 'Sunset Over Mountains', body: 'A golden sunset photo', date: '2024-01-15', mood: 5, tags: ['nature'] });
  await createCard(profileId, { title: 'Coffee Morning', body: 'Fresh espresso', date: '2024-01-16', mood: 4, tags: ['food', 'drink'] });
  await createCard(profileId, { title: 'Ocean Waves', body: 'Waves at sunset', date: '2024-01-17', mood: 5, tags: ['nature', 'water'] });
});

afterEach(async () => {
  __resetForTests();
  clearSearch();
  logout();
  setDbFactory(null);
  await destroyTestDb(testDb);
});

describe('SearchBar', () => {
  it('mirrors typed text into the query store', async () => {
    const { container } = render(SearchBar);
    const input = container.querySelector('input') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'ocean' } });
    expect(get(query)).toBe('ocean');
  });

  it('clears the query when the input is emptied', async () => {
    setQueryText('ocean');
    const { container } = render(SearchBar);
    const input = container.querySelector('input') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: '' } });
    expect(get(query)).toBe('');
  });
});

describe('SearchFilters', () => {
  it('tag filter change pushes filters into the store and runs search', async () => {
    const { container } = render(SearchFilters);
    const tagInput = container.querySelector<HTMLInputElement>('#tag-filter')!;
    // `bind:value` listens to `input`; `applyFilters` listens to `change`.
    await fireEvent.input(tagInput, { target: { value: 'water' } });
    await fireEvent.change(tagInput);
    await waitFor(() => {
      expect(get(filtersStore).tags).toEqual(['water']);
    });
  });

  it('changing sort updates the store', async () => {
    const { container } = render(SearchFilters);
    const sortSel = container.querySelector<HTMLSelectElement>('#sort-select')!;
    await fireEvent.change(sortSel, { target: { value: 'title_asc' } });
    expect(get(searchSort)).toEqual({ field: 'title', direction: 'asc' });
  });

  it('Clear resets all filter inputs', async () => {
    const { container, getByText } = render(SearchFilters);
    const tagInput = container.querySelector<HTMLInputElement>('#tag-filter')!;
    await fireEvent.input(tagInput, { target: { value: 'food' } });
    await fireEvent.change(tagInput);
    await waitFor(() => expect(get(filtersStore).tags).toEqual(['food']));
    await fireEvent.click(getByText('Clear'));
    await waitFor(() => expect(get(filtersStore)).toEqual({}));
  });
});

describe('SearchResults (wired against real search service)', () => {
  it('renders hits after executeSearch finishes against the real index', async () => {
    setQueryText('sunset');
    await executeSearch();
    await tick();

    const { findByText, container } = render(SearchResults);
    await waitFor(() => expect(get(searchResults).length).toBeGreaterThan(0));
    // The titles should appear (possibly wrapped in <mark>).
    await waitFor(() => {
      expect(container.textContent).toMatch(/Sunset Over Mountains/i);
    });
  });

  it('dispatches selectCard when a result is clicked', async () => {
    setQueryText('ocean');
    await executeSearch();
    await tick();
    await waitFor(() => expect(get(searchResults).length).toBeGreaterThan(0));

    const selected: string[] = [];
    const { container } = render(SearchResults, {
      // @ts-expect-error Svelte 5 mount option
      events: { selectCard: (e: CustomEvent<string>) => selected.push(e.detail) },
    });
    await waitFor(() => expect(container.querySelector('button')).toBeTruthy());
    await fireEvent.click(container.querySelector('button')!);
    expect(selected).toHaveLength(1);
  });

  it('shows "No results" message when query has no hits', async () => {
    setQueryText('zzzzzunmatched');
    await executeSearch();
    await tick();

    const { container } = render(SearchResults);
    await waitFor(() => {
      expect(container.textContent?.toLowerCase()).toContain('no results');
    });
  });
});
