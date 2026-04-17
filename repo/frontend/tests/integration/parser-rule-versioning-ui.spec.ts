import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { writable } from 'svelte/store';

// Mock the auth store before anything imports from it so the route sees a
// stable profile id without running the real unlock flow.
vi.mock('$lib/stores/auth.store', () => {
  const currentProfileId = writable('test-profile');
  return {
    currentProfileId,
    isUnlocked: writable(true),
    currentProfile: writable({ id: 'test-profile', username: 'tester' }),
    entryStatus: writable('unlocked'),
    cooldownRemaining: writable(0),
    error: writable(null),
    registering: writable(false),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    checkExistingProfile: vi.fn().mockResolvedValue(true),
  };
});

import { createTestDb, destroyTestDb } from '../helpers/db-factory';
import { type NebulaDB, setDbFactory } from '$lib/db/connection';
import ParserRules from '../../src/routes/ParserRules.svelte';
import VersionHistory from '../../src/components/parser-rules/VersionHistory.svelte';
import * as parserService from '$lib/services/parser-rule.service';
import type { ParsingRuleSet, RuleSelector, FieldMapping } from '$lib/types/parser-rule';

let testDb: NebulaDB;
const PROFILE_ID = 'test-profile';

const selectors: RuleSelector[] = [
  { selectorType: 'css', expression: 'article', description: 'root' },
];
const mappings: FieldMapping[] = [
  { sourceSelector: '.title', targetField: 'title' },
  { sourceSelector: '.body', targetField: 'body' },
  { sourceSelector: '.date', targetField: 'date' },
  { sourceSelector: '.mood', targetField: 'mood' },
];

beforeEach(() => {
  testDb = createTestDb();
  setDbFactory(() => testDb);
});

afterEach(async () => {
  setDbFactory(null);
  await destroyTestDb(testDb);
});

async function seedRule(overrides: Partial<ParsingRuleSet> = {}): Promise<ParsingRuleSet> {
  const r = await parserService.createRuleSet(PROFILE_ID, overrides.name ?? 'My Rule', 'html', selectors, mappings);
  if (!r.ok) throw new Error('seed failed');
  if (overrides.status && overrides.status !== 'draft') {
    await testDb.parsingRuleSets.update(r.data.id, { status: overrides.status });
  }
  return (await testDb.parsingRuleSets.get(r.data.id))!;
}

describe('parser-rule versioning in the UI', () => {
  it('renders rules with a version badge and a History button', async () => {
    await seedRule({ name: 'HistoryTest' });

    const { findAllByTestId } = render(ParserRules);

    const versionEls = await findAllByTestId('rule-version');
    expect(versionEls[0].textContent).toContain('v1');

    const historyBtns = await findAllByTestId('rule-history');
    expect(historyBtns.length).toBeGreaterThan(0);
  });

  it('updateRuleSet creates a new version observable in VersionHistory', async () => {
    const rule = await seedRule({ name: 'VersionedRule' });

    // Save v2.
    const newMappings = [...mappings, { sourceSelector: '.tags', targetField: 'tags' }];
    const result = await parserService.updateRuleSet(rule.id, selectors, newMappings);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.ruleVersion).toBe(2);

    const updated = await testDb.parsingRuleSets.get(rule.id);
    expect(updated).toBeDefined();

    const { findAllByTestId } = render(VersionHistory, { props: { rule: updated! } });
    const rows = await findAllByTestId('version-row');
    const versions = rows.map(r => r.getAttribute('data-version'));
    expect(versions).toContain('1');
    expect(versions).toContain('2');
  });

  it('activating a newer rule with the same name archives the older one', async () => {
    const v1 = await seedRule({ name: 'LiveRule' });
    await testDb.parsingRuleSets.update(v1.id, { status: 'active' });

    // A cloned-as-new rule takes over.
    const cloned = await parserService.createRuleSet(PROFILE_ID, 'LiveRule', 'html', selectors, mappings);
    if (!cloned.ok) throw new Error('clone failed');
    await testDb.parsingRuleSets.update(cloned.data.id, { status: 'canary_passed' });

    const activated = await parserService.activateRuleSet(cloned.data.id);
    expect(activated.ok).toBe(true);

    const prev = await testDb.parsingRuleSets.get(v1.id);
    const now = await testDb.parsingRuleSets.get(cloned.data.id);
    expect(prev?.status).toBe('archived');
    expect(now?.status).toBe('active');
  });

  it('VersionHistory marks the current version', async () => {
    const rule = await seedRule({ name: 'CurrentMarker' });
    await parserService.updateRuleSet(rule.id, selectors, mappings);
    const updated = await testDb.parsingRuleSets.get(rule.id);
    expect(updated?.ruleVersion).toBe(2);

    const { findAllByTestId, findByText } = render(VersionHistory, { props: { rule: updated! } });
    const rows = await findAllByTestId('version-row');
    expect(rows.length).toBe(2);

    const currentLabel = await findByText('current');
    expect(currentLabel).toBeTruthy();
  });

  it('edit button offers a new-version path for active rules', async () => {
    const rule = await seedRule({ name: 'ActiveRule' });
    await testDb.parsingRuleSets.update(rule.id, { status: 'active' });

    const { findAllByTestId, findByTestId } = render(ParserRules);

    const editBtns = await findAllByTestId('rule-edit');
    expect(editBtns.length).toBeGreaterThan(0);

    await fireEvent.click(editBtns[0]);
    const editPanel = await findByTestId('edit-panel');
    expect(editPanel.textContent).toMatch(/new rule/i);
  });
});
