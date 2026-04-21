/**
 * Auth entry UI: LoginGate, LockoutNotice, ProfileBadge.
 *
 * Real auth.store, real auth.service, real validation and fake-indexeddb
 * backing. Only the DOM and timers are faked (via jsdom + vitest).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { tick } from 'svelte';

import LoginGate from '../../src/components/auth/LoginGate.svelte';
import LockoutNotice from '../../src/components/auth/LockoutNotice.svelte';
import ProfileBadge from '../../src/components/auth/ProfileBadge.svelte';
import {
  isUnlocked,
  logout,
  register,
  currentProfile,
  registering,
} from '$lib/stores/auth.store';
import { type NebulaDB, setDbFactory } from '$lib/db/connection';
import { createTestDb, destroyTestDb } from '../helpers/db-factory';

let testDb: NebulaDB;

beforeEach(() => {
  testDb = createTestDb();
  setDbFactory(() => testDb);
  logout();
  // Reset register-mode flag so the gate behaves consistently across tests.
  registering.set(false);
});

afterEach(async () => {
  logout();
  // Let any in-flight auth promises settle before we destroy the DB so
  // background audit writes don't fire against a closed Dexie handle.
  await new Promise((r) => setTimeout(r, 20));
  setDbFactory(null);
  await destroyTestDb(testDb);
});

describe('LoginGate', () => {
  it('defaults to register mode on a fresh device (no profile exists)', async () => {
    const { findByRole } = render(LoginGate);
    await waitFor(() => expect(get(registering)).toBe(true));
    const submit = await findByRole('button', { name: /Create Local Profile/i });
    expect(submit).toBeTruthy();
  });

  it('switches to unlock mode once a profile exists on the device', async () => {
    // Seed a profile directly through the real service path.
    await register('demo', 'demopass1');
    logout();
    await tick();

    const { findByRole } = render(LoginGate);
    const unlock = await findByRole('button', { name: /^Unlock$/ });
    expect(unlock).toBeTruthy();
  });

  it('registers a profile from the UI, unlocking the app', async () => {
    const { findByRole, getByLabelText } = render(LoginGate);
    const submit = await findByRole('button', { name: /Create Local Profile/i });

    const username = getByLabelText(/Username/i) as HTMLInputElement;
    const password = getByLabelText(/^Password$/) as HTMLInputElement;
    const confirm = getByLabelText(/Confirm Password/i) as HTMLInputElement;

    await fireEvent.input(username, { target: { value: 'demo' } });
    await fireEvent.input(password, { target: { value: 'demopass1' } });
    await fireEvent.input(confirm, { target: { value: 'demopass1' } });
    await fireEvent.click(submit);

    await waitFor(() => expect(get(isUnlocked)).toBe(true));
    expect(get(currentProfile)?.username).toBe('demo');
  });

  it('surfaces a validation error when passwords do not match', async () => {
    const { findByRole, getByLabelText, findByText } = render(LoginGate);
    await findByRole('button', { name: /Create Local Profile/i });

    const username = getByLabelText(/Username/i) as HTMLInputElement;
    const password = getByLabelText(/^Password$/) as HTMLInputElement;
    const confirm = getByLabelText(/Confirm Password/i) as HTMLInputElement;
    const submit = await findByRole('button', { name: /Create Local Profile/i });

    await fireEvent.input(username, { target: { value: 'demo' } });
    await fireEvent.input(password, { target: { value: 'demopass1' } });
    await fireEvent.input(confirm, { target: { value: 'different1' } });
    await fireEvent.click(submit);

    expect(await findByText(/Passwords do not match/i)).toBeTruthy();
    expect(get(isUnlocked)).toBe(false);
  });

  it('surfaces a validation error for short passwords', async () => {
    registering.set(true);
    const { findByRole, getByLabelText, findByText } = render(LoginGate);
    const submit = await findByRole('button', { name: /Create Local Profile/i });

    const username = getByLabelText(/Username/i) as HTMLInputElement;
    const password = getByLabelText(/^Password$/) as HTMLInputElement;
    const confirm = getByLabelText(/Confirm Password/i) as HTMLInputElement;

    await fireEvent.input(username, { target: { value: 'demo' } });
    await fireEvent.input(password, { target: { value: 'short1' } });
    await fireEvent.input(confirm, { target: { value: 'short1' } });
    await fireEvent.click(submit);

    expect(await findByText(/at least 8 characters/i)).toBeTruthy();
    expect(get(isUnlocked)).toBe(false);
  });

  it('toggle link switches between register and unlock modes', async () => {
    await register('demo', 'demopass1');
    logout();
    await tick();

    const { findByRole } = render(LoginGate);
    await findByRole('button', { name: /^Unlock$/ });
    const toggle = await findByRole('button', { name: /Create a new profile/i });
    await fireEvent.click(toggle);

    await findByRole('button', { name: /Create Local Profile/i });
  });
});

describe('LockoutNotice', () => {
  it('formats remaining time as mm:ss', () => {
    const { container } = render(LockoutNotice, { props: { remainingMs: 65_000 } });
    expect(container.textContent).toContain('1:05');
    expect(container.textContent?.toLowerCase()).toContain('temporarily locked');
  });

  it('zero-pads sub-ten seconds', () => {
    const { container } = render(LockoutNotice, { props: { remainingMs: 3_000 } });
    expect(container.textContent).toContain('0:03');
  });

  it('rounds partial seconds up', () => {
    const { container } = render(LockoutNotice, { props: { remainingMs: 1_500 } });
    expect(container.textContent).toContain('0:02');
  });
});

describe('ProfileBadge', () => {
  it('renders nothing when there is no unlocked profile', async () => {
    logout();
    await tick();
    const { container } = render(ProfileBadge);
    expect(container.textContent?.trim()).toBe('');
  });

  it('renders the current profile username and avatar initial', async () => {
    await register('Alice', 'demopass1');
    await tick();
    const { container } = render(ProfileBadge);
    expect(container.textContent).toContain('Alice');
    expect(container.textContent).toContain('A');
  });
});
