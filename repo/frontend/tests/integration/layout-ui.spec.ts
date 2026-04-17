/**
 * UI coverage for Topbar and Toaster components.
 *
 * Topbar pulls username from the auth store; we register a real profile against
 * a fake-indexeddb DB so the test runs the actual unlocked branch. Toaster is
 * driven by the real toast store.
 *
 * Tests cover rendering, interactions (logout, dismiss), and edge cases
 * (locked state, non-dismissible toast, multiple toasts).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';

import Topbar from '../../src/components/layout/Topbar.svelte';
import Toaster from '../../src/components/layout/Toaster.svelte';

import { type NebulaDB, setDbFactory } from '$lib/db/connection';
import { createTestDb, destroyTestDb } from '../helpers/db-factory';
import { register, logout, currentProfile } from '$lib/stores/auth.store';
import { pushToast, dismissToast, clearToasts, toasts } from '$lib/stores/toast.store';

let testDb: NebulaDB;

beforeEach(() => {
  testDb = createTestDb();
  setDbFactory(() => testDb);
  clearToasts();
});

afterEach(async () => {
  logout();
  setDbFactory(null);
  await destroyTestDb(testDb);
  clearToasts();
});

describe('Topbar', () => {
  it('renders the NebulaForge brand always', () => {
    const { getByText } = render(Topbar);
    expect(getByText('NebulaForge')).toBeTruthy();
  });

  it('edge case: locked state hides username and Lock button', () => {
    const { container } = render(Topbar);
    expect(container.querySelector('[data-testid="topbar"]')).toBeTruthy();
    expect(container.textContent).not.toMatch(/Lock/);
  });

  it('shows username and a Lock button when a profile is unlocked', async () => {
    await register('demo', 'demopass1');
    const profile = get(currentProfile);
    expect(profile?.username).toBe('demo');

    const { container, findByText } = render(Topbar);
    expect(await findByText('demo')).toBeTruthy();
    expect(await findByText('Lock')).toBeTruthy();
    expect(container.querySelector('[data-testid="topbar"]')).toBeTruthy();
  });

  it('clicking Lock invokes logout (clears the current profile)', async () => {
    await register('demo', 'demopass1');
    const { findByText } = render(Topbar);
    const lock = await findByText('Lock');
    await fireEvent.click(lock);
    await waitFor(() => {
      expect(get(currentProfile)).toBeNull();
    });
  });
});

describe('Toaster', () => {
  it('renders nothing when there are no toasts', () => {
    const { container } = render(Toaster);
    // The wrapper exists but has no toast children
    expect(container.querySelectorAll('[role="alert"]').length).toBe(0);
  });

  it('renders an alert per toast and applies type-based color class', async () => {
    pushToast('Hello world', 'info', 0);
    pushToast('Saved', 'success', 0);
    const { container } = render(Toaster);
    await waitFor(() => {
      const alerts = container.querySelectorAll('[role="alert"]');
      expect(alerts.length).toBe(2);
    });
    expect(container.textContent).toContain('Hello world');
    expect(container.textContent).toContain('Saved');
    // Color classes from typeColors map
    expect(container.innerHTML).toContain('bg-blue-600');
    expect(container.innerHTML).toContain('bg-green-600');
  });

  it('clicking the dismiss button removes the toast from the store', async () => {
    pushToast('Dismiss me', 'warning', 0);
    const { container } = render(Toaster);
    await waitFor(() => expect(container.querySelectorAll('[role="alert"]').length).toBe(1));

    const dismissBtn = container.querySelector('button[aria-label="Dismiss"]') as HTMLButtonElement;
    expect(dismissBtn).toBeTruthy();
    await fireEvent.click(dismissBtn);
    await waitFor(() => {
      expect(get(toasts).length).toBe(0);
      expect(container.querySelectorAll('[role="alert"]').length).toBe(0);
    });
  });

  it('edge case: non-dismissible toast hides the dismiss button', async () => {
    pushToast('Sticky', 'error', 0, false);
    const { container } = render(Toaster);
    await waitFor(() => expect(container.querySelectorAll('[role="alert"]').length).toBe(1));
    expect(container.querySelector('button[aria-label="Dismiss"]')).toBeNull();
  });

  it('edge case: dismissToast called with unknown id is a no-op', async () => {
    pushToast('Stay', 'info', 0);
    const before = get(toasts).length;
    dismissToast('toast-does-not-exist');
    expect(get(toasts).length).toBe(before);
  });
});
