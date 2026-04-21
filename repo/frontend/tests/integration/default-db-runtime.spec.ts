import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';

import Dashboard from '../../src/routes/Dashboard.svelte';

import { getDb, resetDb } from '$lib/db/connection';
import { register, logout } from '$lib/stores/auth.store';
import { resetPreferences } from '$lib/stores/preferences.store';
import { clearToasts } from '$lib/stores/toast.store';
import { createCard } from '$lib/services/card.service';

async function deleteDefaultDb(): Promise<void> {
  const db = getDb();
  db.close();
  await db.delete();
  resetDb();
}

beforeEach(async () => {
  localStorage.clear();
  clearToasts();
  resetPreferences();
  logout();
  await deleteDefaultDb();
});

afterEach(async () => {
  clearToasts();
  resetPreferences();
  logout();
  await deleteDefaultDb();
});

describe('default runtime wiring without setDbFactory', () => {
  it('Dashboard loads cards through the real default NebulaDB singleton', async () => {
    const ok = await register('demo', 'demopass1');
    expect(ok).toBe(true);

    const db = getDb();
    const profile = await db.profiles.toCollection().first();
    expect(profile).toBeTruthy();

    const created = await createCard(profile!.id, {
      title: 'Default DB Card',
      body: 'Created through the default singleton path',
      date: '2024-05-01',
      mood: 4,
      tags: ['default-db'],
    });
    expect(created.ok).toBe(true);

    const { findByText } = render(Dashboard);

    expect(await findByText(/Welcome, demo/)).toBeTruthy();
    expect(await findByText('Default DB Card')).toBeTruthy();
    expect(await findByText(/Created through the default singleton path/)).toBeTruthy();
    await waitFor(() => {
      expect(document.body.textContent).toContain('1');
    });
  });
});
