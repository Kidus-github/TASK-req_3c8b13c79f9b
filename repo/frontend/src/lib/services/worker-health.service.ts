import { config } from '$lib/config';
import * as queueService from './worker-queue.service';
import { pushToast } from '$lib/stores/toast.store';
import type { JobType, MonitorMetricSnapshot, WorkerJob } from '$lib/types/worker';

/**
 * Worker health monitor. Owns the threshold evaluation and the dedup/cooldown
 * logic that keeps toast spam in check. Independent of any UI component so the
 * app shell can start/stop it once per session.
 *
 * The evaluator is called on every poll tick and also exposed directly so
 * other services (or tests) can force a fresh check right after a known
 * failure or metric refresh.
 */

export interface WorkerHealthThresholds {
  queueLengthThreshold: number;
  failureRateThreshold: number;
  repeatedFailureThreshold: number;
  throughputDegradationRatio: number;
  alertCooldownMs: number;
}

export type HealthAlertCode =
  | 'QUEUE_LENGTH'
  | 'FAILURE_RATE'
  | 'REPEATED_FAILURES'
  | 'THROUGHPUT_DEGRADATION';

export interface HealthAlert {
  code: HealthAlertCode;
  message: string;
  scope?: string;
  severity: 'warning' | 'error';
}

interface ThroughputBaseline {
  average: number;
  samples: number;
}

const throughputBaselines = new Map<JobType, ThroughputBaseline>();
const lastAlertAt = new Map<string, number>();

let pollTimer: ReturnType<typeof setInterval> | null = null;
let toastSink: (alert: HealthAlert) => void = (alert) => {
  pushToast(alert.message, alert.severity);
};

/** Override the sink — tests capture alerts without hitting the toast store. */
export function __setAlertSink(sink: ((alert: HealthAlert) => void) | null) {
  toastSink = sink ?? ((alert) => pushToast(alert.message, alert.severity));
}

/** Reset all internal state. */
export function __resetForTests() {
  throughputBaselines.clear();
  lastAlertAt.clear();
  stopWorkerHealthMonitor();
  toastSink = (alert) => pushToast(alert.message, alert.severity);
}

function getThresholds(): WorkerHealthThresholds {
  return {
    queueLengthThreshold: config.workerHealth.queueLengthThreshold,
    failureRateThreshold: config.workerHealth.failureRateThreshold,
    repeatedFailureThreshold: config.workerHealth.repeatedFailureThreshold,
    throughputDegradationRatio: config.workerHealth.throughputDegradationRatio,
    alertCooldownMs: config.workerHealth.alertCooldownMs,
  };
}

function dedupKey(code: HealthAlertCode, scope?: string): string {
  return scope ? `${code}:${scope}` : code;
}

function shouldEmit(code: HealthAlertCode, scope: string | undefined, cooldownMs: number, now: number): boolean {
  const key = dedupKey(code, scope);
  const last = lastAlertAt.get(key) ?? 0;
  if (now - last < cooldownMs) return false;
  lastAlertAt.set(key, now);
  return true;
}

function emitAlert(alert: HealthAlert) {
  toastSink(alert);
}

/**
 * Evaluate all health thresholds against a fresh jobs+snapshots read and
 * emit any breaching alerts as toasts. Returns the alerts that fired (after
 * dedup) so callers can observe them in tests.
 */
export async function evaluateWorkerHealth(now: number = Date.now()): Promise<HealthAlert[]> {
  const thresholds = getThresholds();
  const jobs = await queueService.listJobs();
  const snapshots = await queueService.getMonitorSnapshots();

  const fired: HealthAlert[] = [];

  const queued = jobs.filter(j => j.status === 'queued').length;
  if (queued >= thresholds.queueLengthThreshold) {
    if (shouldEmit('QUEUE_LENGTH', undefined, thresholds.alertCooldownMs, now)) {
      const alert: HealthAlert = {
        code: 'QUEUE_LENGTH',
        severity: 'warning',
        message: `Worker queue backlog: ${queued} jobs pending (threshold ${thresholds.queueLengthThreshold}).`,
      };
      emitAlert(alert);
      fired.push(alert);
    }
  }

  for (const snap of snapshots) {
    const total = snap.successCount + snap.failureCount;
    if (total > 0) {
      const failureRate = snap.failureCount / total;
      if (failureRate >= thresholds.failureRateThreshold) {
        if (shouldEmit('FAILURE_RATE', snap.jobType, thresholds.alertCooldownMs, now)) {
          const alert: HealthAlert = {
            code: 'FAILURE_RATE',
            severity: 'error',
            scope: snap.jobType,
            message: `Worker failure rate for ${snap.jobType}: ${(failureRate * 100).toFixed(0)}% (threshold ${Math.round(thresholds.failureRateThreshold * 100)}%).`,
          };
          emitAlert(alert);
          fired.push(alert);
        }
      }
    }

    const repeated = countRepeatedFailures(jobs, snap.jobType);
    if (repeated >= thresholds.repeatedFailureThreshold) {
      if (shouldEmit('REPEATED_FAILURES', snap.jobType, thresholds.alertCooldownMs, now)) {
        const alert: HealthAlert = {
          code: 'REPEATED_FAILURES',
          severity: 'error',
          scope: snap.jobType,
          message: `${repeated} repeated failures on ${snap.jobType}. Review the Jobs page.`,
        };
        emitAlert(alert);
        fired.push(alert);
      }
    }

    // Throughput degradation — compare current average against the tracked
    // baseline. First observation seeds the baseline silently.
    const baseline = throughputBaselines.get(snap.jobType);
    if (snap.averageThroughput > 0) {
      if (!baseline) {
        throughputBaselines.set(snap.jobType, { average: snap.averageThroughput, samples: 1 });
      } else {
        const degraded = snap.averageThroughput <= baseline.average * thresholds.throughputDegradationRatio;
        if (degraded) {
          if (shouldEmit('THROUGHPUT_DEGRADATION', snap.jobType, thresholds.alertCooldownMs, now)) {
            const alert: HealthAlert = {
              code: 'THROUGHPUT_DEGRADATION',
              severity: 'warning',
              scope: snap.jobType,
              message: `${snap.jobType} throughput dropped to ${snap.averageThroughput.toFixed(1)}/s (baseline ${baseline.average.toFixed(1)}/s).`,
            };
            emitAlert(alert);
            fired.push(alert);
          }
        } else {
          // Slowly adapt the baseline upward when healthy so transient spikes
          // do not permanently mask a slow decline.
          const samples = baseline.samples + 1;
          const average = (baseline.average * baseline.samples + snap.averageThroughput) / samples;
          throughputBaselines.set(snap.jobType, { average, samples });
        }
      }
    }
  }

  return fired;
}

function countRepeatedFailures(jobs: WorkerJob[], type: JobType): number {
  const typeJobs = jobs
    .filter(j => j.type === type && (j.completedAt !== null || j.status === 'failed' || j.status === 'completed'))
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));

  let streak = 0;
  for (const j of typeJobs) {
    if (j.status === 'failed') streak++;
    else break;
  }
  return streak;
}

/** Start a background poll loop that refreshes thresholds periodically. */
export function startWorkerHealthMonitor(): void {
  if (pollTimer) return;
  const interval = Math.max(1000, config.workerHealth.pollIntervalMs);
  pollTimer = setInterval(() => {
    void evaluateWorkerHealth();
  }, interval);
}

export function stopWorkerHealthMonitor(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
