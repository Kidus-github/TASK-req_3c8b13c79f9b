import { getDb } from '$lib/db/connection';
import type { WorkerJob, WorkerJobLog, JobType, JobStatus, MonitorMetricSnapshot } from '$lib/types/worker';
import { type AppResult, ok, err, ErrorCode } from '$lib/types/result';
import { generateId } from '$lib/utils/id';

// Monotonic timestamp source for job logs. Two consecutive addJobLog() calls
// inside the same millisecond would otherwise share a timestamp; sortBy then
// breaks ties by primary key (random id), scrambling insertion order.
let lastLogTimestamp = 0;
function nextLogTimestamp(): number {
  lastLogTimestamp = Math.max(Date.now(), lastLogTimestamp + 1);
  return lastLogTimestamp;
}

export async function createJob(
  type: JobType,
  priority: number = 0,
  payloadRef: string | null = null
): Promise<WorkerJob> {
  const db = getDb();
  const job: WorkerJob = {
    id: generateId(),
    type,
    status: 'queued',
    priority,
    progressPercent: 0,
    startedAt: null,
    completedAt: null,
    cancelRequestedAt: null,
    cancelledAt: null,
    failureCount: 0,
    lastErrorCode: null,
    lastErrorMessage: null,
    throughputMetric: null,
    payloadRef,
    resultRef: null,
  };
  await db.workerJobs.add(job);
  return job;
}

export async function updateJobStatus(
  jobId: string,
  status: JobStatus,
  extra: Partial<WorkerJob> = {}
): Promise<void> {
  const db = getDb();
  const updates: Partial<WorkerJob> = { status, ...extra };

  if (status === 'running' && !extra.startedAt) {
    updates.startedAt = Date.now();
  }
  if (status === 'completed' || status === 'failed' || status === 'cancelled') {
    updates.completedAt = Date.now();
  }
  if (status === 'cancelled') {
    updates.cancelledAt = Date.now();
  }

  await db.workerJobs.update(jobId, updates);
}

export async function updateJobProgress(jobId: string, percent: number): Promise<void> {
  const db = getDb();
  await db.workerJobs.update(jobId, { progressPercent: Math.min(100, Math.max(0, percent)) });
}

export async function requestCancelJob(jobId: string): Promise<AppResult<void>> {
  const db = getDb();
  const job = await db.workerJobs.get(jobId);
  if (!job) return err(ErrorCode.NOT_FOUND, 'Job not found');

  if (job.status === 'queued') {
    await updateJobStatus(jobId, 'cancelled');
    return ok(undefined);
  }

  if (job.status === 'running') {
    await db.workerJobs.update(jobId, {
      status: 'cancelling',
      cancelRequestedAt: Date.now(),
    });
    return ok(undefined);
  }

  return err(ErrorCode.VALIDATION, `Cannot cancel job in ${job.status} state`);
}

export async function retryJob(jobId: string): Promise<AppResult<WorkerJob>> {
  const db = getDb();
  const job = await db.workerJobs.get(jobId);
  if (!job) return err(ErrorCode.NOT_FOUND, 'Job not found');

  if (job.status !== 'failed' && job.status !== 'interrupted') {
    return err(ErrorCode.VALIDATION, `Cannot retry job in ${job.status} state`);
  }

  await db.workerJobs.update(jobId, {
    status: 'queued',
    progressPercent: 0,
    startedAt: null,
    completedAt: null,
    cancelRequestedAt: null,
    cancelledAt: null,
    failureCount: job.failureCount + 1,
    lastErrorCode: null,
    lastErrorMessage: null,
  });

  const updated = await db.workerJobs.get(jobId);
  return ok(updated!);
}

export async function markInterruptedJobs(): Promise<number> {
  const db = getDb();
  const running = await db.workerJobs.where('status').equals('running').toArray();
  const cancelling = await db.workerJobs.where('status').equals('cancelling').toArray();

  const toInterrupt = [...running, ...cancelling];
  for (const job of toInterrupt) {
    await db.workerJobs.update(job.id, { status: 'interrupted' });
  }

  return toInterrupt.length;
}

export async function getJob(jobId: string): Promise<WorkerJob | undefined> {
  const db = getDb();
  return db.workerJobs.get(jobId);
}

export async function listJobs(status?: JobStatus): Promise<WorkerJob[]> {
  const db = getDb();
  if (status) {
    return db.workerJobs.where('status').equals(status).toArray();
  }
  return db.workerJobs.toArray();
}

export async function listRecentJobs(limit = 50): Promise<WorkerJob[]> {
  const db = getDb();
  const all = await db.workerJobs.toArray();
  return all.sort((a, b) => (b.startedAt ?? b.id.localeCompare(a.id)) - (a.startedAt ?? 0)).slice(0, limit);
}

export async function addJobLog(
  jobId: string,
  level: WorkerJobLog['level'],
  code: string,
  message: string,
  details?: unknown
): Promise<void> {
  const db = getDb();
  await db.workerJobLogs.add({
    id: generateId(),
    jobId,
    timestamp: nextLogTimestamp(),
    level,
    code,
    message,
    details,
  });
}

export async function getJobLogs(jobId: string): Promise<WorkerJobLog[]> {
  const db = getDb();
  return db.workerJobLogs.where('jobId').equals(jobId).sortBy('timestamp');
}

export async function exportJobLogs(jobId: string): Promise<string> {
  const logs = await getJobLogs(jobId);
  return logs.map(l => JSON.stringify({
    timestamp: new Date(l.timestamp).toISOString(),
    level: l.level,
    code: l.code,
    message: l.message,
  })).join('\n');
}

export async function updateMonitorSnapshot(
  jobType: JobType,
  success: boolean,
  runTimeMs: number,
  throughput: number | null = null
): Promise<void> {
  const db = getDb();
  const now = Date.now();
  const windowStart = now - 3600_000; // 1-hour window

  const existing = await db.monitorSnapshots
    .where('jobType')
    .equals(jobType)
    .first();

  if (existing) {
    await db.monitorSnapshots.update(existing.id, {
      windowEnd: now,
      lastRunTime: runTimeMs,
      averageThroughput: throughput ?? existing.averageThroughput,
      successCount: existing.successCount + (success ? 1 : 0),
      failureCount: existing.failureCount + (success ? 0 : 1),
    });
  } else {
    await db.monitorSnapshots.add({
      id: generateId(),
      jobType,
      windowStart,
      windowEnd: now,
      lastRunTime: runTimeMs,
      averageThroughput: throughput ?? 0,
      failureCount: success ? 0 : 1,
      cancelCount: 0,
      successCount: success ? 1 : 0,
    });
  }
}

export async function getMonitorSnapshots(): Promise<MonitorMetricSnapshot[]> {
  const db = getDb();
  return db.monitorSnapshots.toArray();
}
