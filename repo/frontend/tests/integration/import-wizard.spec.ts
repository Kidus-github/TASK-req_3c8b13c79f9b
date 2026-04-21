import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';

import ImportWizard from '../../src/components/import/ImportWizard.svelte';

import { type NebulaDB, setDbFactory } from '$lib/db/connection';
import { createTestDb, destroyTestDb } from '../helpers/db-factory';
import { register, logout } from '$lib/stores/auth.store';
import { clearToasts, toasts } from '$lib/stores/toast.store';
import { setWorkerFactory, __resetForTests } from '$lib/services/queue-runner.service';
import { fakeWorkerFactory } from '../helpers/fake-worker';
import * as parserService from '$lib/services/parser-rule.service';
import { get } from 'svelte/store';

let testDb: NebulaDB;
let profileId: string;

function makeJsonFile(name: string, title: string): File {
  const payload = JSON.stringify([
    {
      title,
      body: `${title} body`,
      date: '2024-05-01',
      mood: 4,
      tags: ['imported'],
    },
  ]);
  const file = new File([payload], name, { type: 'application/json' });
  if (typeof (file as File & { text?: () => Promise<string> }).text !== 'function') {
    Object.defineProperty(file, 'text', { value: () => Promise.resolve(payload) });
  }
  return file;
}

function makeHtmlFile(name: string): File {
  const payload = '<article><h1>Title</h1></article>';
  const file = new File([payload], name, { type: 'text/html' });
  if (typeof (file as File & { text?: () => Promise<string> }).text !== 'function') {
    Object.defineProperty(file, 'text', { value: () => Promise.resolve(payload) });
  }
  return file;
}

beforeEach(async () => {
  testDb = createTestDb();
  setDbFactory(() => testDb);
  setWorkerFactory(() => fakeWorkerFactory({ progressSteps: [20, 60, 90] }) as unknown as Worker);
  clearToasts();
  await register('demo', 'demopass1');
  profileId = (await testDb.profiles.toCollection().first())!.id;
});

afterEach(async () => {
  cleanup();
  __resetForTests();
  clearToasts();
  logout();
  setDbFactory(null);
  await destroyTestDb(testDb);
});

describe('ImportWizard', () => {
  it('shows parser-rule controls and selects the active JSON rule by default', async () => {
    const created = await parserService.createRuleSet(
      profileId,
      'JSON Import Rule',
      'json',
      [{ selectorType: 'jsonpath', expression: '$.items[*]', description: 'items' }],
      [
        { sourceSelector: '$.title', targetField: 'title' },
        { sourceSelector: '$.body', targetField: 'body' },
        { sourceSelector: '$.date', targetField: 'date' },
        { sourceSelector: '$.mood', targetField: 'mood' },
      ],
    );
    if (!created.ok) throw new Error('Failed to seed parser rule');
    await testDb.parsingRuleSets.update(created.data.id, { status: 'active' });

    const { container, findByText } = render(ImportWizard);

    expect(await findByText('Duplicate Handling')).toBeTruthy();
    const dedupeSelect = container.querySelector<HTMLSelectElement>('#dedupe-mode');
    expect(dedupeSelect).toBeTruthy();

    await fireEvent.change(dedupeSelect!, { target: { value: 'overwrite_by_id' } });
    expect(container.textContent).toContain('Each row');
    expect(container.textContent).toContain('overwrite the card');

    const parserToggle = container.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(parserToggle).toBeTruthy();
    await fireEvent.click(parserToggle!);

    await findByText(/JSON Import Rule/);
    const ruleSelect = await waitFor(() => {
      const el = container.querySelector<HTMLSelectElement>('#json-rule');
      expect(el).toBeTruthy();
      expect(el!.value).toBe(created.data.id);
      return el!;
    });

    expect(ruleSelect.value).toBe(created.data.id);
    expect(container.textContent).toContain('JSON Import Rule');
  });

  it('imports a JSON file, completes, and resets back to upload state', async () => {
    const { container, findByText, queryByText } = render(ImportWizard);
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input, 'file input rendered').toBeTruthy();

    const firstFile = makeJsonFile('direct.json', 'Direct Import Card');
    Object.defineProperty(input!, 'files', { value: [firstFile], configurable: true });
    await fireEvent.change(input!);

    await waitFor(() => {
      expect(container.textContent).toContain('1 valid');
    });
    await fireEvent.click(await findByText(/Import 1 Valid Rows/i));

    expect(await findByText('Import Complete')).toBeTruthy();
    expect(await findByText(/1 cards imported/i)).toBeTruthy();

    await fireEvent.click(await findByText('Import Another File'));

    await waitFor(() => {
      expect(container.textContent).toContain('Duplicate Handling');
    });
    expect(queryByText('Import Complete')).toBeNull();
  });

  it('blocks HTML snapshot import when no active HTML parser rule exists', async () => {
    const { container } = render(ImportWizard);
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input, 'file input rendered').toBeTruthy();

    const htmlFile = makeHtmlFile('snapshot.html');
    Object.defineProperty(input!, 'files', { value: [htmlFile], configurable: true });
    await fireEvent.change(input!);

    await waitFor(() => {
      const currentToasts = get(toasts);
      expect(
        currentToasts.some((toast) =>
          toast.message.includes('HTML imports require an active parser rule'),
        ),
      ).toBe(true);
    });

    expect(container.textContent).toContain('Duplicate Handling');
    expect(container.textContent).not.toContain('Parsing & validating via worker');
  });
});
