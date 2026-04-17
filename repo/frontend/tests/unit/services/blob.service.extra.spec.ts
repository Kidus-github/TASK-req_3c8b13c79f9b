import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { type NebulaDB, setDbFactory } from '$lib/db/connection';
import { createTestDb, destroyTestDb } from '../../helpers/db-factory';
import * as blobService from '$lib/services/blob.service';

let testDb: NebulaDB;
const PROFILE_ID = 'p';

beforeEach(() => {
  testDb = createTestDb();
  setDbFactory(() => testDb);
});

afterEach(async () => {
  setDbFactory(null);
  await destroyTestDb(testDb);
});

describe('blob.service helpers', () => {
  it('storeThumbnail uses fallback mimeType when blob.type is empty', async () => {
    const blob = new Blob([new Uint8Array([1])]);
    const rec = await blobService.storeThumbnail(PROFILE_ID, 'card-x', blob);
    expect(rec.mimeType).toBe('application/octet-stream');
  });

  it('getThumbnailForCard returns the first thumbnail for a card', async () => {
    const blob = new Blob([new Uint8Array([1, 2])], { type: 'image/png' });
    const rec = await blobService.storeThumbnail(PROFILE_ID, 'card-z', blob, 32, 32);
    const found = await blobService.getThumbnailForCard('card-z');
    expect(found?.id).toBe(rec.id);
  });

  it('deleteThumbnail removes a single record', async () => {
    const blob = new Blob([new Uint8Array([1])], { type: 'image/png' });
    const rec = await blobService.storeThumbnail(PROFILE_ID, 'cx', blob);
    await blobService.deleteThumbnail(rec.id);
    expect(await blobService.getThumbnail(rec.id)).toBeUndefined();
  });

  it('storeRawImportFile uses provided file name when given', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'text/csv' });
    const rec = await blobService.storeRawImportFile(PROFILE_ID, 'b1', blob, 'override.csv');
    expect(rec.fileName).toBe('override.csv');
  });

  it('storeRawImportFile falls back to "upload.bin" if no name and not a File', async () => {
    const blob = new Blob([new Uint8Array([1])]);
    const rec = await blobService.storeRawImportFile(PROFILE_ID, 'b2', blob);
    expect(rec.fileName).toBe('upload.bin');
  });

  it('getRawImportFilesForBatch returns all files for a batch', async () => {
    await blobService.storeRawImportFile(PROFILE_ID, 'batch-A', new Blob(['x'], { type: 'text/plain' }), 'a.txt');
    await blobService.storeRawImportFile(PROFILE_ID, 'batch-A', new Blob(['y'], { type: 'text/plain' }), 'b.txt');
    await blobService.storeRawImportFile(PROFILE_ID, 'batch-B', new Blob(['z'], { type: 'text/plain' }), 'c.txt');
    const files = await blobService.getRawImportFilesForBatch('batch-A');
    expect(files.length).toBe(2);
  });

  it('deleteRawImportFilesForBatch removes only that batch\'s files', async () => {
    await blobService.storeRawImportFile(PROFILE_ID, 'batch-X', new Blob(['x']), 'x.txt');
    await blobService.storeRawImportFile(PROFILE_ID, 'batch-Y', new Blob(['y']), 'y.txt');
    await blobService.deleteRawImportFilesForBatch('batch-X');
    expect(await blobService.getRawImportFilesForBatch('batch-X')).toHaveLength(0);
    expect(await blobService.getRawImportFilesForBatch('batch-Y')).toHaveLength(1);
  });
});
