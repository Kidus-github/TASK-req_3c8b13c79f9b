/**
 * Card-editing UI coverage: CardEditor, CardList, CardDetail, CardDeleteConfirm,
 * CardConflictModal, CardRevisionTimeline.
 *
 * These exercise the real Svelte components against the real validation utils
 * and a fake-indexeddb-backed persistence stack. No UI modules are mocked.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';

import CardEditor from '../../src/components/cards/CardEditor.svelte';
import CardList from '../../src/components/cards/CardList.svelte';
import CardDetail from '../../src/components/cards/CardDetail.svelte';
import CardDeleteConfirm from '../../src/components/cards/CardDeleteConfirm.svelte';
import CardConflictModal from '../../src/components/cards/CardConflictModal.svelte';
import CardRevisionTimeline from '../../src/components/cards/CardRevisionTimeline.svelte';

import { type NebulaDB, setDbFactory } from '$lib/db/connection';
import { createTestDb, destroyTestDb } from '../helpers/db-factory';
import { register, logout } from '$lib/stores/auth.store';
import { createCard, updateCard } from '$lib/services/card.service';
import type { Card } from '$lib/types/card';

let testDb: NebulaDB;

function sampleCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 'card-1',
    profileId: 'profile-1',
    title: 'Sunset Over Mountains',
    body: 'A beautiful golden sunset',
    date: '2024-06-15',
    mood: 5,
    tags: ['nature', 'photo'],
    sourceImportId: null,
    sourceRowNumber: null,
    thumbnailId: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    deletedAt: null,
    version: 1,
    ...overrides,
  };
}

beforeEach(() => {
  testDb = createTestDb();
  setDbFactory(() => testDb);
});

afterEach(async () => {
  logout();
  setDbFactory(null);
  await destroyTestDb(testDb);
});

// Svelte 5 no longer supports `component.$on`, and createEventDispatcher()
// now delivers callbacks via the component's `events:` mount option rather
// than by dispatching DOM events. @testing-library/svelte passes `events`
// through to `mount`, so we can register handlers at render time.
function makeEvents(sink: Record<string, unknown[]>): Record<string, (e: CustomEvent) => void> {
  const out: Record<string, (e: CustomEvent) => void> = {};
  for (const name of Object.keys(sink)) {
    out[name] = (e: CustomEvent) => sink[name].push(e.detail);
  }
  return out;
}

describe('CardEditor', () => {
  it('prefills fields when editing an existing card', async () => {
    const { container } = render(CardEditor, { props: { card: sampleCard() } });
    const title = container.querySelector<HTMLInputElement>('#card-title');
    const body = container.querySelector<HTMLTextAreaElement>('#card-body');
    const mood = container.querySelector<HTMLInputElement>('#card-mood');
    expect(title?.value).toBe('Sunset Over Mountains');
    expect(body?.value).toContain('golden sunset');
    expect(mood?.value).toBe('5');
  });

  it('shows validation errors for an empty title on submit', async () => {
    const { container, findByText } = render(CardEditor);
    const title = container.querySelector<HTMLInputElement>('#card-title')!;
    const body = container.querySelector<HTMLTextAreaElement>('#card-body')!;
    await fireEvent.input(title, { target: { value: '' } });
    await fireEvent.input(body, { target: { value: '' } });
    const form = container.querySelector('form')!;
    await fireEvent.submit(form);
    expect(await findByText(/Title is required/i)).toBeTruthy();
    expect(await findByText(/Body is required/i)).toBeTruthy();
  });

  it('dispatches save with normalized draft when the form is valid', async () => {
    const sink: Record<string, unknown[]> = { save: [] };
    // @ts-expect-error `events` is a Svelte 5 mount option, not in TL types yet
    const { container } = render(CardEditor, { events: makeEvents(sink) });

    const title = container.querySelector<HTMLInputElement>('#card-title')!;
    const body = container.querySelector<HTMLTextAreaElement>('#card-body')!;
    const tags = container.querySelector<HTMLInputElement>('#card-tags')!;

    await fireEvent.input(title, { target: { value: 'Title' } });
    await fireEvent.input(body, { target: { value: 'A body' } });
    await fireEvent.input(tags, { target: { value: 'Alpha, BETA, alpha' } });
    const form = container.querySelector('form')!;
    await fireEvent.submit(form);

    await waitFor(() => expect(sink.save).toHaveLength(1));
    const detail = sink.save[0] as { draft: { tags: string[] } };
    // normalizeTags lowercases + dedupes
    expect(detail.draft.tags).toEqual(['alpha', 'beta']);
  });

  it('dispatches cancel when Cancel button is clicked', async () => {
    const sink: Record<string, unknown[]> = { cancel: [] };
    // @ts-expect-error `events` is a Svelte 5 mount option, not in TL types yet
    const { getByRole } = render(CardEditor, { events: makeEvents(sink) });
    await fireEvent.click(getByRole('button', { name: /Cancel/i }));
    expect(sink.cancel).toHaveLength(1);
  });
});

describe('CardList', () => {
  it('renders an empty-state when cards is empty', () => {
    const { getByText } = render(CardList, { props: { cards: [] } });
    expect(getByText(/No cards yet/)).toBeTruthy();
  });

  it('renders a button per card and dispatches select on click', async () => {
    const cards = [
      sampleCard({ id: 'a', title: 'Alpha' }),
      sampleCard({ id: 'b', title: 'Beta' }),
    ];
    const sink: Record<string, unknown[]> = { select: [] };
    // @ts-expect-error `events` is a Svelte 5 mount option
    const { getByText } = render(CardList, { props: { cards }, events: makeEvents(sink) });
    await fireEvent.click(getByText('Alpha'));
    await fireEvent.click(getByText('Beta'));
    expect((sink.select as Card[]).map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('shows overflow counter when a card has more than 3 tags', () => {
    const card = sampleCard({ tags: ['a', 'b', 'c', 'd', 'e'] });
    const { getByText } = render(CardList, { props: { cards: [card] } });
    expect(getByText('+2')).toBeTruthy();
  });
});

describe('CardDetail', () => {
  it('renders title, body, mood, and tags', () => {
    const { getByText, container } = render(CardDetail, { props: { card: sampleCard() } });
    expect(getByText('Sunset Over Mountains')).toBeTruthy();
    expect(getByText(/Mood: 5\/5/)).toBeTruthy();
    expect(container.textContent).toContain('nature');
  });

  it('dispatches close, edit, delete events', async () => {
    const sink: Record<string, unknown[]> = { close: [], edit: [], delete: [] };
    const { getByText, getByLabelText } = render(CardDetail, {
      props: { card: sampleCard() },
      // @ts-expect-error `events` is a Svelte 5 mount option
      events: makeEvents(sink),
    });
    await fireEvent.click(getByLabelText('Close'));
    await fireEvent.click(getByText('Edit'));
    await fireEvent.click(getByText('Delete'));
    expect(sink.close).toHaveLength(1);
    expect(sink.edit).toHaveLength(1);
    expect(sink.delete).toHaveLength(1);
  });
});

describe('CardDeleteConfirm', () => {
  it('renders the confirmation prompt with the card title', () => {
    const { getByText } = render(CardDeleteConfirm, { props: { card: sampleCard() } });
    expect(getByText(/Sunset Over Mountains/)).toBeTruthy();
    expect(getByText(/Delete Card\?/)).toBeTruthy();
  });

  it('dispatches confirm and cancel appropriately', async () => {
    const sink: Record<string, unknown[]> = { confirm: [], cancel: [] };
    const { getByText } = render(CardDeleteConfirm, {
      props: { card: sampleCard() },
      // @ts-expect-error `events` is a Svelte 5 mount option
      events: makeEvents(sink),
    });
    await fireEvent.click(getByText('Cancel'));
    await fireEvent.click(getByText('Delete'));
    expect(sink.cancel).toHaveLength(1);
    expect(sink.confirm).toHaveLength(1);
  });
});

describe('CardConflictModal', () => {
  it('renders current/expected version numbers', () => {
    const { container } = render(CardConflictModal, {
      props: { currentVersion: 7, expectedVersion: 5 },
    });
    expect(container.textContent).toContain('5');
    expect(container.textContent).toContain('7');
    expect(container.textContent).toContain('Version Conflict');
  });

  it('dispatches reload and cancel', async () => {
    const sink: Record<string, unknown[]> = { reload: [], cancel: [] };
    const { getByText } = render(CardConflictModal, {
      props: { currentVersion: 2, expectedVersion: 1 },
      // @ts-expect-error `events` is a Svelte 5 mount option
      events: makeEvents(sink),
    });
    await fireEvent.click(getByText('Reload Card'));
    await fireEvent.click(getByText('Cancel'));
    expect(sink.reload).toHaveLength(1);
    expect(sink.cancel).toHaveLength(1);
  });
});

describe('CardRevisionTimeline (end-to-end with real persistence)', () => {
  it('reflects a saved revision after an update', async () => {
    await register('demo', 'demopass1');
    const profile = await testDb.profiles.toCollection().first();
    const createResult = await createCard(profile!.id, {
      title: 'Initial',
      body: 'Body',
      date: '2024-06-15',
      mood: 3,
      tags: [],
    });
    if (!createResult.ok) throw new Error('create failed');
    const card = createResult.data;

    await updateCard(card.id, { ...card, title: 'Changed' }, card.version);

    const { container } = render(CardRevisionTimeline, { props: { cardId: card.id } });
    await waitFor(() => {
      expect(container.textContent?.toLowerCase()).toMatch(/revision|version|history/);
    });
  });
});
