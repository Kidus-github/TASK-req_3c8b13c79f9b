import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';

import VersionHistory from '../../src/components/parser-rules/VersionHistory.svelte';

import type { ParsingRuleSet, ParserRuleVersion } from '$lib/types/parser-rule';
import * as parserService from '$lib/services/parser-rule.service';

const baseRule: ParsingRuleSet = {
  id: 'rule-1',
  profileId: 'profile-1',
  name: 'My Rule',
  sourceType: 'html',
  ruleVersion: 2,
  status: 'draft',
  selectors: [{ selectorType: 'css', expression: 'article.card', description: 'card' }],
  fieldMappings: [
    { sourceSelector: '.title', targetField: 'title' },
    { sourceSelector: '.body', targetField: 'body' },
  ],
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_500,
  lastCanaryRunId: null,
};

const versions: ParserRuleVersion[] = [
  {
    id: 'ver-1',
    ruleSetId: 'rule-1',
    version: 1,
    selectors: [{ selectorType: 'css', expression: 'article', description: 'root' }],
    fieldMappings: [{ sourceSelector: '.title', targetField: 'title' }],
    createdAt: 1_700_000_000_100,
  },
  {
    id: 'ver-2',
    ruleSetId: 'rule-1',
    version: 2,
    selectors: [{ selectorType: 'css', expression: 'article.card', description: 'card' }],
    fieldMappings: [
      { sourceSelector: '.title', targetField: 'title' },
      { sourceSelector: '.body', targetField: 'body' },
    ],
    createdAt: 1_700_000_000_200,
  },
];

function makeEvents(sink: Record<string, unknown[]>) {
  return Object.fromEntries(
    Object.keys(sink).map((name) => [name, (e: CustomEvent) => sink[name].push(e.detail)]),
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('VersionHistory', () => {
  it('renders versions newest-first and marks the current version', async () => {
    vi.spyOn(parserService, 'getRuleVersions').mockResolvedValue([...versions]);

    const { container, findAllByTestId, findByText } = render(VersionHistory, {
      props: { rule: baseRule },
    });

    expect(await findByText('Version History')).toBeTruthy();
    expect(await findByText('2 versions')).toBeTruthy();

    const rows = await findAllByTestId('version-row');
    expect(rows.map((row) => row.getAttribute('data-version'))).toEqual(['2', '1']);
    expect(container.textContent).toContain('current');
    expect(container.textContent).toContain('[css] article.card');
    expect(container.textContent).toContain('body = .body');
  });

  it('dispatches select with the chosen version payload', async () => {
    vi.spyOn(parserService, 'getRuleVersions').mockResolvedValue([...versions]);
    const sink = { select: [] as unknown[] };

    const { findAllByTestId } = render(VersionHistory, {
      props: { rule: baseRule },
      events: makeEvents(sink),
    });

    const rows = await findAllByTestId('version-row');
    await fireEvent.click(rows[1]);

    await waitFor(() => {
      expect(sink.select).toHaveLength(1);
    });
    expect((sink.select[0] as { version: ParserRuleVersion }).version.version).toBe(1);
  });

  it('shows the empty-state message when no versions are recorded', async () => {
    vi.spyOn(parserService, 'getRuleVersions').mockResolvedValue([]);

    const { findByText } = render(VersionHistory, {
      props: { rule: baseRule },
    });

    expect(await findByText('No versions recorded for this rule yet.')).toBeTruthy();
  });
});
