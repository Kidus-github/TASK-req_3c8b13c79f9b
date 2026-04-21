import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';

import CardEditModal from '../../src/components/cards/CardEditModal.svelte';
import SimultaneousEditWarning from '../../src/components/cards/SimultaneousEditWarning.svelte';

import { type NebulaDB, setDbFactory } from '$lib/db/connection';
import { createTestDb, destroyTestDb } from '../helpers/db-factory';
import { register, logout } from '$lib/stores/auth.store';
import { createCard } from '$lib/services/card.service';
import { syncService } from '$lib/services/sync.service';

let testDb: NebulaDB;

function makeEvents(sink: Record<string, unknown[]>): Record<string, (e: CustomEvent) => void> {
  const out: Record<string, (e: CustomEvent) => void> = {};
  for (const name of Object.keys(sink)) {
    out[name] = (e: CustomEvent) => sink[name].push(e.detail);
  }
  return out;
}

beforeEach(async () => {
  testDb = createTestDb();
  setDbFactory(() => testDb);
  await register('demo', 'demopass1');
});

afterEach(async () => {
  logout();
  syncService.destroy();
  setDbFactory(null);
  await destroyTestDb(testDb);
  vi.restoreAllMocks();
});

describe('CardEditModal', () => {
  it('edit mode saves via the real card store path and emits saved/close', async () => {
    const profile = await testDb.profiles.toCollection().first();
    const created = await createCard(profile!.id, {
      title: 'Original title',
      body: 'Original body text',
      date: '2024-06-15',
      mood: 4,
      tags: ['alpha'],
    });
    if (!created.ok) throw new Error('card seed failed');

    const lockSpy = vi.spyOn(syncService, 'broadcastEditLock');
    const unlockSpy = vi.spyOn(syncService, 'broadcastEditUnlock');
    const sink: Record<string, unknown[]> = { saved: [], close: [] };

    const view = render(CardEditModal, {
      props: { card: created.data, mode: 'edit' },
      // @ts-expect-error Svelte 5 mount option
      events: makeEvents(sink),
    });

    expect(lockSpy).toHaveBeenCalledWith(created.data.id);

    const title = view.container.querySelector<HTMLInputElement>('#card-title');
    expect(title).toBeTruthy();
    await fireEvent.input(title!, { target: { value: 'Updated title' } });
    await fireEvent.submit(view.container.querySelector('form')!);

    await waitFor(() => expect(sink.saved).toHaveLength(1));
    expect(sink.close).toHaveLength(1);
    expect((sink.saved[0] as { title: string }).title).toBe('Updated title');

    view.unmount();
    expect(unlockSpy).toHaveBeenCalledWith(created.data.id);
  });

  it('delete mode removes the card and emits deleted/close', async () => {
    const profile = await testDb.profiles.toCollection().first();
    const created = await createCard(profile!.id, {
      title: 'Delete me',
      body: 'Delete body',
      date: '2024-06-15',
      mood: 3,
      tags: [],
    });
    if (!created.ok) throw new Error('card seed failed');

    const sink: Record<string, unknown[]> = { deleted: [], close: [] };
    const { getByText } = render(CardEditModal, {
      props: { card: created.data, mode: 'delete' },
      // @ts-expect-error Svelte 5 mount option
      events: makeEvents(sink),
    });

    await fireEvent.click(getByText('Delete'));

    await waitFor(() => expect(sink.deleted).toHaveLength(1));
    expect(sink.close).toHaveLength(1);

    const stored = await testDb.cards.get(created.data.id);
    expect(stored?.deletedAt).not.toBeNull();
  });
});

describe('SimultaneousEditWarning', () => {
  it('appears for remote locks on the same card and clears on unlock', async () => {
    const { container, queryByText } = render(SimultaneousEditWarning, {
      props: { cardId: 'card-1' },
    });

    expect(queryByText(/another tab is editing this card/i)).toBeNull();

    syncService.__injectMessage({
      type: 'EDIT_LOCK',
      tabId: 'other-tab',
      timestamp: Date.now(),
      payload: { cardId: 'card-1' },
    });

    await waitFor(() => {
      expect(container.textContent).toMatch(/another tab is editing this card/i);
    });

    syncService.__injectMessage({
      type: 'EDIT_UNLOCK',
      tabId: 'other-tab',
      timestamp: Date.now(),
      payload: { cardId: 'card-1' },
    });

    await waitFor(() => {
      expect(queryByText(/another tab is editing this card/i)).toBeNull();
    });
  });
});
