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
const PROFILE_ID = 'profile-parser';

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

const htmlSelectors: RuleSelector[] = [
  { selectorType: 'css', expression: '.card', description: 'Card container' },
];
const htmlMappings: FieldMapping[] = [
  { sourceSelector: '.title', targetField: 'title' },
  { sourceSelector: '.body', targetField: 'body' },
  { sourceSelector: '.date', targetField: 'date' },
  { sourceSelector: '.mood', targetField: 'mood' },
];

function buildSample(title: string, body: string, date: string, mood: string) {
  return `<html><body><div class="card"><h2 class="title">${title}</h2><p class="body">${body}</p><span class="date">${date}</span><span class="mood">${mood}</span></div></body></html>`;
}

describe('integration: parser rules + canary + import', () => {
  it('runs default-extractor canary on real HTML samples', async () => {
    const created = await parserService.createRuleSet(PROFILE_ID, 'HTML Rule', 'html', htmlSelectors, htmlMappings);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await parserService.markCanaryReady(created.data.id);

    const samples = [
      buildSample('Alpha', 'Body A', '2024-01-01', '3'),
      buildSample('Beta', 'Body B', '2024-01-02', '4'),
      buildSample('Gamma', 'Body C', '2024-01-03', '5'),
    ];

    const result = await parserService.runCanaryWithDefaultExtract(created.data.id, samples);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.status).toBe('passed');
      expect(result.data.passCount).toBe(3);
      expect(result.data.resultsSummary[0].extractedFields.title).toBe('Alpha');
    }

    // Activation now allowed
    const activation = await parserService.activateRuleSet(created.data.id);
    expect(activation.ok).toBe(true);
  });

  it('fails canary when HTML samples are missing required fields', async () => {
    const created = await parserService.createRuleSet(PROFILE_ID, 'Bad Rule', 'html', htmlSelectors, htmlMappings);
    if (!created.ok) return;

    await parserService.markCanaryReady(created.data.id);

    const bad = [
      '<div class="card"><h2 class="title"></h2></div>',
      '<div class="card"><h2 class="title"></h2></div>',
      '<div class="card"><h2 class="title"></h2></div>',
      '<div class="card"><h2 class="title"></h2></div>',
      '<div class="card"><h2 class="title"></h2></div>',
    ];
    const result = await parserService.runCanaryWithDefaultExtract(created.data.id, bad);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.status).toBe('failed');
  });

  it('imports a full HTML batch by feeding extracted rows through the validator', async () => {
    // Activate a rule first
    const rule = await parserService.createRuleSet(PROFILE_ID, 'Import Rule', 'html', htmlSelectors, htmlMappings);
    if (!rule.ok) return;
    await parserService.markCanaryReady(rule.data.id);
    const canary = await parserService.runCanaryWithDefaultExtract(rule.data.id, [
      buildSample('A', 'Body', '2024-01-01', '3'),
    ]);
    expect(canary.ok).toBe(true);
    await parserService.activateRuleSet(rule.data.id);

    // Build a multi-card HTML document
    const fullHtml = `<html><body>
      ${buildSample('Red Card', 'Red body', '2024-02-01', '4')}
      ${buildSample('Blue Card', 'Blue body', '2024-02-02', '5')}
    </body></html>`;

    // Extract from HTML using the active rule
    const activeRule = (await parserService.listRuleSets(PROFILE_ID))
      .find(r => r.status === 'active' && r.sourceType === 'html')!;
    expect(activeRule).toBeTruthy();

    const { extractFromHtml } = await import('$lib/utils/html-parser');
    const fieldSelectors: Record<string, string> = {};
    for (const m of activeRule.fieldMappings) fieldSelectors[m.targetField] = m.sourceSelector;
    const extracted = extractFromHtml(
      fullHtml,
      activeRule.selectors[0].selectorType as 'css' | 'xpath',
      activeRule.selectors[0].expression,
      fieldSelectors
    );
    expect(extracted.rows.length).toBe(2);

    // Feed through import
    const batch = await importService.createImportBatch(PROFILE_ID, 'inbox.html', 'html_snapshot');
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
    expect(cards.map(c => c.title).sort()).toEqual(['Blue Card', 'Red Card']);
  });

  it('imports JSON snapshots via parser rule default extractor', async () => {
    const jsonSelectors: RuleSelector[] = [{ selectorType: 'jsonpath', expression: '$', description: 'root' }];
    const jsonMappings: FieldMapping[] = [
      { sourceSelector: 'heading', targetField: 'title' },
      { sourceSelector: 'content', targetField: 'body' },
      { sourceSelector: 'day', targetField: 'date' },
      { sourceSelector: 'rating', targetField: 'mood' },
    ];

    const rule = await parserService.createRuleSet(PROFILE_ID, 'JSON Rule', 'json', jsonSelectors, jsonMappings);
    if (!rule.ok) return;
    await parserService.markCanaryReady(rule.data.id);

    const samples = [
      JSON.stringify({ heading: 'Hello', content: 'World body', day: '2024-03-01', rating: '4' }),
      JSON.stringify({ heading: 'Second', content: 'More body', day: '2024-03-02', rating: '3' }),
    ];
    const canary = await parserService.runCanaryWithDefaultExtract(rule.data.id, samples);
    expect(canary.ok).toBe(true);
    if (canary.ok) expect(canary.data.status).toBe('passed');
  });
});
