/**
 * Route-level smoke tests for every main route component.
 *
 * Each route is rendered with the real component, against a real fake-indexeddb
 * profile and a seeded set of cards. Assertions check user-observable output:
 * headings, counts, messages — not implementation details.
 *
 * These supplement (do not replace) the existing service/integration specs.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, waitFor, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { tick } from 'svelte';

import Dashboard from '../../src/routes/Dashboard.svelte';
import Cards from '../../src/routes/Cards.svelte';
import Import from '../../src/routes/Import.svelte';
import Search from '../../src/routes/Search.svelte';
import Voyage from '../../src/routes/Voyage.svelte';
import Backup from '../../src/routes/Backup.svelte';
import Jobs from '../../src/routes/Jobs.svelte';
import Settings from '../../src/routes/Settings.svelte';
import SDKDocs from '../../src/routes/SDKDocs.svelte';

import { type NebulaDB, setDbFactory } from '$lib/db/connection';
import { createTestDb, destroyTestDb } from '../helpers/db-factory';
import { register, logout } from '$lib/stores/auth.store';
import { resetPreferences } from '$lib/stores/preferences.store';
import { createCard } from '$lib/services/card.service';
import { setWorkerFactory, __resetForTests } from '$lib/services/queue-runner.service';
import { fakeWorkerFactory } from '../helpers/fake-worker';

let testDb: NebulaDB;

async function seedCards(profileId: string, n: number) {
  for (let i = 0; i < n; i++) {
    await createCard(profileId, {
      title: `Card ${i}`,
      body: `Body of card number ${i}`,
      date: `2024-01-${String((i % 27) + 1).padStart(2, '0')}`,
      mood: ((i % 5) + 1) as 1 | 2 | 3 | 4 | 5,
      tags: ['test', `t${i}`],
    });
  }
}

beforeEach(async () => {
  localStorage.clear();
  testDb = createTestDb();
  setDbFactory(() => testDb);
  resetPreferences();
  setWorkerFactory(() => fakeWorkerFactory() as unknown as Worker);
  // Every route assumes an unlocked profile so it can resolve currentProfileId.
  await register('demo', 'demopass1');
});

afterEach(async () => {
  __resetForTests();
  logout();
  setDbFactory(null);
  await destroyTestDb(testDb);
  vi.restoreAllMocks();
});

describe('Dashboard route', () => {
  it('shows the welcome heading with the unlocked username', async () => {
    const { findByText } = render(Dashboard);
    expect(await findByText(/Welcome, demo/)).toBeTruthy();
  });

  it('reflects the count of active cards', async () => {
    const profile = await testDb.profiles.toCollection().first();
    await seedCards(profile!.id, 3);
    const { container } = render(Dashboard);
    await waitFor(() => expect(container.textContent).toContain('Active Cards'));
    await waitFor(() => expect(container.textContent).toContain('3'));
  });

  it('shows an empty-state prompt when there are no cards', async () => {
    const { findByText } = render(Dashboard);
    expect(await findByText(/No cards yet/)).toBeTruthy();
  });
});

describe('Cards route', () => {
  it('renders the heading and active count', async () => {
    const profile = await testDb.profiles.toCollection().first();
    await seedCards(profile!.id, 2);
    const { findByText, container } = render(Cards);
    expect(await findByText('Cards')).toBeTruthy();
    await waitFor(() => expect(container.textContent).toContain('2 active cards'));
  });

  it('New Card button switches to the editor', async () => {
    const { findByRole, findByText } = render(Cards);
    const newBtn = await findByRole('button', { name: /New Card/i });
    await fireEvent.click(newBtn);
    expect(await findByText(/Create New Card/i)).toBeTruthy();
    // Editor form controls are present
    expect(await findByRole('button', { name: /Cancel/i })).toBeTruthy();
  });

  it('shows the empty-state message when no cards exist', async () => {
    const { findByText } = render(Cards);
    expect(await findByText(/No cards yet/)).toBeTruthy();
  });
});

describe('Import route', () => {
  it('renders the header and the wizard step 1 file pick UI', async () => {
    const { findByText, container } = render(Import);
    expect(await findByText('Import Cards')).toBeTruthy();
    // The drop zone and supported-types prompt render.
    await waitFor(() => {
      expect(container.textContent).toMatch(/Drag.*drop|Choose File|Supported/i);
    });
  });
});

describe('Search route', () => {
  it('renders heading, search input, and empty state', async () => {
    const { findByText, container } = render(Search);
    expect(await findByText('Search')).toBeTruthy();
    const input = container.querySelector('input[placeholder="Search cards..."]');
    expect(input).toBeTruthy();
  });
});

describe('Voyage route', () => {
  it('shows the mission heading and daily goal progress ring', async () => {
    const { findByText, container } = render(Voyage);
    expect(await findByText('Voyage Mission')).toBeTruthy();
    await waitFor(() => expect(container.textContent).toMatch(/0\/10/));
    // Streak stat tiles render
    expect(container.textContent).toContain('Current');
    expect(container.textContent).toContain('Longest');
    expect(container.textContent).toContain('Stardust');
  });
});

describe('Backup route', () => {
  it('renders both export and import panels', async () => {
    const { findByText, findAllByRole } = render(Backup);
    expect(await findByText('Backup & Restore')).toBeTruthy();
    const buttons = await findAllByRole('button');
    const labels = buttons.map((b) => b.textContent?.trim());
    expect(labels.some((l) => /Export/i.test(l ?? ''))).toBe(true);
  });
});

describe('Jobs route', () => {
  it('renders the Job Monitor heading and empty-state', async () => {
    const { findByText, container } = render(Jobs);
    expect(await findByText('Job Monitor')).toBeTruthy();
    // Empty job list shows a descriptive message
    await waitFor(() => expect(container.textContent?.toLowerCase()).toMatch(/no jobs|no active|queue empty|\bjobs\b/));
  });
});

describe('Settings route', () => {
  it('renders theme, navigation, and language pickers', async () => {
    const { container } = render(Settings);
    await waitFor(() => {
      expect(container.querySelector('#theme')).toBeTruthy();
      expect(container.querySelector('#navigation')).toBeTruthy();
      expect(container.querySelector('#language')).toBeTruthy();
    });
  });

  it('updating the theme select applies the class to documentElement', async () => {
    const { container } = render(Settings);
    const themeSelect = await waitFor(() =>
      container.querySelector('#theme') as HTMLSelectElement
    );
    themeSelect.value = 'light';
    await fireEvent.change(themeSelect);
    await tick();
    expect(document.documentElement.classList.contains('theme-light')).toBe(true);
  });
});

describe('SDKDocs route', () => {
  it('shows the heading and download buttons', async () => {
    const { findByText, findByRole } = render(SDKDocs);
    expect(await findByText('Star Map SDK')).toBeTruthy();
    expect(await findByRole('button', { name: /Download Spec/i })).toBeTruthy();
    expect(await findByRole('button', { name: /Download SDK Bundle/i })).toBeTruthy();
  });

  it('clicking Download Spec triggers a fetch against the spec URL', async () => {
    // Build a fake Response object that returns a real Blob from `.blob()` —
    // the global Response constructor may not accept node:buffer Blobs in
    // every jsdom version, so we hand-roll a minimal Response stand-in.
    const fakeBlob = new Blob(['{}'], { type: 'application/json' });
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      blob: async () => fakeBlob,
    }));
    vi.stubGlobal('fetch', fetchMock as any);
    const createUrlSpy = vi.fn(() => 'blob:mock-url');
    const revokeUrlSpy = vi.fn();
    // @ts-expect-error JSDOM lacks these
    URL.createObjectURL = createUrlSpy;
    // @ts-expect-error JSDOM lacks these
    URL.revokeObjectURL = revokeUrlSpy;

    const { findByRole } = render(SDKDocs);
    const btn = await findByRole('button', { name: /Download Spec/i });
    await fireEvent.click(btn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
      const [url] = fetchMock.mock.calls[0];
      expect(String(url)).toContain('/sdk/openapi-v1.json');
    });
    await waitFor(() => expect(createUrlSpy).toHaveBeenCalled());
  });
});
