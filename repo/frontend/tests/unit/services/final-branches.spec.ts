/**
 * Final round of branch-coverage fillers — small, surgical tests for the
 * remaining gaps identified in the v8 coverage report.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { type NebulaDB, setDbFactory } from '$lib/db/connection';
import { createTestDb, destroyTestDb } from '../../helpers/db-factory';
import * as parserService from '$lib/services/parser-rule.service';
import * as cardService from '$lib/services/card.service';
import * as importService from '$lib/services/import.service';
import * as searchService from '$lib/services/search.service';
import { setWorkerFactory, __resetForTests } from '$lib/services/queue-runner.service';
import { fakeWorkerFactory } from '../../helpers/fake-worker';
import type { ParsingRuleSet, RuleSelector, FieldMapping } from '$lib/types/parser-rule';

let testDb: NebulaDB;
const PROFILE_ID = 'final-fill-profile';

const jsonSelectors: RuleSelector[] = [
  { selectorType: 'jsonpath', expression: '$', description: 'root' },
];
const jsonMappings: FieldMapping[] = [
  { sourceSelector: 'heading', targetField: 'title' },
  { sourceSelector: '$.body', targetField: 'body' },
  { sourceSelector: 'date', targetField: 'date' },
  { sourceSelector: 'mood', targetField: 'mood' },
];

beforeEach(() => {
  testDb = createTestDb();
  setDbFactory(() => testDb);
  setWorkerFactory(() => fakeWorkerFactory() as unknown as Worker);
});

afterEach(async () => {
  __resetForTests();
  setDbFactory(null);
  await destroyTestDb(testDb);
  vi.restoreAllMocks();
});

const baseRule = (): ParsingRuleSet => ({
  id: 'r1', profileId: PROFILE_ID, name: 'r', sourceType: 'json',
  ruleVersion: 1, status: 'active',
  selectors: jsonSelectors,
  fieldMappings: jsonMappings,
  createdAt: 0, updatedAt: 0, lastCanaryRunId: null,
});

describe('parser-rule.service defaultExtract JSON $ vs $. vs path', () => {
  it('defaultExtract treats "$" as identity (single-object root)', () => {
    const fn = parserService.defaultExtract(baseRule());
    const out = fn(JSON.stringify({ heading: 'A', body: 'B', date: '2024-01-01', mood: 3 }), [], []);
    expect(out.title).toBe('A');
    expect(out.body).toBe('B');
  });

  it('defaultExtract returns {} when JSON top-level is a primitive', () => {
    const fn = parserService.defaultExtract(baseRule());
    expect(fn('"a string"', [], [])).toEqual({});
  });

  it('defaultExtract resolves $-prefixed field paths via evaluateJsonPath', () => {
    const rule: ParsingRuleSet = {
      ...baseRule(),
      fieldMappings: [
        { sourceSelector: '$.title', targetField: 'title' },
      ],
    };
    const fn = parserService.defaultExtract(rule);
    const out = fn(JSON.stringify({ title: 'Hello' }), [], []);
    expect(out.title).toBe('Hello');
  });
});

describe('extractFromJsonSnapshot container variants', () => {
  it('default $ container returns array members of an array root', () => {
    const out = parserService.extractFromJsonSnapshot(
      { ...baseRule(), selectors: [{ selectorType: 'jsonpath', expression: '$', description: '' }] },
      JSON.stringify([
        { heading: 'A', body: 'B', date: '2024-01-01', mood: 3 },
        { heading: 'B', body: 'B', date: '2024-01-02', mood: 4 },
      ]),
    );
    expect(out.rows).toHaveLength(2);
  });

  it('default $ container wraps a non-array root as a single item', () => {
    const out = parserService.extractFromJsonSnapshot(
      { ...baseRule(), selectors: [{ selectorType: 'jsonpath', expression: '$', description: '' }] },
      JSON.stringify({ heading: 'Solo', body: 'B', date: '2024-01-01', mood: 3 }),
    );
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].title).toBe('Solo');
  });

  it('field path without $ prefix uses bracket lookup directly', () => {
    const out = parserService.extractFromJsonSnapshot(
      {
        ...baseRule(),
        selectors: [{ selectorType: 'jsonpath', expression: '$.items', description: '' }],
        fieldMappings: [
          { sourceSelector: 'heading', targetField: 'title' },
          { sourceSelector: 'list', targetField: 'tags' },
        ],
      },
      JSON.stringify({ items: [{ heading: 'X', list: ['a', 'b'] }] }),
    );
    expect(out.rows[0].title).toBe('X');
    expect(out.rows[0].tags).toBe('a, b');
  });
});

describe('import.service additional branches', () => {
  it('storeValidationResults distinguishes invalid + valid + warnings', async () => {
    const batch = await importService.createImportBatch(PROFILE_ID, 'i.json', 'json');
    await importService.storeValidationResults(batch.id, [
      { rowNumber: 1, valid: true, normalized: { title: 'T', body: 'B', date: '2024-01-01', mood: 3, tags: [] }, errors: [], warnings: [] },
      { rowNumber: 2, valid: true, normalized: { title: 'U', body: 'B', date: '2024-01-02', mood: 4, tags: [] }, errors: [], warnings: [{ field: 'mood', message: 'unusual' }] },
      { rowNumber: 3, valid: false, normalized: null, errors: [{ field: 'title', message: 'required' }], warnings: [] },
    ], [
      { rowNumber: 1, data: { title: 'T', body: 'B', date: '2024-01-01', mood: '3' } },
      { rowNumber: 2, data: { title: 'U', body: 'B', date: '2024-01-02', mood: '4' } },
      { rowNumber: 3, data: { title: '', body: '', date: 'bad', mood: 'x' } },
    ]);
    const after = await importService.getImportBatch(batch.id);
    expect(after?.validRowCount).toBe(2);
    expect(after?.invalidRowCount).toBe(1);
  });

  it('getImportRows filters by status', async () => {
    const batch = await importService.createImportBatch(PROFILE_ID, 'i.json', 'json');
    await importService.storeValidationResults(batch.id, [
      { rowNumber: 1, valid: true, normalized: { title: 'T', body: 'B', date: '2024-01-01', mood: 3, tags: [] }, errors: [], warnings: [] },
      { rowNumber: 2, valid: false, normalized: null, errors: [{ field: 'title', message: 'required' }], warnings: [] },
    ], [
      { rowNumber: 1, data: {} },
      { rowNumber: 2, data: {} },
    ]);
    const valid = await importService.getImportRows(batch.id, 'valid');
    const invalid = await importService.getImportRows(batch.id, 'invalid');
    expect(valid).toHaveLength(1);
    expect(invalid).toHaveLength(1);
  });
});

describe('search.service incremental update + deletion', () => {
  it('removeFromSearchIndex deletes the index entry for a card id', async () => {
    const card = await cardService.createCard(PROFILE_ID, {
      title: 'Idx', body: 'index body', date: '2024-06-15', mood: 3, tags: [],
    });
    if (!card.ok) throw new Error('seed failed');
    await searchService.buildSearchIndex(card.data);
    await searchService.removeFromSearchIndex(card.data.id, PROFILE_ID);
    const remaining = await testDb.searchIndex.toArray();
    expect(remaining.find((r) => r.cardId === card.data.id)).toBeUndefined();
  });
});

describe('backup.service preferences fallback paths', () => {
  it('writePreferences swallows localStorage exceptions silently', async () => {
    // Patch localStorage.setItem to throw; backup restore should not blow up.
    const originalSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function () {
      throw new Error('quota');
    } as typeof Storage.prototype.setItem;
    try {
      const data = {
        cards: [], cardRevisions: [], parserRules: [], parserRuleVersions: [],
        viewLogs: [], missionDayActivities: [], missionStreak: null,
        preferences: { theme: 'dark' }, importBatches: [], jobHistory: [],
        thumbnails: [], rawImportFiles: [],
      };
      const backupService = await import('$lib/services/backup.service');
      const r = await backupService.restoreBackup(PROFILE_ID, data, 'merge');
      expect(r.ok).toBe(true);
    } finally {
      Storage.prototype.setItem = originalSet;
    }
  });

  it('readPreferences swallows JSON.parse exceptions silently (export still produces a Blob)', async () => {
    localStorage.setItem('nebulaforge_preferences', '{not valid json');
    const backupService = await import('$lib/services/backup.service');
    const r = await backupService.exportBackup(PROFILE_ID);
    expect(r.ok).toBe(true);
    localStorage.removeItem('nebulaforge_preferences');
  });
});
