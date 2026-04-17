import { getDb } from '$lib/db/connection';
import type { ImportBatch, ImportRowResult, DedupeMode, ImportRowError, ImportFileType } from '$lib/types/import';
import type { Card, CardDraft } from '$lib/types/card';
import { type AppResult, ok, err, ErrorCode } from '$lib/types/result';
import { generateId } from '$lib/utils/id';
import { normalizeTags } from '$lib/utils/validation';
import { createCard, updateCard } from './card.service';
import * as queueService from './worker-queue.service';
import { logAuditEvent } from './audit.service';
import { syncService } from './sync.service';
import { storeRawImportFile, deleteRawImportFilesForBatch } from './blob.service';
import type { RawRow, RowValidationResult, NormalizedCardRow } from '$lib/workers/protocol';
import { config } from '$lib/config';

export async function createImportBatch(
  profileId: string,
  fileName: string,
  fileType: ImportFileType,
  dedupeMode: DedupeMode = 'create_new',
  rawFile?: File | Blob
): Promise<ImportBatch> {
  const db = getDb();
  const id = generateId();
  let rawFileBlobId: string | null = null;

  if (rawFile) {
    const stored = await storeRawImportFile(profileId, id, rawFile, fileName);
    rawFileBlobId = stored.id;
  }

  const batch: ImportBatch = {
    id,
    profileId,
    fileName,
    fileType,
    status: 'draft',
    rowCount: 0,
    validRowCount: 0,
    invalidRowCount: 0,
    skippedRowCount: 0,
    startedAt: Date.now(),
    completedAt: null,
    cancelledAt: null,
    failureReason: null,
    rawFileBlobId,
    jobId: null,
    dedupeMode,
    overwriteMode: dedupeMode === 'overwrite_by_id',
  };
  await db.importBatches.add(batch);
  return batch;
}

export async function attachRawFileToBatch(
  batchId: string,
  file: File | Blob,
  fileName?: string
): Promise<AppResult<ImportBatch>> {
  const db = getDb();
  const batch = await db.importBatches.get(batchId);
  if (!batch) return err(ErrorCode.NOT_FOUND, 'Import batch not found');

  await deleteRawImportFilesForBatch(batchId);
  const stored = await storeRawImportFile(batch.profileId, batchId, file, fileName ?? batch.fileName);
  await db.importBatches.update(batchId, { rawFileBlobId: stored.id });
  const updated = await db.importBatches.get(batchId);
  return ok(updated!);
}

export async function storeValidationResults(
  batchId: string,
  results: RowValidationResult[],
  rawRows: RawRow[]
): Promise<void> {
  const db = getDb();

  let validCount = 0;
  let invalidCount = 0;

  const rowResults: ImportRowResult[] = results.map((r, i) => {
    if (r.valid) validCount++;
    else invalidCount++;

    return {
      id: generateId(),
      importBatchId: batchId,
      rowNumber: r.rowNumber,
      rawPayload: rawRows[i]?.data ?? {},
      normalizedPayload: r.normalized as unknown as Record<string, unknown> | null,
      status: r.valid ? 'valid' : 'invalid',
      errors: r.errors as ImportRowError[],
      warnings: r.warnings,
      resultCardId: null,
    };
  });

  await db.transaction('rw', db.importRowResults, db.importBatches, async () => {
    await db.importRowResults.bulkAdd(rowResults);
    await db.importBatches.update(batchId, {
      status: 'review',
      rowCount: results.length,
      validRowCount: validCount,
      invalidRowCount: invalidCount,
    });
  });
}

export async function getImportBatch(batchId: string): Promise<ImportBatch | undefined> {
  const db = getDb();
  return db.importBatches.get(batchId);
}

export async function getImportRows(
  batchId: string,
  statusFilter?: string
): Promise<ImportRowResult[]> {
  const db = getDb();
  const rows = await db.importRowResults
    .where('importBatchId')
    .equals(batchId)
    .toArray();

  if (statusFilter) {
    return rows.filter(r => r.status === statusFilter);
  }

  return rows.sort((a, b) => a.rowNumber - b.rowNumber);
}

