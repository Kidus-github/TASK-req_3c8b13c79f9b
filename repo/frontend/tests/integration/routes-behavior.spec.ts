import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';

import Dashboard from '../../src/routes/Dashboard.svelte';
import Cards from '../../src/routes/Cards.svelte';
import Search from '../../src/routes/Search.svelte';
import Settings from '../../src/routes/Settings.svelte';

import { type NebulaDB, setDbFactory } from '$lib/db/connection';
import { createTestDb, destroyTestDb } from '../helpers/db-factory';
import { register, logout } from '$lib/stores/auth.store';
import { resetPreferences, addCarouselImage } from '$lib/stores/preferences.store';
import { clearSearch, searching } from '$lib/stores/search.store';
import { clearToasts } from '$lib/stores/toast.store';
import { createCard } from '$lib/services/card.service';
import { setWorkerFactory, __resetForTests } from '$lib/services/queue-runner.service';
import { fakeWorkerFactory } from '../helpers/fake-worker';

let testDb: NebulaDB;
let profileId: string;

async function settleSearchWork(): Promise<void> {
  await waitFor(() => {
    expect(get(searching)).toBe(false);
  }, { timeout: 5_000 });
  await new Promise((resolve) => setTimeout(resolve, 50));
}

async function seedCard(title: string, body: string, date: string, mood: 1 | 2 | 3 | 4 | 5, tags: string[]) {
  const result = await createCard(profileId, { title, body, date, mood, tags });
  if (!result.ok) throw new Error(`Failed to seed card ${title}`);
  return result.data;
}

beforeEach(async () => {
  testDb = createTestDb();
  setDbFactory(() => testDb);
  setWorkerFactory(() => fakeWorkerFactory() as unknown as Worker);
  resetPreferences();
  clearSearch();
  clearToasts();
  await register('demo', 'demopass1');
  profileId = (await testDb.profiles.toCollection().first())!.id;
});

afterEach(async () => {
  cleanup();
  __resetForTests();
  clearSearch();
  clearToasts();
  resetPreferences();
  logout();
  await new Promise((resolve) => setTimeout(resolve, 50));
  setDbFactory(null);
  await destroyTestDb(testDb);
});

