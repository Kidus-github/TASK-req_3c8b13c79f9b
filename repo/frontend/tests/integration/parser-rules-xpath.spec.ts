import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, destroyTestDb } from '../helpers/db-factory';
import { type NebulaDB, setDbFactory } from '$lib/db/connection';
import * as parserService from '$lib/services/parser-rule.service';
import * as importService from '$lib/services/import.service';
import * as cardService from '$lib/services/card.service';
import { setWorkerFactory, runJob, __resetForTests } from '$lib/services/queue-runner.service';
import type { RuleSelector, FieldMapping } from '$lib/types/parser-rule';
import type { RawRow, RowValidationResult } from '$lib/workers/protocol';
import { extractFromHtml, validateXPath } from '$lib/utils/html-parser';
import { fakeWorkerFactory } from '../helpers/fake-worker';

let testDb: NebulaDB;
const PROFILE_ID = 'profile-xpath';

beforeEach(() => {
  testDb = createTestDb();
  setDbFactory(() => testDb);
  setWorkerFactory(() => fakeWorkerFactory() as unknown as Worker);
});

afterEach(async () => {
  setDbFactory(null);
  __resetForTests();
  await destroyTestDb(testDb);
});

const xpathSelectors: RuleSelector[] = [
  { selectorType: 'xpath', expression: "//div[@class='card']", description: 'XPath container' },
];
const xpathMappings: FieldMapping[] = [
  { sourceSelector: ".//h2[@class='title']", targetField: 'title' },
  { sourceSelector: ".//p[@class='body']", targetField: 'body' },
  { sourceSelector: ".//span[@class='date']", targetField: 'date' },
  { sourceSelector: ".//span[@class='mood']", targetField: 'mood' },
];

function buildCard(title: string, body: string, date: string, mood: string): string {
  return `<div class="card"><h2 class="title">${title}</h2><p class="body">${body}</p><span class="date">${date}</span><span class="mood">${mood}</span></div>`;
}

