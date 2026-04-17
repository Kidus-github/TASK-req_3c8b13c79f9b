import Dexie, { type Table } from 'dexie';
import type { ProfileCredential } from '$lib/types/profile';
import type { Card, CardRevision } from '$lib/types/card';
import type { ImportBatch, ImportRowResult } from '$lib/types/import';
import type { WorkerJob, WorkerJobLog, MonitorMetricSnapshot } from '$lib/types/worker';
import type { ViewLog, MissionDayActivity, MissionStreak } from '$lib/types/voyage';
import type { BackupArtifact } from '$lib/types/backup';
import type { ParsingRuleSet, ParsingCanaryRun, ParserRuleVersion } from '$lib/types/parser-rule';
import type { SearchIndexRecord } from '$lib/types/search';
import type { ThumbnailRecord, RawImportFileRecord } from '$lib/types/blob-records';

export class NebulaDB extends Dexie {
  profiles!: Table<ProfileCredential>;
  cards!: Table<Card>;
  cardRevisions!: Table<CardRevision>;
  importBatches!: Table<ImportBatch>;
  importRowResults!: Table<ImportRowResult>;
  searchIndex!: Table<SearchIndexRecord>;
  viewLogs!: Table<ViewLog>;
  missionDayActivities!: Table<MissionDayActivity>;
  missionStreaks!: Table<MissionStreak>;
  workerJobs!: Table<WorkerJob>;
  workerJobLogs!: Table<WorkerJobLog>;
  monitorSnapshots!: Table<MonitorMetricSnapshot>;
  backupArtifacts!: Table<BackupArtifact>;
  parsingRuleSets!: Table<ParsingRuleSet>;
  parsingCanaryRuns!: Table<ParsingCanaryRun>;
  parserRuleVersions!: Table<ParserRuleVersion>;
  auditEvents!: Table<AuditEvent>;
  thumbnails!: Table<ThumbnailRecord>;
  rawImportFiles!: Table<RawImportFileRecord>;

  constructor(name = 'nebulaforge') {
    super(name);

    this.version(1).stores({
      profiles: '&id, &username',
      cards: '&id, profileId, *tags, mood, date, createdAt, updatedAt, deletedAt, [profileId+deletedAt]',
      cardRevisions: '&id, cardId, version, editedAt',
      importBatches: '&id, profileId, status, startedAt',
      importRowResults: '&id, importBatchId, rowNumber, status',
      searchIndex: '&cardId, profileId, mood, dateEpochDay, *tagTerms, [profileId+cardId]',
      viewLogs: '&id, profileId, cardId, dateLocal, [profileId+dateLocal]',
      missionDayActivities: '&id, profileId, dateLocal, [profileId+dateLocal]',
      missionStreaks: '&id, &profileId',
      workerJobs: '&id, type, status, [status+priority], startedAt',
      workerJobLogs: '&id, jobId, timestamp',
      monitorSnapshots: '&id, jobType, windowEnd',
      backupArtifacts: '&id, profileId, createdAt',
      parsingRuleSets: '&id, profileId, name, status',
      parsingCanaryRuns: '&id, ruleSetId, startedAt',
      parserRuleVersions: '&id, ruleSetId, version',
      auditEvents: '&id, type, timestamp, profileId',
    });

    this.version(2).stores({
      thumbnails: '&id, profileId, cardId, [profileId+cardId]',
      rawImportFiles: '&id, profileId, importBatchId, [profileId+importBatchId]',
    });
  }
}

export interface AuditEvent {
  id: string;
  type: string;
  profileId: string | null;
  timestamp: number;
  details: Record<string, unknown>;
}

let db: NebulaDB | null = null;
let dbFactory: (() => NebulaDB) | null = null;

export function getDb(): NebulaDB {
  if (dbFactory) return dbFactory();
  if (!db) {
    db = new NebulaDB();
  }
  return db;
}

export function setDbFactory(factory: (() => NebulaDB) | null): void {
  dbFactory = factory;
}

export function resetDb(): void {
  db = null;
  dbFactory = null;
}
