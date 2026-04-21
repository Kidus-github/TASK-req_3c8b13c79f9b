/**
 * UI coverage for parser-rule components.
 *
 * Covers RuleEditor and CanaryRunner with:
 *   - rendering tests
 *   - interaction tests (input/save/cancel, file upload, run, activate)
 *   - edge cases (empty samples, missing fields, error toasts)
 *
 * Real Svelte components rendered against a fake-indexeddb-backed parser
 * service. No UI modules are mocked; toast store is read directly to assert
 * user-facing messages.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { tick } from 'svelte';

import RuleEditor from '../../src/components/parser-rules/RuleEditor.svelte';
import CanaryRunner from '../../src/components/parser-rules/CanaryRunner.svelte';

import { type NebulaDB, setDbFactory } from '$lib/db/connection';
import { createTestDb, destroyTestDb } from '../helpers/db-factory';
import * as parserService from '$lib/services/parser-rule.service';
import type { RuleSelector, FieldMapping, ParsingRuleSet } from '$lib/types/parser-rule';
import { toasts, clearToasts } from '$lib/stores/toast.store';

let testDb: NebulaDB;

function makeEvents(sink: Record<string, unknown[]>): Record<string, (e: CustomEvent) => void> {
  const out: Record<string, (e: CustomEvent) => void> = {};
  for (const name of Object.keys(sink)) {
    out[name] = (e: CustomEvent) => sink[name].push(e.detail);
  }
  return out;
}

function htmlSelectors(): RuleSelector[] {
  return [{ selectorType: 'css', expression: '.card', description: 'container' }];
}

function htmlMappings(): FieldMapping[] {
  return [
    { sourceSelector: '.title', targetField: 'title' },
    { sourceSelector: '.body', targetField: 'body' },
    { sourceSelector: '.date', targetField: 'date' },
    { sourceSelector: '.mood', targetField: 'mood' },
  ];
}

function buildSample(title: string, body: string, date: string, mood: string) {
  return `<html><body><div class="card"><h2 class="title">${title}</h2><p class="body">${body}</p><span class="date">${date}</span><span class="mood">${mood}</span></div></body></html>`;
}

// jsdom's File implementation does not implement .text(); patch each test File
// with a real async text() that returns the constructor input.
function makeFile(content: string, name: string, type = 'text/html'): File {
  const f = new File([content], name, { type });
  Object.defineProperty(f, 'text', {
    value: () => Promise.resolve(content),
    configurable: true,
  });
  return f;
}

beforeEach(() => {
  testDb = createTestDb();
  setDbFactory(() => testDb);
  clearToasts();
});

afterEach(async () => {
  setDbFactory(null);
  await destroyTestDb(testDb);
  clearToasts();
});

describe('RuleEditor', () => {
  it('renders default selectors and field mappings', () => {
    const { container } = render(RuleEditor);
    expect(container.querySelector('#rule-name')).toBeTruthy();
    const sourceSelect = container.querySelector('#source-type') as HTMLSelectElement;
    expect(sourceSelect).toBeTruthy();
    expect(sourceSelect.value).toBe('html');
    const inputs = container.querySelectorAll('input[placeholder="Selector expression"]');
    expect(inputs.length).toBeGreaterThan(0);
    const mapInputs = container.querySelectorAll('input[placeholder="Source selector"]');
    expect(mapInputs.length).toBe(4);
  });

  it('adds a selector row when "+ Add" is clicked under Selectors', async () => {
    const { container, getAllByText } = render(RuleEditor);
    const before = container.querySelectorAll('input[placeholder="Selector expression"]').length;
    const addBtns = getAllByText('+ Add');
    await fireEvent.click(addBtns[0]); // Selectors header
    await tick();
    const after = container.querySelectorAll('input[placeholder="Selector expression"]').length;
    expect(after).toBe(before + 1);
  });

  it('adds a mapping row when "+ Add" is clicked under Field Mappings', async () => {
    const { container, getAllByText } = render(RuleEditor);
    const before = container.querySelectorAll('input[placeholder="Source selector"]').length;
    const addBtns = getAllByText('+ Add');
    await fireEvent.click(addBtns[1]); // Field Mappings header
    await tick();
    const after = container.querySelectorAll('input[placeholder="Source selector"]').length;
    expect(after).toBe(before + 1);
  });

  it('dispatches save with the entered name, source type, selectors, and mappings', async () => {
    const sink: Record<string, unknown[]> = { save: [], cancel: [] };
    const { container, getByText } = render(RuleEditor, {
      props: {
        name: 'Initial',
        sourceType: 'html',
        selectors: htmlSelectors(),
        fieldMappings: htmlMappings(),
      },
      // @ts-expect-error events is a Svelte 5 mount option
      events: makeEvents(sink),
    });

    const nameInput = container.querySelector('#rule-name') as HTMLInputElement;
    await fireEvent.input(nameInput, { target: { value: 'My Awesome Rule' } });

    await fireEvent.click(getByText('Save Rule'));

    expect(sink.save).toHaveLength(1);
    const detail = sink.save[0] as { name: string; sourceType: string; selectors: RuleSelector[]; fieldMappings: FieldMapping[] };
    expect(detail.name).toBe('My Awesome Rule');
    expect(detail.sourceType).toBe('html');
    expect(detail.selectors).toHaveLength(1);
    expect(detail.fieldMappings).toHaveLength(4);
  });

  it('dispatches cancel when Cancel is clicked', async () => {
    const sink: Record<string, unknown[]> = { cancel: [] };
    const { getByText } = render(RuleEditor, {
      // @ts-expect-error events is a Svelte 5 mount option
      events: makeEvents(sink),
    });
    await fireEvent.click(getByText('Cancel'));
    expect(sink.cancel).toHaveLength(1);
  });

  it('changing the source type select to JSON updates the bound value', async () => {
    const { container } = render(RuleEditor);
    const select = container.querySelector('#source-type') as HTMLSelectElement;
    select.value = 'json';
    await fireEvent.change(select);
    await tick();
    expect(select.value).toBe('json');
  });

  it('edge case: dispatches save even with empty rule name (parent layer validates)', async () => {
    const sink: Record<string, unknown[]> = { save: [] };
    const { getByText } = render(RuleEditor, {
      // @ts-expect-error events is a Svelte 5 mount option
      events: makeEvents(sink),
    });
    await fireEvent.click(getByText('Save Rule'));
    expect(sink.save).toHaveLength(1);
    const detail = sink.save[0] as { name: string };
    expect(detail.name).toBe('');
  });
});

describe('CanaryRunner', () => {
  async function seedRule(): Promise<ParsingRuleSet> {
    const created = await parserService.createRuleSet('p-1', 'Rule', 'html', htmlSelectors(), htmlMappings());
    if (!created.ok) throw new Error('seed rule failed');
    await parserService.markCanaryReady(created.data.id);
    return (await parserService.getRuleSet(created.data.id))!;
  }

  it('renders the upload prompt and Run Canary button (disabled with no samples)', async () => {
    const rule = await seedRule();
    const { getByText, container } = render(CanaryRunner, { props: { rule } });
    expect(getByText(/Upload sample HTML\/JSON files/i)).toBeTruthy();
    const runBtn = getByText('Run Canary') as HTMLButtonElement;
    expect(runBtn.disabled).toBe(true);
    expect(container.querySelector('input[type="file"]')).toBeTruthy();
  });

  it('shows a warning toast when Run Canary is invoked without samples', async () => {
    const rule = await seedRule();
    const { getByText } = render(CanaryRunner, { props: { rule } });
    // The button is disabled so simulate click via dispatching the event directly.
    // The component's run() guards against empty samples and toasts a warning.
    // Force-click by removing the disabled attr first.
    const runBtn = getByText('Run Canary') as HTMLButtonElement;
    runBtn.disabled = false;
    await fireEvent.click(runBtn);
    await waitFor(() => {
      const list = get(toasts);
      expect(list.some((t) => t.type === 'warning' && /sample/i.test(t.message))).toBe(true);
    });
  });

  it('runs the canary on uploaded HTML samples and reports a passed result', async () => {
    const rule = await seedRule();
    const { container, getByText } = render(CanaryRunner, { props: { rule } });

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const samples = [
      makeFile(buildSample('A', 'BodyA', '2024-01-01', '3'), 'a.html'),
      makeFile(buildSample('B', 'BodyB', '2024-01-02', '4'), 'b.html'),
      makeFile(buildSample('C', 'BodyC', '2024-01-03', '5'), 'c.html'),
    ];
    Object.defineProperty(fileInput, 'files', {
      value: samples,
      configurable: true,
    });
    await fireEvent.change(fileInput);

    // Wait for samples to register
    await waitFor(() => {
      expect(container.textContent).toMatch(/a\.html/);
    });

    const runBtn = getByText('Run Canary');
    await fireEvent.click(runBtn);

    await waitFor(() => {
      expect(container.textContent).not.toContain('Running...');
    }, { timeout: 15_000 });
    await waitFor(() => {
      expect(container.textContent).toContain('PASSED');
    }, { timeout: 15_000 });
    await waitFor(() => {
      const list = get(toasts);
      expect(list.some((t) => t.type === 'success' && /Canary passed/i.test(t.message))).toBe(true);
    }, { timeout: 15_000 });
  });

  it('removes a sample when its Remove button is clicked', async () => {
    const rule = await seedRule();
    const { container, findAllByText } = render(CanaryRunner, { props: { rule } });

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(fileInput, 'files', {
      value: [makeFile('<x/>', 'x.html')],
      configurable: true,
    });
    await fireEvent.change(fileInput);

    const [removeBtn] = await findAllByText('Remove');
    await fireEvent.click(removeBtn);
    await waitFor(() => {
      expect(container.textContent).not.toMatch(/x\.html/);
    });
  });

  it('exposes Activate Rule and dispatches updated when status is canary_passed', async () => {
    // Run a real canary so the rule transitions to canary_passed.
    const created = await parserService.createRuleSet('p-1', 'Rule', 'html', htmlSelectors(), htmlMappings());
    if (!created.ok) throw new Error('seed failed');
    await parserService.markCanaryReady(created.data.id);
    const samples = [
      buildSample('A', 'B', '2024-01-01', '3'),
      buildSample('B', 'B', '2024-01-02', '3'),
    ];
    await parserService.runCanaryWithDefaultExtract(created.data.id, samples);
    const rule = (await parserService.getRuleSet(created.data.id))!;
    expect(rule.status).toBe('canary_passed');

    const sink: Record<string, unknown[]> = { updated: [] };
    const { getByText } = render(CanaryRunner, {
      props: { rule },
      // @ts-expect-error events is a Svelte 5 mount option
      events: makeEvents(sink),
    });

    const activateBtn = getByText('Activate Rule');
    await fireEvent.click(activateBtn);
    await waitFor(() => {
      expect(sink.updated).toHaveLength(1);
    });
    const updated = (await parserService.getRuleSet(created.data.id))!;
    expect(updated.status).toBe('active');
  });

  it('edge case: hides the Activate button when status is draft/canary_ready', async () => {
    const rule = await seedRule(); // status === 'canary_ready'
    const { queryByText } = render(CanaryRunner, { props: { rule } });
    expect(queryByText('Activate Rule')).toBeNull();
  });
});
