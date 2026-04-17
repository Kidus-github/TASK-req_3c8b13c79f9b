import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, destroyTestDb } from '../../helpers/db-factory';
import { type NebulaDB, setDbFactory } from '$lib/db/connection';
import * as blobService from '$lib/services/blob.service';
import * as cardService from '$lib/services/card.service';
import * as importService from '$lib/services/import.service';

let testDb: NebulaDB;
const PROFILE_ID = 'blob-profile';

beforeEach(() => {
  testDb = createTestDb();
  setDbFactory(() => testDb);
});

afterEach(async () => {
  setDbFactory(null);
  await destroyTestDb(testDb);
});

describe('blob.service', () => {
  it('exposes thumbnail and raw-file Dexie tables', () => {
    expect(testDb.thumbnails).toBeDefined();
    expect(testDb.rawImportFiles).toBeDefined();
  });

  it('persists a thumbnail linked to a card and exposes it on retrieval', async () => {
    const created = await cardService.createCard(PROFILE_ID, {
      title: 'Thumb host',
      body: 'Card with thumbnail attached',
      date: '2024-06-15',
      mood: 3,
      tags: [],
    }, {
      thumbnail: new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' }),
      thumbnailWidth: 100,
      thumbnailHeight: 80,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    expect(created.data.thumbnailId).not.toBeNull();
    const rec = await blobService.getThumbnail(created.data.thumbnailId!);
    expect(rec).toBeDefined();
    expect(rec!.cardId).toBe(created.data.id);
    expect(rec!.mimeType).toBe('image/png');
    expect(rec!.width).toBe(100);
    expect(rec!.blob.size).toBe(4);
  });

  it('persists raw import files with a batch link', async () => {
    const fileBytes = new Uint8Array([104, 105]); // "hi"
    const file = new Blob([fileBytes], { type: 'text/csv' });
    const batch = await importService.createImportBatch(PROFILE_ID, 'in.csv', 'csv', 'create_new', file);

    expect(batch.rawFileBlobId).not.toBeNull();
    const rec = await blobService.getRawImportFile(batch.rawFileBlobId!);
    expect(rec).toBeDefined();
    expect(rec!.importBatchId).toBe(batch.id);
    expect(rec!.fileName).toBe('in.csv');
    expect(rec!.blob.size).toBe(2);
  });

  it('removes linked thumbnails when a card is soft-deleted', async () => {
    const created = await cardService.createCard(PROFILE_ID, {
      title: 'Doomed card',
      body: 'Will be deleted soon',
      date: '2024-06-15',
      mood: 3,
      tags: [],
    }, { thumbnail: new Blob([new Uint8Array([9, 9, 9])], { type: 'image/png' }) });
    if (!created.ok) return;
    expect(created.data.thumbnailId).not.toBeNull();

    await cardService.softDeleteCard(created.data.id);
    const orphans = await testDb.thumbnails.where('cardId').equals(created.data.id).toArray();
    expect(orphans).toHaveLength(0);
  });

  it('round-trips thumbnail base64 through serialize/restore', async () => {
    const created = await cardService.createCard(PROFILE_ID, {
      title: 'Roundtrip',
      body: 'For backup restore',
      date: '2024-06-15',
      mood: 3,
      tags: [],
    }, { thumbnail: new Blob([new Uint8Array([5, 6, 7, 8, 9])], { type: 'image/jpeg' }) });
    if (!created.ok) return;

    const serialized = await blobService.serializeThumbnails(PROFILE_ID);
    expect(serialized).toHaveLength(1);

    await testDb.thumbnails.clear();
    const restored = await blobService.restoreThumbnails(PROFILE_ID, serialized);
    expect(restored).toBe(1);

    const rec = await testDb.thumbnails.get(serialized[0].id);
    expect(rec).toBeDefined();
    expect(rec!.blob.size).toBe(5);
    expect(rec!.mimeType).toBe('image/jpeg');
  });
});
