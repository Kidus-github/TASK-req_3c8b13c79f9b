import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, destroyTestDb } from '../helpers/db-factory';
import { type NebulaDB, setDbFactory } from '$lib/db/connection';
import * as parserService from '$lib/services/parser-rule.service';
import * as importService from '$lib/services/import.service';
import * as cardService from '$lib/services/card.service';
import type { RuleSelector, FieldMapping } from '$lib/types/parser-rule';
import type { RawRow, RowValidationResult } from '$lib/workers/protocol';
import { setWorkerFactory, __resetForTests } from '$lib/services/queue-runner.service';
import { fakeWorkerFactory } from '../helpers/fake-worker';

let testDb: NebulaDB;
const PROFILE_ID = 'json-snap-profile';

beforeEach(() => {
  testDb = createTestDb();
  setDbFactory(() => testDb);
  setWorkerFactory(() => fakeWorkerFactory() as unknown as Worker);
});

afterEach(async () => {
  __resetForTests();
  setDbFactory(null);
  await destroyTestDb(testDb);
});

const jsonSelectors: RuleSelector[] = [
  { selectorType: 'jsonpath', expression: '$.posts', description: 'Posts array' },
];
const jsonMappings: FieldMapping[] = [
  { sourceSelector: 'heading', targetField: 'title' },
  { sourceSelector: 'content', targetField: 'body' },
  { sourceSelector: 'day', targetField: 'date' },
  { sourceSelector: 'rating', targetField: 'mood' },
];

describe('integration: JSON parser rule -> snapshot import', () => {
  it('extractFromJsonSnapshot pulls rows via container + field mappings', async () => {
    const rule = await parserService.createRuleSet(PROFILE_ID, 'JSON Snap Rule', 'json', jsonSelectors, jsonMappings);
    expect(rule.ok).toBe(true);
    if (!rule.ok) return;

    const snapshot = JSON.stringify({
      posts: [
        { heading: 'Alpha', content: 'Alpha body content', day: '2024-01-01', rating: 4 },
        { heading: 'Beta', content: 'Beta body content', day: '2024-01-02', rating: 5 },
      ],
    });

    const extracted = parserService.extractFromJsonSnapshot(rule.data, snapshot);
    expect(extracted.errors).toEqual([]);
    expect(extracted.rows).toEqual([
      { title: 'Alpha', body: 'Alpha body content', date: '2024-01-01', mood: '4' },
      { title: 'Beta', body: 'Beta body content', date: '2024-01-02', mood: '5' },
    ]);
  });

  it('rejects extraction when rule source type is not json', async () => {
    const htmlRule = await parserService.createRuleSet(
      PROFILE_ID,
      'HTML',
      'html',
      [{ selectorType: 'css', expression: '.card' }],
      []
    );
    if (!htmlRule.ok) return;
    const extracted = parserService.extractFromJsonSnapshot(htmlRule.data, '{}');
    expect(extracted.rows).toEqual([]);
    expect(extracted.errors[0]).toMatch(/json/i);
  });

  it('reports a parse error for invalid JSON', async () => {
    const rule = await parserService.createRuleSet(PROFILE_ID, 'R', 'json', jsonSelectors, jsonMappings);
    if (!rule.ok) return;
    const extracted = parserService.extractFromJsonSnapshot(rule.data, 'not json');
    expect(extracted.rows).toEqual([]);
    expect(extracted.errors[0]).toMatch(/Invalid JSON/);
  });

  it('drives a full json_snapshot import batch end to end', async () => {
    const rule = await parserService.createRuleSet(PROFILE_ID, 'E2E Rule', 'json', jsonSelectors, jsonMappings);
    if (!rule.ok) return;

    const snapshot = JSON.stringify({
      posts: [
        { heading: 'Snap One', content: 'First body here', day: '2024-06-01', rating: 3 },
        { heading: 'Snap Two', content: 'Second body here', day: '2024-06-02', rating: 4 },
      ],
    });

    const extracted = parserService.extractFromJsonSnapshot(rule.data, snapshot);
    expect(extracted.rows).toHaveLength(2);

    const batch = await importService.createImportBatch(PROFILE_ID, 'snap.json', 'json_snapshot');
    expect(batch.fileType).toBe('json_snapshot');

    const rawRows: RawRow[] = extracted.rows.map((r, i) => ({ rowNumber: i + 1, data: r }));
    const validationResults: RowValidationResult[] = rawRows.map(row => ({
      rowNumber: row.rowNumber,
      valid: true,
      normalized: {
        title: row.data.title,
        body: row.data.body,
        date: row.data.date,
        mood: parseInt(row.data.mood, 10),
        tags: [],
      },
      errors: [],
      warnings: [],
    }));
    await importService.storeValidationResults(batch.id, validationResults, rawRows);
    const commit = await importService.commitValidRows(batch.id, PROFILE_ID, 'create_new');
    expect(commit.ok).toBe(true);
    if (!commit.ok) return;
    expect(commit.data.imported).toBe(2);

    const cards = await cardService.listActiveCards(PROFILE_ID);
    expect(cards.map(c => c.title).sort()).toEqual(['Snap One', 'Snap Two']);
  });
});
