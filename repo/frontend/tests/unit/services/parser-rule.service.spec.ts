import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, destroyTestDb } from '../../helpers/db-factory';
import { type NebulaDB, setDbFactory } from '$lib/db/connection';
import * as parserService from '$lib/services/parser-rule.service';
import type { RuleSelector, FieldMapping } from '$lib/types/parser-rule';
import { config } from '$lib/config';

let testDb: NebulaDB;
const PROFILE_ID = 'test-profile';

beforeEach(() => {
  testDb = createTestDb();
  setDbFactory(() => testDb);
});

afterEach(async () => {
  setDbFactory(null);
  await destroyTestDb(testDb);
});

const defaultSelectors: RuleSelector[] = [
  { selectorType: 'css', expression: '.card', description: 'Card container' },
];

const defaultMappings: FieldMapping[] = [
  { sourceSelector: '.title', targetField: 'title' },
  { sourceSelector: '.body', targetField: 'body' },
  { sourceSelector: '.date', targetField: 'date' },
  { sourceSelector: '.mood', targetField: 'mood' },
];

describe('parser-rule.service', () => {
  describe('createRuleSet', () => {
    it('creates a rule set in draft status', async () => {
      const result = await parserService.createRuleSet(PROFILE_ID, 'Test Rule', 'html', defaultSelectors, defaultMappings);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.status).toBe('draft');
        expect(result.data.ruleVersion).toBe(1);
        expect(result.data.name).toBe('Test Rule');
      }
    });

    it('creates initial version record', async () => {
      const result = await parserService.createRuleSet(PROFILE_ID, 'Test', 'html', defaultSelectors, defaultMappings);
      if (!result.ok) return;
      const versions = await parserService.getRuleVersions(result.data.id);
      expect(versions).toHaveLength(1);
      expect(versions[0].version).toBe(1);
    });
  });

  describe('updateRuleSet', () => {
    it('increments version on update', async () => {
      const created = await parserService.createRuleSet(PROFILE_ID, 'Test', 'html', defaultSelectors, defaultMappings);
      if (!created.ok) return;

      const updated = await parserService.updateRuleSet(
        created.data.id,
        [{ selectorType: 'xpath', expression: '//div', description: 'Updated' }],
        defaultMappings
      );
      expect(updated.ok).toBe(true);
      if (updated.ok) {
        expect(updated.data.ruleVersion).toBe(2);
        expect(updated.data.status).toBe('draft');
      }

      const versions = await parserService.getRuleVersions(created.data.id);
      expect(versions).toHaveLength(2);
    });

    it('rejects update on active rule set', async () => {
      const created = await parserService.createRuleSet(PROFILE_ID, 'Test', 'html', defaultSelectors, defaultMappings);
      if (!created.ok) return;

      // Fast-track to active
      await testDb.parsingRuleSets.update(created.data.id, { status: 'active' });

      const result = await parserService.updateRuleSet(created.data.id, defaultSelectors, defaultMappings);
      expect(result.ok).toBe(false);
    });
  });

  describe('canary testing', () => {
    it('runs canary and passes with good data', async () => {
      const created = await parserService.createRuleSet(PROFILE_ID, 'Test', 'html', defaultSelectors, defaultMappings);
      if (!created.ok) return;

      await parserService.markCanaryReady(created.data.id);

      const samples = ['sample1', 'sample2', 'sample3'];
      const extractFn = () => ({
        title: 'Test Title',
        body: 'Test Body',
        date: '2024-01-01',
        mood: '3',
      });

      const result = await parserService.runCanary(created.data.id, samples, extractFn);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.status).toBe('passed');
        expect(result.data.passCount).toBe(3);
      }

      const ruleSet = await parserService.getRuleSet(created.data.id);
      expect(ruleSet?.status).toBe('canary_passed');
    });

    it('fails canary when extraction fails', async () => {
      const created = await parserService.createRuleSet(PROFILE_ID, 'Test', 'html', defaultSelectors, defaultMappings);
      if (!created.ok) return;

      await parserService.markCanaryReady(created.data.id);

      const samples = ['s1', 's2', 's3', 's4', 's5'];
      const extractFn = (_: string) => ({
        title: '',
        body: '',
        date: '',
        mood: '',
      });

      const result = await parserService.runCanary(created.data.id, samples, extractFn);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.status).toBe('failed');
        expect(result.data.failCount).toBe(5);
      }
    });

    it('blocks activation without passing canary', async () => {
      const created = await parserService.createRuleSet(PROFILE_ID, 'Test', 'html', defaultSelectors, defaultMappings);
      if (!created.ok) return;

      const result = await parserService.activateRuleSet(created.data.id);
      expect(result.ok).toBe(false);
    });
  });

  describe('canary threshold is config-driven', () => {
    // These tests guard against regressing the config-threshold fix by hard-coding
    // the failure threshold back into parser-rule.service. If the service reads
    // the runtime config, toggling `config.canaryFailureThreshold` must flip the
    // pass/fail verdict for a rate that sits between the two thresholds.
    const originalThreshold = config.canaryFailureThreshold;
    afterEach(() => {
      config.canaryFailureThreshold = originalThreshold;
    });

    it('fails the canary when observed failure rate exceeds a strict threshold', async () => {
      config.canaryFailureThreshold = 0.1; // strict — any failure fails.
      const created = await parserService.createRuleSet(PROFILE_ID, 'Strict', 'html', defaultSelectors, defaultMappings);
      if (!created.ok) return;
      await parserService.markCanaryReady(created.data.id);

      // 5 samples, 1 fails → failureRate = 0.2 which is > 0.1 (strict).
      let i = 0;
      const extractFn = () => {
        i++;
        return i === 1
          ? { title: '', body: '', date: '', mood: '' }
          : { title: 'T', body: 'B', date: '2024-01-01', mood: '3' };
      };

      const result = await parserService.runCanary(created.data.id, ['s1','s2','s3','s4','s5'], extractFn);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data.status).toBe('failed');
    });

    it('passes the same scenario when the threshold is relaxed via config', async () => {
      config.canaryFailureThreshold = 0.5; // relaxed — up to 50% failure is OK.
      const created = await parserService.createRuleSet(PROFILE_ID, 'Relaxed', 'html', defaultSelectors, defaultMappings);
      if (!created.ok) return;
      await parserService.markCanaryReady(created.data.id);

      let i = 0;
      const extractFn = () => {
        i++;
        return i === 1
          ? { title: '', body: '', date: '', mood: '' }
          : { title: 'T', body: 'B', date: '2024-01-01', mood: '3' };
      };

      const result = await parserService.runCanary(created.data.id, ['s1','s2','s3','s4','s5'], extractFn);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data.status).toBe('passed');
    });

    it('does not export the legacy hardcoded constant (regression guard)', async () => {
      const mod = await import('$lib/services/parser-rule.service');
      expect((mod as any).CANARY_FAILURE_THRESHOLD).toBeUndefined();
    });
  });

  describe('activateRuleSet', () => {
    it('activates canary-passed rule set', async () => {
      const created = await parserService.createRuleSet(PROFILE_ID, 'Test', 'html', defaultSelectors, defaultMappings);
      if (!created.ok) return;

      await parserService.markCanaryReady(created.data.id);
      await parserService.runCanary(created.data.id, ['s'], () => ({
        title: 'T', body: 'B', date: '2024-01-01', mood: '3',
      }));

      const result = await parserService.activateRuleSet(created.data.id);
      expect(result.ok).toBe(true);

      const ruleSet = await parserService.getRuleSet(created.data.id);
      expect(ruleSet?.status).toBe('active');
    });
  });
});
