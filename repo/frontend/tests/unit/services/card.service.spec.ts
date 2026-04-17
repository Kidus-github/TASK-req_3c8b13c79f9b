import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, destroyTestDb } from '../../helpers/db-factory';
import { type NebulaDB, setDbFactory } from '$lib/db/connection';
import {
  createCard,
  updateCard,
  softDeleteCard,
  restoreCard,
  listActiveCards,
  getCardRevisions,
} from '$lib/services/card.service';
import type { CardDraft } from '$lib/types/card';

let testDb: NebulaDB;

beforeEach(() => {
  testDb = createTestDb();
  setDbFactory(() => testDb);
});

afterEach(async () => {
  setDbFactory(null);
  await destroyTestDb(testDb);
});

const PROFILE_ID = 'test-profile-id';

function validDraft(overrides: Partial<CardDraft> = {}): CardDraft {
  return {
    title: 'My Inspiration',
    body: 'A beautiful sunset over the ocean',
    date: '2024-06-15',
    mood: 4,
    tags: ['nature', 'photography'],
    ...overrides,
  };
}

describe('card.service', () => {
  describe('createCard', () => {
    it('creates a card with valid data', async () => {
      const result = await createCard(PROFILE_ID, validDraft());
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.title).toBe('My Inspiration');
        expect(result.data.body).toBe('A beautiful sunset over the ocean');
        expect(result.data.date).toBe('2024-06-15');
        expect(result.data.mood).toBe(4);
        expect(result.data.tags).toEqual(['nature', 'photography']);
        expect(result.data.version).toBe(1);
        expect(result.data.deletedAt).toBeNull();
        expect(result.data.profileId).toBe(PROFILE_ID);
      }
    });

    it('normalizes tags', async () => {
      const result = await createCard(PROFILE_ID, validDraft({ tags: ['  Design ', 'DESIGN', 'color'] }));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.tags).toEqual(['design', 'color']);
      }
    });

    it('trims title and body', async () => {
      const result = await createCard(PROFILE_ID, validDraft({ title: '  Hello  ', body: '  World  ' }));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.title).toBe('Hello');
        expect(result.data.body).toBe('World');
      }
    });

    it('rejects invalid card data', async () => {
      const result = await createCard(PROFILE_ID, validDraft({ title: '' }));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('VALIDATION');
      }
    });
  });

  describe('updateCard', () => {
    it('updates card and creates revision', async () => {
      const created = await createCard(PROFILE_ID, validDraft());
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const updated = await updateCard(
        created.data.id,
        validDraft({ title: 'Updated Title', mood: 5 }),
        1
      );
      expect(updated.ok).toBe(true);
      if (!updated.ok) return;

      expect(updated.data.title).toBe('Updated Title');
      expect(updated.data.mood).toBe(5);
      expect(updated.data.version).toBe(2);

      const revisions = await getCardRevisions(created.data.id);
      expect(revisions).toHaveLength(1);
      expect(revisions[0].version).toBe(2);
      expect(revisions[0].beforeSnapshot.title).toBe('My Inspiration');
      expect(revisions[0].afterSnapshot.title).toBe('Updated Title');
    });

    it('rejects update with wrong version (conflict)', async () => {
      const created = await createCard(PROFILE_ID, validDraft());
      if (!created.ok) return;

      const result = await updateCard(
        created.data.id,
        validDraft({ title: 'Conflict' }),
        99
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('CONFLICT');
      }
    });

    it('rejects update on deleted card', async () => {
      const created = await createCard(PROFILE_ID, validDraft());
      if (!created.ok) return;

      await softDeleteCard(created.data.id);
      const result = await updateCard(
        created.data.id,
        validDraft({ title: 'Edit Deleted' }),
        1
      );
      expect(result.ok).toBe(false);
    });
  });

  describe('softDeleteCard', () => {
    it('soft deletes a card', async () => {
      const created = await createCard(PROFILE_ID, validDraft());
      if (!created.ok) return;

      const deleted = await softDeleteCard(created.data.id);
      expect(deleted.ok).toBe(true);
      if (deleted.ok) {
        expect(deleted.data.deletedAt).toBeTruthy();
      }

      const active = await listActiveCards(PROFILE_ID);
      expect(active.find(c => c.id === created.data.id)).toBeUndefined();
    });

    it('rejects double delete', async () => {
      const created = await createCard(PROFILE_ID, validDraft());
      if (!created.ok) return;

      await softDeleteCard(created.data.id);
      const result = await softDeleteCard(created.data.id);
      expect(result.ok).toBe(false);
    });
  });

  describe('restoreCard', () => {
    it('restores a deleted card', async () => {
      const created = await createCard(PROFILE_ID, validDraft());
      if (!created.ok) return;

      await softDeleteCard(created.data.id);
      const restored = await restoreCard(created.data.id);
      expect(restored.ok).toBe(true);
      if (restored.ok) {
        expect(restored.data.deletedAt).toBeNull();
        expect(restored.data.version).toBe(2);
      }

      const active = await listActiveCards(PROFILE_ID);
      expect(active.find(c => c.id === created.data.id)).toBeTruthy();
    });

    it('creates revision on restore', async () => {
      const created = await createCard(PROFILE_ID, validDraft());
      if (!created.ok) return;

      await softDeleteCard(created.data.id);
      await restoreCard(created.data.id);

      const revisions = await getCardRevisions(created.data.id);
      expect(revisions).toHaveLength(1);
      expect(revisions[0].editSource).toBe('restore');
    });

    it('rejects restore on non-deleted card', async () => {
      const created = await createCard(PROFILE_ID, validDraft());
      if (!created.ok) return;

      const result = await restoreCard(created.data.id);
      expect(result.ok).toBe(false);
    });
  });

  describe('listActiveCards', () => {
    it('returns only non-deleted cards', async () => {
      await createCard(PROFILE_ID, validDraft({ title: 'Card A' }));
      const b = await createCard(PROFILE_ID, validDraft({ title: 'Card B' }));
      await createCard(PROFILE_ID, validDraft({ title: 'Card C' }));

      if (b.ok) await softDeleteCard(b.data.id);

      const active = await listActiveCards(PROFILE_ID);
      expect(active).toHaveLength(2);
      expect(active.map(c => c.title).sort()).toEqual(['Card A', 'Card C']);
    });
  });
});
