/**
 * Branch coverage filler for parser-rule.service: error paths, archive,
 * archive-on-activate, runCanary preconditions, defaultExtract / JSON snapshot
 * extraction edge cases.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { type NebulaDB, setDbFactory } from '$lib/db/connection';
import { createTestDb, destroyTestDb } from '../../helpers/db-factory';
import * as parserService from '$lib/services/parser-rule.service';
import type { RuleSelector, FieldMapping } from '$lib/types/parser-rule';

let testDb: NebulaDB;
const PROFILE_ID = 'parser-extra-profile';

const htmlSelectors: RuleSelector[] = [
  { selectorType: 'css', expression: '.card', description: 'container' },
];
const htmlMappings: FieldMapping[] = [
  { sourceSelector: '.title', targetField: 'title' },
  { sourceSelector: '.body', targetField: 'body' },
  { sourceSelector: '.date', targetField: 'date' },
  { sourceSelector: '.mood', targetField: 'mood' },
];

const jsonSelectors: RuleSelector[] = [
  { selectorType: 'jsonpath', expression: '$.items', description: 'array' },
];
const jsonMappings: FieldMapping[] = [
  { sourceSelector: 'heading', targetField: 'title' },
  { sourceSelector: 'body', targetField: 'body' },
  { sourceSelector: 'date', targetField: 'date' },
  { sourceSelector: 'mood', targetField: 'mood' },
];

beforeEach(() => {
  testDb = createTestDb();
  setDbFactory(() => testDb);
});

afterEach(async () => {
  setDbFactory(null);
  await destroyTestDb(testDb);
});

describe('parser-rule.service error and archive paths', () => {
  it('updateRuleSet returns NOT_FOUND when the rule does not exist', async () => {
    const r = await parserService.updateRuleSet('missing', htmlSelectors, htmlMappings);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('NOT_FOUND');
  });

  it('updateRuleSet rejects an active rule', async () => {
    const created = await parserService.createRuleSet(PROFILE_ID, 'R', 'html', htmlSelectors, htmlMappings);
    if (!created.ok) throw new Error('seed failed');
    await testDb.parsingRuleSets.update(created.data.id, { status: 'active' });
    const r = await parserService.updateRuleSet(created.data.id, htmlSelectors, htmlMappings);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('VALIDATION');
  });

  it('markCanaryReady requires draft state', async () => {
    const created = await parserService.createRuleSet(PROFILE_ID, 'R', 'html', htmlSelectors, htmlMappings);
    if (!created.ok) throw new Error('seed failed');
    await testDb.parsingRuleSets.update(created.data.id, { status: 'archived' });
    const r = await parserService.markCanaryReady(created.data.id);
    expect(r.ok).toBe(false);
  });

  it('markCanaryReady on a missing id returns NOT_FOUND', async () => {
    const r = await parserService.markCanaryReady('missing');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('NOT_FOUND');
  });

  it('runCanary on a missing rule returns NOT_FOUND', async () => {
    const r = await parserService.runCanary('missing', ['x'], () => ({}));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('NOT_FOUND');
  });

  it('runCanary blocks rules not in canary_ready/canary_failed state', async () => {
    const created = await parserService.createRuleSet(PROFILE_ID, 'R', 'html', htmlSelectors, htmlMappings);
    if (!created.ok) throw new Error('seed failed');
    const r = await parserService.runCanary(created.data.id, ['x'], () => ({ title: 'T' }));
    expect(r.ok).toBe(false);
  });

  it('runCanary captures extractor exceptions as failed samples', async () => {
    const created = await parserService.createRuleSet(PROFILE_ID, 'R', 'html', htmlSelectors, htmlMappings);
    if (!created.ok) throw new Error('seed failed');
    await parserService.markCanaryReady(created.data.id);
    const r = await parserService.runCanary(created.data.id, ['x', 'y', 'z', 'a', 'b'], () => {
      throw new Error('extractor exploded');
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.failCount).toBeGreaterThan(0);
      expect(r.data.status).toBe('failed');
    }
  });

  it('activateRuleSet on missing rule returns NOT_FOUND', async () => {
    const r = await parserService.activateRuleSet('missing');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('NOT_FOUND');
  });

  it('activateRuleSet blocks rules not in canary_passed state', async () => {
    const created = await parserService.createRuleSet(PROFILE_ID, 'R', 'html', htmlSelectors, htmlMappings);
    if (!created.ok) throw new Error('seed failed');
    const r = await parserService.activateRuleSet(created.data.id);
    expect(r.ok).toBe(false);
  });

  it('activateRuleSet archives any existing same-name active rule', async () => {
    const a = await parserService.createRuleSet(PROFILE_ID, 'SameName', 'html', htmlSelectors, htmlMappings);
    if (!a.ok) throw new Error('seed failed');
    await testDb.parsingRuleSets.update(a.data.id, { status: 'active' });

    const b = await parserService.createRuleSet(PROFILE_ID, 'SameName', 'html', htmlSelectors, htmlMappings);
    if (!b.ok) throw new Error('seed failed');
    await testDb.parsingRuleSets.update(b.data.id, { status: 'canary_passed' });

    const r = await parserService.activateRuleSet(b.data.id);
    expect(r.ok).toBe(true);
    expect((await parserService.getRuleSet(a.data.id))?.status).toBe('archived');
    expect((await parserService.getRuleSet(b.data.id))?.status).toBe('active');
  });

  it('archiveRuleSet sets status to archived', async () => {
    const created = await parserService.createRuleSet(PROFILE_ID, 'R', 'html', htmlSelectors, htmlMappings);
    if (!created.ok) throw new Error('seed failed');
    const r = await parserService.archiveRuleSet(created.data.id);
    expect(r.ok).toBe(true);
    expect((await parserService.getRuleSet(created.data.id))?.status).toBe('archived');
  });

  it('runCanaryWithDefaultExtract handles missing rule', async () => {
    const r = await parserService.runCanaryWithDefaultExtract('missing', []);
    expect(r.ok).toBe(false);
  });
});

describe('extractFromJsonSnapshot edge cases', () => {
  it('rejects non-json source-type rules', () => {
    const out = parserService.extractFromJsonSnapshot({
      id: 'r', profileId: PROFILE_ID, name: 'r', sourceType: 'html',
      ruleVersion: 1, status: 'draft', selectors: htmlSelectors,
      fieldMappings: htmlMappings, createdAt: 0, updatedAt: 0, lastCanaryRunId: null,
    }, '[]');
    expect(out.errors[0]).toMatch(/source type must be json/i);
  });

  it('rejects malformed JSON input', () => {
    const out = parserService.extractFromJsonSnapshot({
      id: 'r', profileId: PROFILE_ID, name: 'r', sourceType: 'json',
      ruleVersion: 1, status: 'draft', selectors: jsonSelectors,
      fieldMappings: jsonMappings, createdAt: 0, updatedAt: 0, lastCanaryRunId: null,
    }, 'not json');
    expect(out.errors[0]).toMatch(/Invalid JSON/);
  });

  it('extracts items via container jsonpath and field mappings', () => {
    const text = JSON.stringify({
      items: [
        { heading: 'A', body: 'b1', date: '2024-01-01', mood: 3 },
        { heading: 'B', body: 'b2', date: '2024-01-02', mood: 4 },
      ],
    });
    const out = parserService.extractFromJsonSnapshot({
      id: 'r', profileId: PROFILE_ID, name: 'r', sourceType: 'json',
      ruleVersion: 1, status: 'active', selectors: jsonSelectors,
      fieldMappings: jsonMappings, createdAt: 0, updatedAt: 0, lastCanaryRunId: null,
    }, text);
    expect(out.rows).toHaveLength(2);
    expect(out.rows[0].title).toBe('A');
    expect(out.rows[1].mood).toBe('4');
  });

  it('emits per-item error for non-object items in the array', () => {
    const text = JSON.stringify({ items: ['plain', { heading: 'OK', body: 'b', date: '2024-01-01', mood: 3 }] });
    const out = parserService.extractFromJsonSnapshot({
      id: 'r', profileId: PROFILE_ID, name: 'r', sourceType: 'json',
      ruleVersion: 1, status: 'active', selectors: jsonSelectors,
      fieldMappings: jsonMappings, createdAt: 0, updatedAt: 0, lastCanaryRunId: null,
    }, text);
    expect(out.rows).toHaveLength(1);
    expect(out.errors.some((e) => /not an object/.test(e))).toBe(true);
  });
});

describe('defaultExtract edge cases', () => {
  it('returns {} when sourceType=html but selector is jsonpath (mismatch guard)', () => {
    const fn = parserService.defaultExtract({
      id: 'r', profileId: PROFILE_ID, name: 'r', sourceType: 'html',
      ruleVersion: 1, status: 'draft',
      selectors: [{ selectorType: 'jsonpath', expression: '$.x', description: '' }],
      fieldMappings: htmlMappings, createdAt: 0, updatedAt: 0, lastCanaryRunId: null,
    });
    expect(fn('<div></div>', [], [])).toEqual({});
  });

  it('returns {} for invalid JSON input on a json-rule extractor', () => {
    const fn = parserService.defaultExtract({
      id: 'r', profileId: PROFILE_ID, name: 'r', sourceType: 'json',
      ruleVersion: 1, status: 'draft',
      selectors: jsonSelectors,
      fieldMappings: jsonMappings, createdAt: 0, updatedAt: 0, lastCanaryRunId: null,
    });
    expect(fn('not-json', [], [])).toEqual({});
  });
});
