import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';

import ParserRules from '../../src/routes/ParserRules.svelte';

import { createTestDb, destroyTestDb } from '../helpers/db-factory';
import { type NebulaDB, setDbFactory } from '$lib/db/connection';
import { register, logout } from '$lib/stores/auth.store';
import { clearToasts } from '$lib/stores/toast.store';
import * as parserService from '$lib/services/parser-rule.service';
import type { ParsingRuleSet, RuleSelector, FieldMapping } from '$lib/types/parser-rule';

let testDb: NebulaDB;
let profileId: string;

const selectors: RuleSelector[] = [
  { selectorType: 'css', expression: 'article', description: 'root' },
];

const mappings: FieldMapping[] = [
  { sourceSelector: '.title', targetField: 'title' },
  { sourceSelector: '.body', targetField: 'body' },
  { sourceSelector: '.date', targetField: 'date' },
  { sourceSelector: '.mood', targetField: 'mood' },
];

async function seedRule(overrides: Partial<ParsingRuleSet> = {}): Promise<ParsingRuleSet> {
  const created = await parserService.createRuleSet(
    profileId,
    overrides.name ?? 'My Rule',
    overrides.sourceType ?? 'html',
    overrides.selectors ?? selectors,
    overrides.fieldMappings ?? mappings
  );
  if (!created.ok) throw new Error('Failed to seed parser rule');
  if (overrides.status && overrides.status !== 'draft') {
    await testDb.parsingRuleSets.update(created.data.id, { status: overrides.status });
  }
  return (await testDb.parsingRuleSets.get(created.data.id))!;
}

beforeEach(async () => {
  testDb = createTestDb();
  setDbFactory(() => testDb);
  clearToasts();
  await register('demo', 'demopass1');
  profileId = (await testDb.profiles.toCollection().first())!.id;
});

afterEach(async () => {
  cleanup();
  clearToasts();
  logout();
  setDbFactory(null);
  await destroyTestDb(testDb);
});

describe('parser-rule versioning in the UI', () => {
  it('renders seeded rules with their current version and history action', async () => {
    await seedRule({ name: 'HistoryTest' });

    const { findByText, findAllByTestId } = render(ParserRules);

    expect(await findByText('HistoryTest')).toBeTruthy();
    const versionEls = await findAllByTestId('rule-version');
    expect(versionEls.some((el) => el.textContent?.includes('v1'))).toBe(true);
    expect((await findAllByTestId('rule-history')).length).toBeGreaterThan(0);
  });

  it('editing a draft rule through the route creates a new version visible in Version History', async () => {
    const rule = await seedRule({ name: 'Versioned Rule' });

    const { container, findAllByTestId, findByText } = render(ParserRules);
    await fireEvent.click((await findAllByTestId('rule-edit'))[0]);

    const selectorInput = container.querySelector<HTMLInputElement>('input[placeholder="Selector expression"]');
    expect(selectorInput).toBeTruthy();
    await fireEvent.input(selectorInput!, { target: { value: 'article.card' } });
    await fireEvent.click(await findByText('Save Rule'));

    await waitFor(async () => {
      const updated = await testDb.parsingRuleSets.get(rule.id);
      expect(updated?.ruleVersion).toBe(2);
    });

    expect(await findByText('current')).toBeTruthy();
    const versionRows = await findAllByTestId('version-row');
    expect(versionRows.map((row) => row.getAttribute('data-version'))).toEqual(['2', '1']);
    expect(container.textContent).toContain('[css] article.card');
  });

  it('activating a canary-passed rule archives the previously active rule with the same name', async () => {
    const activeRule = await seedRule({ name: 'LiveRule' });
    await testDb.parsingRuleSets.update(activeRule.id, { status: 'active' });

    const replacement = await parserService.createRuleSet(profileId, 'LiveRule', 'html', selectors, mappings);
    if (!replacement.ok) throw new Error('Failed to create replacement rule');
    await testDb.parsingRuleSets.update(replacement.data.id, { status: 'canary_passed' });

    const result = await parserService.activateRuleSet(replacement.data.id);
    expect(result.ok).toBe(true);

    const previous = await testDb.parsingRuleSets.get(activeRule.id);
    const current = await testDb.parsingRuleSets.get(replacement.data.id);
    expect(previous?.status).toBe('archived');
    expect(current?.status).toBe('active');
  });

  it('shows the clone-as-new guidance when editing an active rule from the route', async () => {
    await seedRule({ name: 'ActiveRule', status: 'active' });

    const { findAllByTestId, findByTestId } = render(ParserRules);
    await fireEvent.click((await findAllByTestId('rule-edit'))[0]);

    const editPanel = await findByTestId('edit-panel');
    expect(editPanel.textContent).toMatch(/new rule/i);
    expect(editPanel.textContent).toMatch(/active/i);
  });
});
