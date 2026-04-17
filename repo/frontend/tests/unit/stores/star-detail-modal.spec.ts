import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import CardDetailModal from '../../../src/components/cards/CardDetailModal.svelte';
import type { Card } from '$lib/types/card';

function makeCard(partial: Partial<Card> = {}): Card {
  return {
    id: 'card-1',
    profileId: 'p',
    title: 'Test Star',
    body: 'Body content',
    date: '2024-06-15',
    mood: 3,
    tags: [],
    sourceImportId: null,
    sourceRowNumber: null,
    thumbnailId: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    deletedAt: null,
    version: 1,
    ...partial,
  };
}

describe('CardDetailModal (star detail)', () => {
  it('renders a dialog with aria-modal and the card title', () => {
    const { getByRole, getByText } = render(CardDetailModal, { props: { card: makeCard() } });
    const dialog = getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(getByText('Test Star')).toBeTruthy();
  });

  it('emits close when backdrop is clicked', async () => {
    const events: unknown[] = [];
    const { getByRole } = render(CardDetailModal, {
      props: { card: makeCard() },
      // @ts-expect-error Svelte 5 mount option
      events: { close: () => events.push('close') },
    });
    await fireEvent.click(getByRole('dialog'));
    expect(events).toEqual(['close']);
  });

  it('emits edit and delete events from the detail body', async () => {
    const events: string[] = [];
    const { getByText } = render(CardDetailModal, {
      props: { card: makeCard() },
      // @ts-expect-error Svelte 5 mount option
      events: {
        edit: () => events.push('edit'),
        delete: () => events.push('delete'),
      },
    });
    await fireEvent.click(getByText('Edit'));
    await fireEvent.click(getByText('Delete'));
    expect(events).toEqual(['edit', 'delete']);
  });
});