interface ImportCommitDecision {
  rowId: string;
  rowNumber: number;
  action: 'create' | 'skip' | 'overwrite' | 'fail';
  normalized: NormalizedCardRow | null;
  targetCardId: string | null;
  reason?: string;
}

function readRawId(payload: Record<string, unknown> | null | undefined): string | null {
  if (!payload) return null;
  const raw = payload.id;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Route commit planning through the heavy-task worker so the Jobs monitor can
 * surface progress, errors, and cancellation state. DB writes stay on the
 * main thread (Dexie tables aren't structured-cloneable).
 */
export async function commitValidRows(
  batchId: string,
  profileId: string,
  dedupeMode: DedupeMode = 'create_new',
  opts: { onJobStart?: (jobId: string) => void } = {}
): Promise<AppResult<{ imported: number; skipped: number; failed: number; jobId?: string }>> {
  const db = getDb();
  const batch = await db.importBatches.get(batchId);

  if (!batch) return err(ErrorCode.NOT_FOUND, 'Import batch not found');
  if (batch.status !== 'review') return err(ErrorCode.VALIDATION, 'Batch not in review state');

  await db.importBatches.update(batchId, { status: 'committing' });

  const validRows = await db.importRowResults
    .where('importBatchId')
    .equals(batchId)
    .toArray()
    .then(rows => rows.filter(r => r.status === 'valid'));

  const existingCards = dedupeMode !== 'create_new'
    ? await db.cards.where('profileId').equals(profileId).toArray()
    : [];
  const cardsById = new Map(existingCards.map(c => [c.id, c]));

  // Pre-compute duplicate/id matches on the main thread — this is cheap and
  // avoids shipping the entire card table to the worker. `rawId` is the
  // raw `id` column from the import file (if any); `overwrite_by_id` matches
  // on that id against the current profile's cards.
  const workerRows = validRows.map(row => {
    const normalized = row.normalizedPayload as unknown as NormalizedCardRow | null;
    const rawId = readRawId(row.rawPayload);
    let existingDuplicateCardId: string | null = null;

    if (normalized && dedupeMode === 'skip_exact_duplicate') {
      const match = existingCards.find(card =>
        card.deletedAt === null &&
        card.title === normalized.title &&
        card.body === normalized.body &&
        card.date === normalized.date &&
        card.mood === normalized.mood &&
        JSON.stringify(normalizeTags(card.tags)) === JSON.stringify(normalizeTags(normalized.tags))
      );
      if (match) existingDuplicateCardId = match.id;
    } else if (normalized && dedupeMode === 'overwrite_by_id' && rawId) {
      const match = cardsById.get(rawId);
      if (match && match.deletedAt === null) existingDuplicateCardId = match.id;
    }

    return { rowId: row.id, rowNumber: row.rowNumber, normalized, existingDuplicateCardId, rawId };
  });

  // Worker decides create/skip/overwrite per row and reports progress.
  const { runJob } = await import('./queue-runner.service');
  let decisions: ImportCommitDecision[] = [];
  let jobId: string | undefined;
  try {
    const out = await runJob<{ decisions: ImportCommitDecision[]; count: number }>(
      'import_commit',
      { rows: workerRows, dedupeMode },
      { payloadRef: batchId, onStart: opts.onJobStart },
    );
    decisions = out.result.decisions;
    jobId = out.job.id;
    await db.importBatches.update(batchId, { jobId });
  } catch (e) {
    await db.importBatches.update(batchId, { status: 'failed', failureReason: (e as Error).message });
    return err(ErrorCode.WORKER_ERROR, `Commit worker failed: ${(e as Error).message}`);
  }

  let imported = 0;
  let skipped = 0;
  let failed = 0;

  for (const decision of decisions) {
    const row = validRows.find(r => r.id === decision.rowId);
    if (!row) continue;

    if (decision.action === 'fail' || !decision.normalized) {
      await db.importRowResults.update(row.id, {
        status: 'failed',
        errors: [...row.errors, { field: 'commit', message: decision.reason ?? 'unknown' }],
      });
      failed++;
      continue;
    }

    if (decision.action === 'skip') {
      await db.importRowResults.update(row.id, { status: 'skipped', resultCardId: decision.targetCardId });
      skipped++;
      continue;
    }

    const draft: CardDraft = {
      title: decision.normalized.title,
      body: decision.normalized.body,
      date: decision.normalized.date,
      mood: decision.normalized.mood,
      tags: decision.normalized.tags,
    };

    if (decision.action === 'overwrite' && decision.targetCardId) {
      // Refetch so we use the current version (optimistic lock). If the target
      // was deleted or version-bumped between planning and commit, updateCard
      // returns an error and we record the row as failed.
      const existing = await db.cards.get(decision.targetCardId);
      if (!existing || existing.deletedAt !== null) {
        await db.importRowResults.update(row.id, {
          status: 'failed',
          errors: [...row.errors, { field: 'commit', message: `Overwrite target ${decision.targetCardId} no longer exists` }],
        });
        failed++;
        continue;
      }

      const updateResult = await updateCard(
        decision.targetCardId,
        draft,
        existing.version,
        null,
        'import_overwrite',
      );
      if (updateResult.ok) {
        await db.importRowResults.update(row.id, {
          status: 'imported',
          resultCardId: decision.targetCardId,
        });
        imported++;
      } else {
        await db.importRowResults.update(row.id, {
          status: 'failed',
          errors: [...row.errors, { field: 'commit', message: updateResult.error.message }],
        });
        failed++;
      }
      continue;
    }

    const result = await createCard(profileId, draft, {
      importId: batchId,
      rowNumber: row.rowNumber,
    });

    if (result.ok) {
      await db.importRowResults.update(row.id, {
        status: 'imported',
        resultCardId: result.data.id,
      });
      imported++;
    } else {
      await db.importRowResults.update(row.id, {
        status: 'failed',
        errors: [...row.errors, { field: 'commit', message: result.error.message }],
      });
      failed++;
    }
  }

  const finalStatus = failed > 0 && imported === 0 ? 'failed' : 'completed';
  await db.importBatches.update(batchId, {
    status: finalStatus,
    completedAt: Date.now(),
    skippedRowCount: skipped,
  });

  await logAuditEvent('import_complete', profileId, { batchId, imported, skipped, failed });
  syncService.broadcastDataChanged('imports', [batchId]);

  return ok({ imported, skipped, failed, jobId });
}

export async function cancelImport(batchId: string): Promise<AppResult<void>> {
  const db = getDb();
  const batch = await db.importBatches.get(batchId);
  if (!batch) return err(ErrorCode.NOT_FOUND, 'Batch not found');

  if (batch.status === 'completed') {
    return err(ErrorCode.VALIDATION, 'Cannot cancel a completed import');
  }

  await db.importBatches.update(batchId, {
    status: 'cancelled',
    cancelledAt: Date.now(),
  });
  // Raw file is kept on cancel so the user can retry; explicit delete removes it.
  return ok(undefined);
}

export async function deleteImportBatch(batchId: string): Promise<AppResult<void>> {
  const db = getDb();
  const batch = await db.importBatches.get(batchId);
  if (!batch) return err(ErrorCode.NOT_FOUND, 'Batch not found');
  await deleteRawImportFilesForBatch(batchId);
  await db.importRowResults.where('importBatchId').equals(batchId).delete();
  await db.importBatches.delete(batchId);
  return ok(undefined);
}

export async function listImportBatches(profileId: string): Promise<ImportBatch[]> {
  const db = getDb();
  return db.importBatches
    .where('profileId')
    .equals(profileId)
    .reverse()
    .sortBy('startedAt');
}

export async function generateErrorLog(batchId: string): Promise<string> {
  const rows = await getImportRows(batchId, 'invalid');
  const failedRows = await getImportRows(batchId, 'failed');
  const allErrors = [...rows, ...failedRows];

  return allErrors.map(r => JSON.stringify({
    rowNumber: r.rowNumber,
    status: r.status,
    errors: r.errors,
    warnings: r.warnings,
  })).join('\n');
}

// Re-export the runtime max-row limit so UIs can read the single source of truth.
export function getMaxImportRows(): number {
  return config.maxImportRows;
}