describe('integration: XPath parser rule flow', () => {
  it('extractFromHtml resolves XPath container and field selectors', () => {
    const html = `<html><body>${buildCard('Alpha', 'A body', '2024-05-01', '3')}${buildCard('Beta', 'B body', '2024-05-02', '5')}</body></html>`;

    const fields: Record<string, string> = {};
    for (const m of xpathMappings) fields[m.targetField] = m.sourceSelector;

    const out = extractFromHtml(html, 'xpath', xpathSelectors[0].expression, fields);
    expect(out.errors).toEqual([]);
    expect(out.rows).toEqual([
      { title: 'Alpha', body: 'A body', date: '2024-05-01', mood: '3' },
      { title: 'Beta', body: 'B body', date: '2024-05-02', mood: '5' },
    ]);
  });

  it('runs a canary on XPath rules and activates on success', async () => {
    const rule = await parserService.createRuleSet(PROFILE_ID, 'XPath Rule', 'html', xpathSelectors, xpathMappings);
    expect(rule.ok).toBe(true);
    if (!rule.ok) return;

    await parserService.markCanaryReady(rule.data.id);

    const samples = [
      `<html><body>${buildCard('Alpha', 'A body', '2024-05-01', '3')}</body></html>`,
      `<html><body>${buildCard('Beta', 'B body', '2024-05-02', '4')}</body></html>`,
      `<html><body>${buildCard('Gamma', 'C body', '2024-05-03', '5')}</body></html>`,
    ];
    const canary = await parserService.runCanaryWithDefaultExtract(rule.data.id, samples);
    expect(canary.ok).toBe(true);
    if (canary.ok) {
      expect(canary.data.status).toBe('passed');
      expect(canary.data.passCount).toBe(3);
      expect(canary.data.resultsSummary[0].extractedFields.title).toBe('Alpha');
    }

    const act = await parserService.activateRuleSet(rule.data.id);
    expect(act.ok).toBe(true);
  });

  it('drives a full worker-backed HTML import using XPath selectors through review + commit', async () => {
    const rule = await parserService.createRuleSet(PROFILE_ID, 'Import XPath', 'html', xpathSelectors, xpathMappings);
    if (!rule.ok) return;
    await parserService.markCanaryReady(rule.data.id);
    const canary = await parserService.runCanaryWithDefaultExtract(rule.data.id, [
      `<html><body>${buildCard('Seed', 'seed body', '2024-06-01', '3')}</body></html>`,
    ]);
    expect(canary.ok).toBe(true);
    await parserService.activateRuleSet(rule.data.id);

    const activeRule = (await parserService.listRuleSets(PROFILE_ID))
      .find(r => r.status === 'active' && r.sourceType === 'html');
    expect(activeRule).toBeTruthy();
    expect(activeRule!.selectors[0].selectorType).toBe('xpath');

    const fullHtml = `<html><body>
      ${buildCard('Red Card', 'Red body', '2024-07-01', '4')}
      ${buildCard('Blue Card', 'Blue body', '2024-07-02', '5')}
    </body></html>`;

    const fieldSelectors: Record<string, string> = {};
    for (const m of activeRule!.fieldMappings) fieldSelectors[m.targetField] = m.sourceSelector;

    // --- Worker-backed extraction (fake worker speaks the real protocol) ---
    const batch = await importService.createImportBatch(PROFILE_ID, 'inbox.html', 'html_snapshot');
    const extractJob = await runJob<{ rows: Record<string, string>[]; count: number; errors: string[] }>(
      'parser_full_extract',
      {
        sourceType: 'html',
        content: fullHtml,
        containerSelector: activeRule!.selectors[0].expression,
        selectorType: activeRule!.selectors[0].selectorType,
        fieldSelectors,
      },
      { payloadRef: batch.id },
    );

    expect(extractJob.result.rows).toHaveLength(2);
    expect(extractJob.result.rows[0].title).toBe('Red Card');
    expect(extractJob.result.rows[1].title).toBe('Blue Card');

    // --- Validate via worker (same fake path) ---
    const validateJob = await runJob<{ rows: RawRow[]; results: RowValidationResult[]; count: number }>(
      'import_parse_validate',
      { format: 'json', text: JSON.stringify(extractJob.result.rows), maxRows: 1000 },
      { payloadRef: batch.id },
    );
    expect(validateJob.result.results.every(r => r.valid)).toBe(true);

    // --- Store + commit ---
    await importService.storeValidationResults(batch.id, validateJob.result.results, validateJob.result.rows);
    const commit = await importService.commitValidRows(batch.id, PROFILE_ID, 'create_new');
    expect(commit.ok).toBe(true);
    if (!commit.ok) return;
    expect(commit.data.imported).toBe(2);

    const cards = await cardService.listActiveCards(PROFILE_ID);
    expect(cards.map(c => c.title).sort()).toEqual(['Blue Card', 'Red Card']);
  });

  it('surfaces XPath syntax errors in extraction result errors', () => {
    const html = `<html><body>${buildCard('A', 'body', '2024-01-01', '3')}</body></html>`;
    const out = extractFromHtml(html, 'xpath', '//[[bad]]', { title: './/title' });
    expect(out.rows).toEqual([]);
    expect(out.errors[0]).toMatch(/Invalid XPath/);
  });

  it('validateXPath rejects invalid syntax and accepts valid syntax', () => {
    expect(validateXPath("//div[@class='x']")).toBe(true);
    expect(validateXPath("//[[nope]]")).toBe(false);
  });

  it('produces a canary failure path for invalid XPath without crashing', async () => {
    const badSelectors: RuleSelector[] = [
      { selectorType: 'xpath', expression: '//[[invalid]]', description: 'broken' },
    ];
    const rule = await parserService.createRuleSet(PROFILE_ID, 'Bad XPath', 'html', badSelectors, xpathMappings);
    if (!rule.ok) return;
    await parserService.markCanaryReady(rule.data.id);

    const samples = Array.from({ length: 5 }, (_, i) =>
      `<html><body>${buildCard(`T${i}`, 'b', '2024-01-01', '3')}</body></html>`,
    );
    const canary = await parserService.runCanaryWithDefaultExtract(rule.data.id, samples);
    expect(canary.ok).toBe(true);
    if (canary.ok) {
      expect(canary.data.status).toBe('failed');
      expect(canary.data.failCount).toBe(5);
    }
  });
});
