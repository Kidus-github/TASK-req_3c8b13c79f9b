export type ImportFileType = 'csv' | 'json' | 'html_snapshot' | 'json_snapshot';
export type ImportStatus = 'draft' | 'validating' | 'review' | 'committing' | 'completed' | 'failed' | 'cancelled';
export type ImportRowStatus = 'valid' | 'invalid' | 'imported' | 'skipped' | 'failed';
export type DedupeMode = 'create_new' | 'skip_exact_duplicate' | 'overwrite_by_id';

export interface ImportBatch {
  id: string;
  profileId: string;
  fileName: string;
  fileType: ImportFileType;
  status: ImportStatus;
  rowCount: number;
  validRowCount: number;
  invalidRowCount: number;
  skippedRowCount: number;
  startedAt: number;
  completedAt: number | null;
  cancelledAt: number | null;
  failureReason: string | null;
  rawFileBlobId: string | null;
  jobId: string | null;
  dedupeMode: DedupeMode;
  overwriteMode: boolean;
}

export interface ImportRowResult {
  id: string;
  importBatchId: string;
  rowNumber: number;
  rawPayload: Record<string, unknown>;
  normalizedPayload: Record<string, unknown> | null;
  status: ImportRowStatus;
  errors: ImportRowError[];
  warnings: string[];
  resultCardId: string | null;
}

export interface ImportRowError {
  field: string;
  message: string;
}

export interface ColumnMapping {
  sourceColumn: string;
  targetField: string;
}
