export type RestoreMode = 'merge' | 'replace';
export type BackupRestoreStatus = 'selected' | 'validating' | 'ready' | 'applying' | 'completed' | 'failed' | 'cancelled';

export interface BackupArtifact {
  id: string;
  profileId: string;
  createdAt: number;
  formatVersion: number;
  encrypted: boolean;
  checksum: string;
  sourceAppVersion: string;
  includedCollections: string[];
  fileName: string;
}

export interface BackupPayload {
  version: number;
  createdAt: string;
  profileId: string;
  encrypted: boolean;
  checksum: string;
  data?: BackupData;
  encryptedData?: string;
}

export interface BackupData {
  cards: unknown[];
  cardRevisions: unknown[];
  parserRules: unknown[];
  parserRuleVersions: unknown[];
  viewLogs: unknown[];
  missionDayActivities: unknown[];
  missionStreak: unknown;
  preferences: unknown;
  importBatches: unknown[];
  jobHistory: unknown[];
  thumbnails?: unknown[];
  rawImportFiles?: unknown[];
}
