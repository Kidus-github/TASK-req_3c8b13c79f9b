/**
 * Additional restore and validation behaviors for backup.service.
 *
 * These cases exercise merge-vs-replace semantics, linked-record cleanup,
 * supplemental collection restoration, and invalid backup payload rejection.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { type NebulaDB, setDbFactory } from '$lib/db/connection';
import { createTestDb, destroyTestDb } from '../../helpers/db-factory';
import * as backupService from '$lib/services/backup.service';
import type { BackupData } from '$lib/types/backup';
import type { Card } from '$lib/types/card';

let testDb: NebulaDB;
const PROFILE_ID = 'restore-test-profile';

function card(id: string, ts = Date.now()): Card {
  return {
    id,
    profileId: PROFILE_ID,
    title: `T-${id}`,
    body: 'body',
    date: '2024-06-15',
    mood: 3,
    tags: [],
    sourceImportId: null,
    sourceRowNumber: null,
    thumbnailId: null,
    createdAt: ts,
    updatedAt: ts,
    deletedAt: null,
    version: 1,
  };
}

function emptyBackup(): BackupData {
  return {
    cards: [],
    cardRevisions: [],
    parserRules: [],
    parserRuleVersions: [],
    viewLogs: [],
    missionDayActivities: [],
    missionStreak: null,
    preferences: null,
    importBatches: [],
    jobHistory: [],
    thumbnails: [],
    rawImportFiles: [],
  };
}

beforeEach(() => {
  testDb = createTestDb();
  setDbFactory(() => testDb);
});

afterEach(async () => {
  setDbFactory(null);
  await destroyTestDb(testDb);
});

describe('restoreBackup branches', () => {
  it('replace mode wipes existing rows before inserting from the backup', async () => {
    await testDb.cards.add(card('existing'));
    const data = { ...emptyBackup(), cards: [card('imported')] };
    const r = await backupService.restoreBackup(PROFILE_ID, data, 'replace');
    expect(r.ok).toBe(true);
    const all = await testDb.cards.toArray();
    expect(all.map((c) => c.id)).toEqual(['imported']);
  });

  it('replace mode also drops linked card revisions and parser-rule versions', async () => {
    // Existing card + revision
    const c = card('owned');
    await testDb.cards.add(c);
    await testDb.cardRevisions.add({
      id: 'rev-owned-1', cardId: 'owned', version: 1,
      snapshot: { title: 'T', body: 'B', date: '2024-06-15', mood: 3, tags: [] },
      editSource: 'manual', tabInstanceId: null, createdAt: Date.now(),
    });
    // Unlinked revision (different card) — should NOT be deleted
    await testDb.cardRevisions.add({
      id: 'rev-other-1', cardId: 'other', version: 1,
      snapshot: { title: 'T', body: 'B', date: '2024-06-15', mood: 3, tags: [] },
      editSource: 'manual', tabInstanceId: null, createdAt: Date.now(),
    });
    // Existing parser rule + version
    await testDb.parsingRuleSets.add({
      id: 'rule-owned', profileId: PROFILE_ID, name: 'r', sourceType: 'html',
      ruleVersion: 1, status: 'active',
      selectors: [{ selectorType: 'css', expression: '.x', description: '' }],
      fieldMappings: [{ sourceSelector: '.t', targetField: 'title' }],
      createdAt: Date.now(), updatedAt: Date.now(), lastCanaryRunId: null,
    });
    await testDb.parserRuleVersions.add({
      id: 'pv-owned', ruleSetId: 'rule-owned', version: 1,
      selectors: [{ selectorType: 'css', expression: '.x', description: '' }],
      fieldMappings: [{ sourceSelector: '.t', targetField: 'title' }],
      createdAt: Date.now(),
    });
    await testDb.parserRuleVersions.add({
      id: 'pv-other', ruleSetId: 'rule-other', version: 1,
      selectors: [], fieldMappings: [], createdAt: Date.now(),
    });
    const r = await backupService.restoreBackup(PROFILE_ID, emptyBackup(), 'replace');
    expect(r.ok).toBe(true);
    expect(await testDb.cardRevisions.get('rev-owned-1')).toBeUndefined();
    expect(await testDb.cardRevisions.get('rev-other-1')).toBeDefined();
    expect(await testDb.parserRuleVersions.get('pv-owned')).toBeUndefined();
    expect(await testDb.parserRuleVersions.get('pv-other')).toBeDefined();
  });

  it('merge mode keeps the newer of two duplicate cards', async () => {
    await testDb.cards.add(card('dupe', 1000));
    const data = { ...emptyBackup(), cards: [card('dupe', 5000)] };
    const r = await backupService.restoreBackup(PROFILE_ID, data, 'merge');
    expect(r.ok).toBe(true);
    const got = await testDb.cards.get('dupe');
    expect(got?.updatedAt).toBe(5000);
  });

  it('merge mode preserves the existing card when the backup is older', async () => {
    await testDb.cards.add(card('dupe', 5000));
    const data = { ...emptyBackup(), cards: [card('dupe', 1000)] };
    const r = await backupService.restoreBackup(PROFILE_ID, data, 'merge');
    expect(r.ok).toBe(true);
    const got = await testDb.cards.get('dupe');
    expect(got?.updatedAt).toBe(5000);
  });

  it('merge mode adds a brand-new card from the backup', async () => {
    const data = { ...emptyBackup(), cards: [card('new')] };
    const r = await backupService.restoreBackup(PROFILE_ID, data, 'merge');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.restored).toBe(1);
  });

  it('restores supplemental collections (revisions, view logs, mission activities, parser rules + versions, import batches)', async () => {
    const now = Date.now();
    const data: BackupData = {
      ...emptyBackup(),
      cards: [card('c1', now)],
      cardRevisions: [{
        id: 'rev-1', cardId: 'c1', version: 1,
        snapshot: { title: 'T', body: 'B', date: '2024-06-15', mood: 3, tags: [] },
        editSource: 'manual', tabInstanceId: null, createdAt: now,
      }],
      parserRules: [{
        id: 'rule-1', profileId: PROFILE_ID, name: 'r', sourceType: 'html',
        ruleVersion: 1, status: 'active',
        selectors: [{ selectorType: 'css', expression: '.x', description: '' }],
        fieldMappings: [{ sourceSelector: '.t', targetField: 'title' }],
        createdAt: now, updatedAt: now, lastCanaryRunId: null,
      }],
      parserRuleVersions: [{
        id: 'pv-1', ruleSetId: 'rule-1', version: 1,
        selectors: [{ selectorType: 'css', expression: '.x', description: '' }],
        fieldMappings: [{ sourceSelector: '.t', targetField: 'title' }],
        createdAt: now,
      }],
      viewLogs: [{ id: 'v-1', profileId: PROFILE_ID, cardId: 'c1', viewedAt: now, dateLocal: '2024-06-15' }],
      missionDayActivities: [{
        id: 'a-1', profileId: PROFILE_ID, dateLocal: '2024-06-15',
        distinctViewedCardIds: ['c1'], distinctViewCount: 1,
        completed: false, completionTimestamp: null,
      }],
      missionStreak: {
        id: 's-1', profileId: PROFILE_ID,
        currentStreak: 0, longestStreak: 0,
        lastCompletedDate: null,
        stardustUnlocked: false, stardustUnlockedAt: null,
        lastResetDate: null,
      },
      importBatches: [{
        id: 'b-1', profileId: PROFILE_ID, fileName: 'x.csv', sourceType: 'csv',
        startedAt: now, completedAt: now, status: 'completed', dedupeMode: 'create_new',
        rawFileBlobId: null, jobId: null, totalRows: 0, validCount: 0, invalidCount: 0,
        importedCount: 0, skippedCount: 0, failedCount: 0,
        cancelledAt: null, cancelReason: null,
      }],
      preferences: { theme: 'dark' },
    };
    const r = await backupService.restoreBackup(PROFILE_ID, data, 'merge');
    expect(r.ok).toBe(true);
    expect(await testDb.cardRevisions.count()).toBe(1);
    expect(await testDb.parsingRuleSets.count()).toBe(1);
    expect(await testDb.parserRuleVersions.count()).toBe(1);
    expect(await testDb.viewLogs.count()).toBe(1);
    expect(await testDb.missionDayActivities.count()).toBe(1);
    expect(await testDb.missionStreaks.count()).toBe(1);
    expect(await testDb.importBatches.count()).toBe(1);
  });

  it('validateBackup rejects an unsupported version', async () => {
    const payload = JSON.stringify({
      version: 99, createdAt: '2024-01-01T00:00:00Z', profileId: 'p',
      encrypted: false, checksum: 'x', data: emptyBackup(),
    });
    const r = await backupService.validateBackup(payload);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('VALIDATION');
  });

  it('validateBackup rejects encrypted payload missing the encryptedData field', async () => {
    const payload = JSON.stringify({
      version: 1, createdAt: '2024-01-01T00:00:00Z', profileId: 'p',
      encrypted: true, checksum: 'x',
    });
    const r = await backupService.validateBackup(payload, 'pass');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('VALIDATION');
  });

  it('validateBackup rejects encrypted payload with no passphrase', async () => {
    const payload = JSON.stringify({
      version: 1, createdAt: '2024-01-01T00:00:00Z', profileId: 'p',
      encrypted: true, checksum: 'x', encryptedData: 'AAAA',
    });
    const r = await backupService.validateBackup(payload);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('VALIDATION');
  });

  it('validateBackup rejects unencrypted payload missing the data field', async () => {
    const payload = JSON.stringify({
      version: 1, createdAt: '2024-01-01T00:00:00Z', profileId: 'p',
      encrypted: false, checksum: 'x',
    });
    const r = await backupService.validateBackup(payload);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('VALIDATION');
  });

  it('validateBackup rejects encrypted payload with the wrong passphrase', async () => {
    // Build a real encrypted backup, then try to validate with the wrong key.
    await testDb.cards.add(card('c1'));
    const out = await backupService.exportBackup(PROFILE_ID, 'right-pass-1');
    if (!out.ok) throw new Error('export failed');
    const text = await out.data.text();
    const r = await backupService.validateBackup(text, 'wrong-pass-1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('CRYPTO_FAIL');
  });
});