describe('route behavior', () => {
  it('Dashboard reflects real card stats, recent content, and persisted carousel preferences', async () => {
    await seedCard('Aurora Notes', 'Field notes from the aurora deck', '2024-03-01', 5, ['space', 'night']);
    await seedCard('Ocean Study', 'Water palette references', '2024-03-02', 3, ['water']);
    addCarouselImage({
      src: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
      caption: 'Nebula cover',
    });

    const { findByText, getByTestId, getByAltText } = render(Dashboard);

    expect(await findByText(/Welcome, demo/)).toBeTruthy();
    expect(await findByText('Active Cards')).toBeTruthy();
    await waitFor(() => expect(document.body.textContent).toContain('2'));
    await waitFor(() => expect(document.body.textContent).toContain('3'));
    expect(await findByText('Aurora Notes')).toBeTruthy();
    expect(await findByText('Ocean Study')).toBeTruthy();
    expect(getByTestId('preferences-carousel')).toBeTruthy();
    expect(getByAltText('Nebula cover')).toBeTruthy();
  });

  it('Cards route supports create, edit, and delete through the real stores and services', async () => {
    const { findByRole, findByText, getByLabelText, getByRole, queryByText } = render(Cards);

    await fireEvent.click(await findByRole('button', { name: /New Card/i }));
    await fireEvent.input(getByLabelText(/Title/i), { target: { value: 'Route Created Card' } });
    await fireEvent.input(getByLabelText(/Body/i), { target: { value: 'Created through the Cards route' } });
    await fireEvent.input(getByLabelText(/Tags/i), { target: { value: 'route,created' } });
    await fireEvent.click(getByRole('button', { name: /^Create$/ }));

    expect(await findByText('Route Created Card')).toBeTruthy();
    expect(await findByText(/Created through the Cards route/)).toBeTruthy();
    expect(await findByText(/Version: 1/)).toBeTruthy();

    await fireEvent.click(getByRole('button', { name: /^Edit$/ }));
    await fireEvent.input(getByLabelText(/Title/i), { target: { value: 'Route Updated Card' } });
    await fireEvent.click(getByRole('button', { name: /^Update$/ }));

    expect(await findByText('Route Updated Card')).toBeTruthy();
    expect(await findByText(/Version: 2/)).toBeTruthy();

    await fireEvent.click(getByRole('button', { name: /^Delete$/ }));
    expect(await findByText(/Are you sure you want to delete "Route Updated Card"/)).toBeTruthy();
    await fireEvent.click(getByRole('button', { name: /^Delete$/ }));

    expect(await findByText(/No cards yet/)).toBeTruthy();
    expect(queryByText('Route Updated Card')).toBeNull();

    const cards = await testDb.cards.where('profileId').equals(profileId).toArray();
    expect(cards).toHaveLength(1);
    expect(cards[0].deletedAt).not.toBeNull();
  });

  it('Search route shows results from the real index, reveals details, and updates empty state after filtering', async () => {
    await seedCard('Sunset Atlas', 'Golden sunset over mountain ridges', '2024-04-01', 5, ['nature']);
    await seedCard('Ocean Ledger', 'Blue water references', '2024-04-02', 4, ['water']);

    const { container, findByText } = render(Search);
    const queryInput = container.querySelector<HTMLInputElement>('input[placeholder="Search cards..."]');
    expect(queryInput).toBeTruthy();

    await fireEvent.input(queryInput!, { target: { value: 'sunset' } });
    await settleSearchWork();

    await waitFor(() => {
      expect(container.textContent).toContain('Sunset Atlas');
    });
    const resultButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Sunset Atlas')
    );
    expect(resultButton).toBeTruthy();
    await fireEvent.click(resultButton!);

    expect(await findByText('Sunset Atlas')).toBeTruthy();
    expect(await findByText(/Golden sunset over mountain ridges/)).toBeTruthy();

    const tagFilter = container.querySelector<HTMLInputElement>('#tag-filter');
    expect(tagFilter).toBeTruthy();
    await fireEvent.input(tagFilter!, { target: { value: 'water' } });
    await fireEvent.change(tagFilter!);
    await settleSearchWork();

    await waitFor(() => {
      expect(document.body.textContent).toContain('No results match "sunset".');
    });
    await settleSearchWork();
  });

  it('Settings route updates translated labels, persists preferences, and resets to defaults', async () => {
    const { container, findByText, findByAltText, getByTestId } = render(Settings);

    const languageSelect = container.querySelector<HTMLSelectElement>('#language');
    expect(languageSelect).toBeTruthy();
    await fireEvent.change(languageSelect!, { target: { value: 'es' } });

    expect(await findByText('Ajustes')).toBeTruthy();
    expect(await findByText('Idioma')).toBeTruthy();
    expect(document.documentElement.getAttribute('data-lang')).toBe('es');

    const imageInput = container.querySelector<HTMLInputElement>('input[placeholder="Image URL or paste data URL"]');
    const captionInput = container.querySelector<HTMLInputElement>('input[placeholder="Caption"]');
    expect(imageInput).toBeTruthy();
    expect(captionInput).toBeTruthy();

    await fireEvent.input(imageInput!, {
      target: { value: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==' },
    });
    await fireEvent.input(captionInput!, { target: { value: 'Sunrise banner' } });
    await fireEvent.click(getByTestId('carousel-add'));

    expect(await findByAltText('Sunrise banner')).toBeTruthy();
    expect(JSON.parse(localStorage.getItem('nebulaforge_preferences') ?? '{}').language).toBe('es');

    await fireEvent.click(await findByText('Restablecer'));

    expect(await findByText('Settings')).toBeTruthy();
    expect(await findByText('No carousel images configured.')).toBeTruthy();
    expect(document.documentElement.getAttribute('data-lang')).toBe('en');
  });
});
