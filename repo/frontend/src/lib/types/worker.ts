export type JobType =
  | 'import_parse_validate'
  | 'import_commit'
  | 'index_rebuild'
  | 'effect_precompute'
  | 'parser_canary'
  | 'parser_full_extract'
  | 'backup_export'
  | 'backup_import'
  | 'log_export';

export type JobStatus =
  | 'queued'
  | 'running'
  | 'cancelling'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'interrupted';

export interface WorkerJob {
  id: string;
  type: JobType;
  status: JobStatus;
  priority: number;
  progressPercent: number;
  startedAt: number | null;
  completedAt: number | null;
  cancelRequestedAt: number | null;
  cancelledAt: number | null;
  failureCount: number;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  throughputMetric: number | null;
  payloadRef: string | null;
  resultRef: string | null;
}

export interface WorkerJobLog {
  id: string;
  jobId: string;
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'debug';
  code: string;
  message: string;
  details?: unknown;
}

export interface MonitorMetricSnapshot {
  id: string;
  jobType: JobType;
  windowStart: number;
  windowEnd: number;
  lastRunTime: number;
  averageThroughput: number;
  failureCount: number;
  cancelCount: number;
  successCount: number;
}
