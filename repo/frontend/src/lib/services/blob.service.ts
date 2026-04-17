import { getDb } from '$lib/db/connection';
import type {
  ThumbnailRecord,
  RawImportFileRecord,
  SerializedThumbnail,
  SerializedRawFile,
} from '$lib/types/blob-records';
import { generateId } from '$lib/utils/id';

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
  return btoa(out);
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

export async function storeThumbnail(
  profileId: string,
  cardId: string,
  blob: Blob,
  width = 0,
  height = 0,
): Promise<ThumbnailRecord> {
  const db = getDb();
  const record: ThumbnailRecord = {
    id: generateId(),
    profileId,
    cardId,
    mimeType: blob.type || 'application/octet-stream',
    width,
    height,
    blob,
    createdAt: Date.now(),
  };
  await db.thumbnails.add(record);
  return record;
}

export async function getThumbnail(id: string): Promise<ThumbnailRecord | undefined> {
  return getDb().thumbnails.get(id);
}

export async function getThumbnailForCard(cardId: string): Promise<ThumbnailRecord | undefined> {
  return getDb().thumbnails.where('cardId').equals(cardId).first();
}

export async function deleteThumbnail(id: string): Promise<void> {
  await getDb().thumbnails.delete(id);
}

export async function deleteThumbnailsForCard(cardId: string): Promise<void> {
  const db = getDb();
  const records = await db.thumbnails.where('cardId').equals(cardId).toArray();
  for (const r of records) await db.thumbnails.delete(r.id);
}

export async function storeRawImportFile(
  profileId: string,
  importBatchId: string,
  file: File | Blob,
  fileName?: string,
): Promise<RawImportFileRecord> {
  const db = getDb();
  const record: RawImportFileRecord = {
    id: generateId(),
    profileId,
    importBatchId,
    fileName: fileName ?? (file as File).name ?? 'upload.bin',
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    blob: file,
    createdAt: Date.now(),
  };
  await db.rawImportFiles.add(record);
  return record;
}

export async function getRawImportFile(id: string): Promise<RawImportFileRecord | undefined> {
  return getDb().rawImportFiles.get(id);
}

export async function getRawImportFilesForBatch(batchId: string): Promise<RawImportFileRecord[]> {
  return getDb().rawImportFiles.where('importBatchId').equals(batchId).toArray();
}

export async function deleteRawImportFilesForBatch(batchId: string): Promise<void> {
  const db = getDb();
  const records = await db.rawImportFiles.where('importBatchId').equals(batchId).toArray();
  for (const r of records) await db.rawImportFiles.delete(r.id);
}

export async function serializeThumbnails(profileId: string): Promise<SerializedThumbnail[]> {
  const db = getDb();
  const records = await db.thumbnails.where('profileId').equals(profileId).toArray();
  const out: SerializedThumbnail[] = [];
  for (const r of records) {
    out.push({
      kind: 'thumbnail',
      id: r.id,
      profileId: r.profileId,
      mimeType: r.mimeType,
      base64: await blobToBase64(r.blob),
      size: r.blob.size,
      createdAt: r.createdAt,
      meta: { cardId: r.cardId, width: r.width, height: r.height },
    });
  }
  return out;
}

export async function serializeRawImportFiles(profileId: string): Promise<SerializedRawFile[]> {
  const db = getDb();
  const records = await db.rawImportFiles.where('profileId').equals(profileId).toArray();
  const out: SerializedRawFile[] = [];
  for (const r of records) {
    out.push({
      kind: 'rawFile',
      id: r.id,
      profileId: r.profileId,
      mimeType: r.mimeType,
      base64: await blobToBase64(r.blob),
      size: r.size,
      createdAt: r.createdAt,
      meta: { importBatchId: r.importBatchId, fileName: r.fileName },
    });
  }
  return out;
}

export async function restoreThumbnails(
  profileId: string,
  records: SerializedThumbnail[],
): Promise<number> {
  const db = getDb();
  let restored = 0;
  for (const s of records) {
    if (s.kind !== 'thumbnail') continue;
    const meta = s.meta ?? {};
    const rec: ThumbnailRecord = {
      id: s.id,
      profileId,
      cardId: String(meta.cardId ?? ''),
      mimeType: s.mimeType,
      width: Number(meta.width ?? 0),
      height: Number(meta.height ?? 0),
      blob: base64ToBlob(s.base64, s.mimeType),
      createdAt: s.createdAt,
    };
    try { await db.thumbnails.put(rec); restored++; } catch { /* skip */ }
  }
  return restored;
}

export async function restoreRawImportFiles(
  profileId: string,
  records: SerializedRawFile[],
): Promise<number> {
  const db = getDb();
  let restored = 0;
  for (const s of records) {
    if (s.kind !== 'rawFile') continue;
    const meta = s.meta ?? {};
    const rec: RawImportFileRecord = {
      id: s.id,
      profileId,
      importBatchId: String(meta.importBatchId ?? ''),
      fileName: String(meta.fileName ?? 'upload.bin'),
      mimeType: s.mimeType,
      size: s.size,
      blob: base64ToBlob(s.base64, s.mimeType),
      createdAt: s.createdAt,
    };
    try { await db.rawImportFiles.put(rec); restored++; } catch { /* skip */ }
  }
  return restored;
}
