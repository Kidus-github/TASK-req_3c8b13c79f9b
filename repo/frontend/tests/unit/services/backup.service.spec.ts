import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, destroyTestDb } from '../../helpers/db-factory';
import { type NebulaDB, setDbFactory } from '$lib/db/connection';
import * as backupService from '$lib/services/backup.service';
import * as cardService from '$lib/services/card.service';

let testDb: NebulaDB;
const PROFILE_ID = 'test-profile';

beforeEach(() => {
  testDb = createTestDb();
  setDbFactory(() => testDb);
});

afterEach(async () => {
  setDbFactory(null);
  await destroyTestDb(testDb);
});

async function blobToText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(blob);
  });
}

describe('backup.service', () => {
  describe('exportBackup', () => {
    it('exports backup as blob', async () => {
      await cardService.createCard(PROFILE_ID, {
        title: 'Test Card',
        body: 'Test body here',
        date: '2024-06-15',
        mood: 3,
        tags: ['test'],
      });

      const result = await backupService.exportBackup(PROFILE_ID);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toBeInstanceOf(Blob);
        expect(result.data.size).toBeGreaterThan(0);
      }
    });

    // Regression: the old implementation referenced `data.cards` while initializing
    // the `data` object literal (ReferenceError in strict mode / TDZ). The export
    // must succeed with zero throws even when the profile is empty.
    it('exports successfully for an empty profile without throwing', async () => {
      const result = await backupService.exportBackup(PROFILE_ID);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const text = await blobToText(result.data);
      const payload = JSON.parse(text);
      expect(payload.data.cards).toEqual([]);
      expect(payload.data.cardRevisions).toEqual([]);
    });

    it('derives cardRevisions strictly from the exported card set', async () => {
      const a = await cardService.createCard(PROFILE_ID, {
        title: 'Card A',
        body: 'Body A here',
        date: '2024-06-15',
        mood: 3,
        tags: [],
      });
      expect(a.ok).toBe(true);
      if (!a.ok) return;

      // Second profile with its own card + revision
      const otherProfile = 'other-profile';
      const b = await cardService.createCard(otherProfile, {
        title: 'Card B',
        body: 'Body B here',
        date: '2024-06-15',
        mood: 3,
        tags: [],
      });
      if (!b.ok) return;
      await cardService.updateCard(b.data.id, {
        title: 'Card B2',
        body: 'Body B2 here',
        date: '2024-06-15',
        mood: 3,
        tags: [],
      }, b.data.version);

      const result = await backupService.exportBackup(PROFILE_ID);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const payload = JSON.parse(await blobToText(result.data));
      const exportedCardIds = new Set(payload.data.cards.map((c: any) => c.id));
      expect(exportedCardIds.has(a.data.id)).toBe(true);
      expect(exportedCardIds.has(b.data.id)).toBe(false);
      for (const rev of payload.data.cardRevisions) {
        expect(exportedCardIds.has(rev.cardId)).toBe(true);
      }
    });

    it('exports encrypted backup', async () => {
      await cardService.createCard(PROFILE_ID, {
        title: 'Secret Card',
        body: 'Secret body xx',
        date: '2024-06-15',
        mood: 3,
        tags: ['secret'],
      });

      const result = await backupService.exportBackup(PROFILE_ID, 'mypassphrase');
      expect(result.ok).toBe(true);
      if (result.ok) {
        const text = await blobToText(result.data);
        const payload = JSON.parse(text);
        expect(payload.encrypted).toBe(true);
        expect(payload.encryptedData).toBeTruthy();
        expect(payload.data).toBeUndefined();
      }
    });
  });

  describe('validateBackup', () => {
    it('validates unencrypted backup', async () => {
      await cardService.createCard(PROFILE_ID, {
        title: 'Test Card',
        body: 'Test body here',
        date: '2024-06-15',
        mood: 3,
        tags: ['test'],
      });

      const exportResult = await backupService.exportBackup(PROFILE_ID);
      if (!exportResult.ok) return;

      const text = await blobToText(exportResult.data);
      const validateResult = await backupService.validateBackup(text);
      expect(validateResult.ok).toBe(true);
    });

    it('validates encrypted backup with correct passphrase', async () => {
      await cardService.createCard(PROFILE_ID, {
        title: 'Secret Card',
        body: 'Secret body xx',
        date: '2024-06-15',
        mood: 3,
        tags: [],
      });

      const exportResult = await backupService.exportBackup(PROFILE_ID, 'testpass1');
      if (!exportResult.ok) return;

      const text = await blobToText(exportResult.data);
      const result = await backupService.validateBackup(text, 'testpass1');
      expect(result.ok).toBe(true);
    });

    it('rejects encrypted backup with wrong passphrase', async () => {
      await cardService.createCard(PROFILE_ID, {
        title: 'Secret Card',
        body: 'Secret body xx',
        date: '2024-06-15',
        mood: 3,
        tags: [],
      });

      const exportResult = await backupService.exportBackup(PROFILE_ID, 'testpass1');
      if (!exportResult.ok) return;

      const text = await blobToText(exportResult.data);
      const result = await backupService.validateBackup(text, 'wrongpass');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('CRYPTO_FAIL');
      }
    });

    it('rejects invalid JSON', async () => {
      const result = await backupService.validateBackup('not json');
      expect(result.ok).toBe(false);
    });
  });

  describe('blob round-trip', () => {
    it('round-trips thumbnails through export -> validate -> restore', async () => {
      const created = await cardService.createCard(PROFILE_ID, {
        title: 'Thumb card',
        body: 'Card with a thumbnail',
        date: '2024-06-15',
        mood: 3,
        tags: [],
      }, { thumbnail: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }) });
      if (!created.ok) return;
      expect(created.data.thumbnailId).not.toBeNull();

      const exportResult = await backupService.exportBackup(PROFILE_ID);
      if (!exportResult.ok) return;
      const text = await blobToText(exportResult.data);
      const parsed = JSON.parse(text);
      expect(Array.isArray(parsed.data.thumbnails)).toBe(true);
      expect(parsed.data.thumbnails).toHaveLength(1);
      expect(parsed.data.thumbnails[0].base64.length).toBeGreaterThan(0);

      const validated = await backupService.validateBackup(text);
      expect(validated.ok).toBe(true);
      if (!validated.ok) return;

      // Clear the store and restore — the record (and blob size) should reappear.
      await testDb.thumbnails.clear();
      const result = await backupService.restoreBackup(PROFILE_ID, validated.data.data, 'replace');
      expect(result.ok).toBe(true);
      const rec = await testDb.thumbnails.where('cardId').equals(created.data.id).first();
      expect(rec).toBeDefined();
      expect(rec!.blob.size).toBe(3);
    });
  });

  describe('restoreBackup', () => {
    it('restores cards in replace mode', async () => {
      await cardService.createCard(PROFILE_ID, {
        title: 'Original',
        body: 'Original body x',
        date: '2024-06-15',
        mood: 3,
        tags: [],
      });

      const exportResult = await backupService.exportBackup(PROFILE_ID);
      if (!exportResult.ok) return;

      const text = await blobToText(exportResult.data);
      const validated = await backupService.validateBackup(text);
      if (!validated.ok) return;

      // Replace mode clears existing then inserts
      const result = await backupService.restoreBackup(PROFILE_ID, validated.data.data, 'replace');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.restored).toBeGreaterThan(0);
      }

      // Verify cards exist
      const cards = await testDb.cards.where('profileId').equals(PROFILE_ID).toArray();
      expect(cards.length).toBeGreaterThan(0);
    });
  });
});
