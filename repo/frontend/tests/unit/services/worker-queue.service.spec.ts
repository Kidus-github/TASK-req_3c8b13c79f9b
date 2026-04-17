import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, destroyTestDb } from '../../helpers/db-factory';
import { type NebulaDB, setDbFactory } from '$lib/db/connection';
import * as queueService from '$lib/services/worker-queue.service';

let testDb: NebulaDB;

beforeEach(() => {
  testDb = createTestDb();
  setDbFactory(() => testDb);
});

afterEach(async () => {
  setDbFactory(null);
  await destroyTestDb(testDb);
});

describe('worker-queue.service', () => {
  describe('createJob', () => {
    it('creates a job in queued status', async () => {
      const job = await queueService.createJob('import_parse_validate');
      expect(job.status).toBe('queued');
      expect(job.type).toBe('import_parse_validate');
      expect(job.progressPercent).toBe(0);
    });
  });

  describe('updateJobStatus', () => {
    it('transitions job to running', async () => {
      const job = await queueService.createJob('import_parse_validate');
      await queueService.updateJobStatus(job.id, 'running');

      const updated = await queueService.getJob(job.id);
      expect(updated?.status).toBe('running');
      expect(updated?.startedAt).toBeTruthy();
    });

    it('transitions job to completed', async () => {
      const job = await queueService.createJob('import_parse_validate');
      await queueService.updateJobStatus(job.id, 'running');
      await queueService.updateJobStatus(job.id, 'completed');

      const updated = await queueService.getJob(job.id);
      expect(updated?.status).toBe('completed');
      expect(updated?.completedAt).toBeTruthy();
    });
  });

  describe('updateJobProgress', () => {
    it('updates progress percent', async () => {
      const job = await queueService.createJob('import_parse_validate');
      await queueService.updateJobProgress(job.id, 50);

      const updated = await queueService.getJob(job.id);
      expect(updated?.progressPercent).toBe(50);
    });

    it('clamps progress to 0-100', async () => {
      const job = await queueService.createJob('import_parse_validate');
      await queueService.updateJobProgress(job.id, 150);

      const updated = await queueService.getJob(job.id);
      expect(updated?.progressPercent).toBe(100);
    });
  });

  describe('requestCancelJob', () => {
    it('cancels queued job immediately', async () => {
      const job = await queueService.createJob('import_parse_validate');
      const result = await queueService.requestCancelJob(job.id);
      expect(result.ok).toBe(true);

      const updated = await queueService.getJob(job.id);
      expect(updated?.status).toBe('cancelled');
    });

    it('sets running job to cancelling', async () => {
      const job = await queueService.createJob('import_parse_validate');
      await queueService.updateJobStatus(job.id, 'running');

      const result = await queueService.requestCancelJob(job.id);
      expect(result.ok).toBe(true);

      const updated = await queueService.getJob(job.id);
      expect(updated?.status).toBe('cancelling');
    });

    it('rejects cancel on completed job', async () => {
      const job = await queueService.createJob('import_parse_validate');
      await queueService.updateJobStatus(job.id, 'running');
      await queueService.updateJobStatus(job.id, 'completed');

      const result = await queueService.requestCancelJob(job.id);
      expect(result.ok).toBe(false);
    });
  });

  describe('retryJob', () => {
    it('retries failed job', async () => {
      const job = await queueService.createJob('import_parse_validate');
      await queueService.updateJobStatus(job.id, 'running');
      await queueService.updateJobStatus(job.id, 'failed');

      const result = await queueService.retryJob(job.id);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.status).toBe('queued');
        expect(result.data.failureCount).toBe(1);
      }
    });

    it('retries interrupted job', async () => {
      const job = await queueService.createJob('import_parse_validate');
      await queueService.updateJobStatus(job.id, 'running');
      await queueService.updateJobStatus(job.id, 'interrupted');

      const result = await queueService.retryJob(job.id);
      expect(result.ok).toBe(true);
    });

    it('rejects retry on queued job', async () => {
      const job = await queueService.createJob('import_parse_validate');
      const result = await queueService.retryJob(job.id);
      expect(result.ok).toBe(false);
    });
  });

  describe('markInterruptedJobs', () => {
    it('marks running jobs as interrupted', async () => {
      const j1 = await queueService.createJob('import_parse_validate');
      const j2 = await queueService.createJob('index_rebuild');
      await queueService.updateJobStatus(j1.id, 'running');
      await queueService.updateJobStatus(j2.id, 'running');

      const count = await queueService.markInterruptedJobs();
      expect(count).toBe(2);

      const u1 = await queueService.getJob(j1.id);
      const u2 = await queueService.getJob(j2.id);
      expect(u1?.status).toBe('interrupted');
      expect(u2?.status).toBe('interrupted');
    });

    it('does not affect completed jobs', async () => {
      const j1 = await queueService.createJob('import_parse_validate');
      await queueService.updateJobStatus(j1.id, 'running');
      await queueService.updateJobStatus(j1.id, 'completed');

      const count = await queueService.markInterruptedJobs();
      expect(count).toBe(0);
    });
  });

  describe('job logs', () => {
    it('adds and retrieves logs', async () => {
      const job = await queueService.createJob('import_parse_validate');
      await queueService.addJobLog(job.id, 'info', 'START', 'Job started');
      await queueService.addJobLog(job.id, 'error', 'ERR_001', 'Something failed');

      const logs = await queueService.getJobLogs(job.id);
      expect(logs).toHaveLength(2);
      expect(logs[0].code).toBe('START');
    });

    it('exports logs as JSONL', async () => {
      const job = await queueService.createJob('import_parse_validate');
      await queueService.addJobLog(job.id, 'info', 'TEST', 'Test message');

      const exported = await queueService.exportJobLogs(job.id);
      const parsed = JSON.parse(exported);
      expect(parsed.code).toBe('TEST');
    });
  });
});
