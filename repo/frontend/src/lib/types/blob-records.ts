/**
 * IndexedDB-persisted records for binary artifacts that cards and import
 * batches link to by id. Blobs are stored inline so they survive reloads and
 * can be round-tripped through backup/restore.
 */

export interface ThumbnailRecord {
  id: string;
  profileId: string;
  cardId: string;
  mimeType: string;
  width: number;
  height: number;
  blob: Blob;
  createdAt: number;
}

export interface RawImportFileRecord {
  id: string;
  profileId: string;
  importBatchId: string;
  fileName: string;
  mimeType: string;
  size: number;
  blob: Blob;
  createdAt: number;
}

export interface SerializedBlobRecord<K extends 'thumbnail' | 'rawFile'> {
  kind: K;
  id: string;
  profileId: string;
  mimeType: string;
  base64: string;
  size: number;
  createdAt: number;
  meta: Record<string, unknown>;
}

export type SerializedThumbnail = SerializedBlobRecord<'thumbnail'>;
export type SerializedRawFile = SerializedBlobRecord<'rawFile'>;
