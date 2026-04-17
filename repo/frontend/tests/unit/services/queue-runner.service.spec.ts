import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDb, destroyTestDb } from '../../helpers/db-factory';
import { type NebulaDB, setDbFactory } from '$lib/db/connection';
import { runJob, cancelRunningJob, setWorkerFactory, getHealthSnapshot, __resetForTests } from '$lib/services/queue-runner.service';
import { listJobs, getJobLogs } from '$lib/services/worker-queue.service';

let testDb: NebulaDB;

/**
 * A mock Worker that scripts progress/log/done/error messages so we can drive
 * the runner deterministically without actually spawning a web worker.
 */
class ScriptedWorker extends EventTarget implements Worker {
  onmessage: ((this: Worker, ev: MessageEvent) => void) | null = null;
  onmessageerror: ((this: Worker, ev: MessageEvent) => void) | null = null;
  onerror: ((this: AbstractWorker, ev: ErrorEvent) => void) | null = null;

  public sent: unknown[] = [];
  public cancelled = false;
  private script: (this: ScriptedWorker, jobId: string) => void;

  constructor(script: (this: ScriptedWorker, jobId: string) => void) {
    super();
    this.script = script;
  }

  postMessage(msg: unknown): void {
    this.sent.push(msg);
    const m = msg as { kind: string; jobId: string };
    if (m.kind === 'cancel') {
      this.cancelled = true;
      queueMicrotask(() => this.emit({ kind: 'cancelled', jobId: m.jobId }));
      return;
    }
    if (m.kind === 'start') {
      queueMicrotask(() => this.script.call(this, m.jobId));
    }
  }

  emit(data: unknown) {
    const event = new MessageEvent('message', { data });
    // EventTarget path
    this.dispatchEvent(event);
    if (this.onmessage) this.onmessage.call(this as unknown as Worker, event);
  }

  terminate(): void { /* noop */ }
  addEventListener = EventTarget.prototype.addEventListener.bind(this);
  removeEventListener = EventTarget.prototype.removeEventListener.bind(this);
  dispatchEvent = EventTarget.prototype.dispatchEvent.bind(this);
}

function makeFactory(script: (this: ScriptedWorker, jobId: string) => void): () => Worker {
  return () => new ScriptedWorker(script) as unknown as Worker;
}

beforeEach(() => {
  testDb = createTestDb();
  setDbFactory(() => testDb);
  __resetForTests();
});

afterEach(async () => {
  __resetForTests();
  setDbFactory(null);
  await destroyTestDb(testDb);
});

describe('queue-runner.service', () => {
  it('runs a job, persists progress, and returns the final result', async () => {
    setWorkerFactory(makeFactory(function (this: ScriptedWorker, jobId: string) {
      this.emit({ kind: 'log', jobId, level: 'info', code: 'START', message: 'starting' });
      this.emit({ kind: 'progress', jobId, percent: 50, note: 'half way' });
      this.emit({ kind: 'progress', jobId, percent: 100, note: 'done' });
      this.emit({ kind: 'done', jobId, result: { count: 3 }, throughput: 42 });
    }));

    const { job, result } = await runJob<{ count: number }>('index_rebuild', { cards: [] });
    expect(result.count).toBe(3);
    expect(job.status).toBe('completed');
    expect(job.progressPercent).toBe(100);
    expect(job.throughputMetric).toBe(42);

    const logs = await getJobLogs(job.id);
    // ENQUEUED + START + progress notes + DONE
    expect(logs.length).toBeGreaterThanOrEqual(3);
    const codes = logs.map(l => l.code);
    expect(codes).toContain('ENQUEUED');
    expect(codes).toContain('START');
  });

  it('marks job failed and rejects on error message', async () => {
    setWorkerFactory(makeFactory(function (this: ScriptedWorker, jobId: string) {
      this.emit({ kind: 'log', jobId, level: 'error', code: 'FAIL', message: 'boom' });
      this.emit({ kind: 'error', jobId, code: 'WORKER_ERROR', message: 'boom' });
    }));

    await expect(runJob('index_rebuild', {})).rejects.toThrow('boom');

    const jobs = await listJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe('failed');
    expect(jobs[0].lastErrorMessage).toBe('boom');

    const logs = await getJobLogs(jobs[0].id);
    expect(logs.some(l => l.level === 'error')).toBe(true);
  });

  it('supports cancellation', async () => {
    let jobIdRef: string | null = null;
    let resolveStarted!: () => void;
    const started = new Promise<void>(r => { resolveStarted = r; });

    setWorkerFactory(makeFactory(function (this: ScriptedWorker, jobId: string) {
      jobIdRef = jobId;
      resolveStarted();
      this.emit({ kind: 'progress', jobId, percent: 10 });
      // Simulate a long-running job - do not auto-complete.
    }));

    const p = runJob('index_rebuild', {});
    await started;
    expect(jobIdRef).not.toBeNull();
    await cancelRunningJob(jobIdRef!);

    await expect(p).rejects.toThrow(/CANCELLED/);

    const jobs = await listJobs();
    expect(jobs[0].status).toBe('cancelled');
  });

  it('exposes a health snapshot', async () => {
    setWorkerFactory(makeFactory(function (this: ScriptedWorker, jobId: string) {
      this.emit({ kind: 'done', jobId, result: { count: 1 }, throughput: 10 });
    }));
    await runJob('index_rebuild', {});
    const health = await getHealthSnapshot();
    expect(health.activeCount).toBe(0);
    expect(health.queuedCount).toBe(0);
  });
});
