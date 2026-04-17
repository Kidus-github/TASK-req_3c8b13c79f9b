import type { JobType, WorkerJob } from '$lib/types/worker';
import * as queueService from './worker-queue.service';
import { getDb } from '$lib/db/connection';
import { updateJobInStore } from '$lib/stores/jobs.store';
import { logger } from '$lib/logging';
import { evaluateWorkerHealth } from './worker-health.service';

/**
 * Queue runner: owns the heavy-task web worker and relays progress/logs into
 * IndexedDB + the jobs store so the Job Monitor UI reflects live state.
 *
 * One job runs at a time (FIFO by createdAt). Consumers call `runJob` and
 * await the result; progress/log side effects drive the store.
 */

type WorkerInMsg =
  | { kind: 'start'; jobId: string; type: string; payload: unknown }
  | { kind: 'cancel'; jobId: string };

type WorkerOutMsg =
  | { kind: 'progress'; jobId: string; percent: number; note?: string }
  | { kind: 'log'; jobId: string; level: 'info' | 'warn' | 'error' | 'debug'; code: string; message: string; details?: unknown }
  | { kind: 'done'; jobId: string; result: unknown; throughput?: number }
  | { kind: 'error'; jobId: string; code: string; message: string }
  | { kind: 'cancelled'; jobId: string };

type WorkerFactory = () => Worker;

let workerFactory: WorkerFactory | null = null;
let worker: Worker | null = null;
const waiters = new Map<string, { resolve: (r: unknown) => void; reject: (e: Error) => void }>();

export function setWorkerFactory(factory: WorkerFactory | null) {
  workerFactory = factory;
  if (worker) {
    worker.terminate();
    worker = null;
  }
}

function defaultFactory(): Worker {
  return new Worker(new URL('../workers/heavy-task.worker.ts', import.meta.url), { type: 'module' });
}

function ensureWorker(): Worker {
  if (worker) return worker;
  const factory = workerFactory ?? defaultFactory;
  worker = factory();
  worker.addEventListener('message', onWorkerMessage);
  worker.addEventListener('error', (ev) => {
    logger.error('queue', 'worker_error', ev.message ?? 'Worker error', { filename: (ev as ErrorEvent).filename });
  });
  return worker;
}

async function onWorkerMessage(ev: MessageEvent<WorkerOutMsg>) {
  const msg = ev.data;
  switch (msg.kind) {
    case 'progress': {
      await queueService.updateJobProgress(msg.jobId, msg.percent);
      if (msg.note) {
        await queueService.addJobLog(msg.jobId, 'debug', 'PROGRESS', msg.note);
      }
      const updated = await queueService.getJob(msg.jobId);
      if (updated) updateJobInStore(updated);
      break;
    }
    case 'log': {
      await queueService.addJobLog(msg.jobId, msg.level, msg.code, msg.message, msg.details);
      break;
    }
    case 'done': {
      await queueService.updateJobStatus(msg.jobId, 'completed', {
        progressPercent: 100,
        throughputMetric: msg.throughput ?? null,
      });
      const job = await queueService.getJob(msg.jobId);
      if (job) {
        updateJobInStore(job);
        const elapsed = (job.completedAt ?? Date.now()) - (job.startedAt ?? Date.now());
        await queueService.updateMonitorSnapshot(job.type, true, elapsed, msg.throughput ?? null);
      }
      const waiter = waiters.get(msg.jobId);
      waiters.delete(msg.jobId);
      waiter?.resolve(msg.result);
      break;
    }
    case 'error': {
      await queueService.updateJobStatus(msg.jobId, 'failed', {
        lastErrorCode: msg.code,
        lastErrorMessage: msg.message,
      });
      const job = await queueService.getJob(msg.jobId);
      if (job) {
        updateJobInStore(job);
        const elapsed = (job.completedAt ?? Date.now()) - (job.startedAt ?? Date.now());
        await queueService.updateMonitorSnapshot(job.type, false, elapsed, null);
      }
      // Failures are a natural alert trigger — evaluate right away so the
      // user is informed while the context is fresh, without waiting for the
      // next poll tick.
      void evaluateWorkerHealth();
      const waiter = waiters.get(msg.jobId);
      waiters.delete(msg.jobId);
      waiter?.reject(new Error(msg.message));
      break;
    }
    case 'cancelled': {
      await queueService.updateJobStatus(msg.jobId, 'cancelled');
      const job = await queueService.getJob(msg.jobId);
      if (job) updateJobInStore(job);
      const waiter = waiters.get(msg.jobId);
      waiters.delete(msg.jobId);
      waiter?.reject(new Error('CANCELLED'));
      break;
    }
  }
}

/**
 * Create and run a job. Returns a promise for the worker result.
 * Progress/logs persist in IndexedDB and drive the jobs store.
 *
 * `opts.onStart` fires synchronously-ish once the job row is created so UIs
 * can bind live progress from the jobs store before awaiting the final
 * result.
 */
export async function runJob<T = unknown>(
  type: JobType,
  payload: unknown,
  opts: { priority?: number; payloadRef?: string | null; onStart?: (jobId: string) => void } = {}
): Promise<{ job: WorkerJob; result: T }> {
  const job = await queueService.createJob(type, opts.priority ?? 0, opts.payloadRef ?? null);
  updateJobInStore(job);
  if (opts.onStart) opts.onStart(job.id);
  await queueService.updateJobStatus(job.id, 'running');
  await queueService.addJobLog(job.id, 'info', 'ENQUEUED', `Job ${type} enqueued`);
  const running = await queueService.getJob(job.id);
  if (running) updateJobInStore(running);
  // Re-evaluate thresholds now — queue length changes on every enqueue.
  void evaluateWorkerHealth().catch(() => {});

  const w = ensureWorker();
  const result = await new Promise<T>((resolve, reject) => {
    waiters.set(job.id, { resolve: (r) => resolve(r as T), reject });
    const msg: WorkerInMsg = { kind: 'start', jobId: job.id, type, payload };
    w.postMessage(msg);
  });

  const finalJob = (await queueService.getJob(job.id))!;
  return { job: finalJob, result };
}

/** Cancel a running job by posting a cancel message to the worker. */
export async function cancelRunningJob(jobId: string): Promise<void> {
  await queueService.requestCancelJob(jobId);
  if (worker) {
    const msg: WorkerInMsg = { kind: 'cancel', jobId };
    worker.postMessage(msg);
  }
}

/** Health snapshot for the monitor. */
export async function getHealthSnapshot(): Promise<{
  activeCount: number;
  queuedCount: number;
  failuresLast24h: number;
  avgThroughputByType: Record<string, number>;
}> {
  const jobs = await queueService.listJobs();
  const active = jobs.filter(j => j.status === 'running' || j.status === 'cancelling').length;
  const queued = jobs.filter(j => j.status === 'queued').length;
  const since = Date.now() - 24 * 3600 * 1000;
  const failures = jobs.filter(j => j.status === 'failed' && (j.completedAt ?? 0) >= since).length;

  const snapshots = await getDb().monitorSnapshots.toArray();
  const avgThroughputByType: Record<string, number> = {};
  for (const s of snapshots) avgThroughputByType[s.jobType] = s.averageThroughput;
  return { activeCount: active, queuedCount: queued, failuresLast24h: failures, avgThroughputByType };
}

/** Reset for tests. */
export function __resetForTests() {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  waiters.clear();
  workerFactory = null;
}
