import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';

import ImportRoute from '../../src/routes/Import.svelte';

import { type NebulaDB, setDbFactory } from '$lib/db/connection';
import { createTestDb, destroyTestDb } from '../helpers/db-factory';
import { register, logout } from '$lib/stores/auth.store';
import { clearToasts } from '$lib/stores/toast.store';
import { setWorkerFactory, __resetForTests } from '$lib/services/queue-runner.service';
import { fakeWorkerFactory } from '../helpers/fake-worker';

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

describe('Import route reset flow', () => {
  it('"Import Another File" returns the real wizard to a usable upload state after a completed import', async () => {
    const { container, findByText, queryByText } = render(ImportRoute);
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input, 'file input rendered').toBeTruthy();

    const firstFile = makeJsonFile('first.json', 'First Import Card');
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

    const secondInput = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(secondInput, 'file input rendered after reset').toBeTruthy();
    const secondFile = makeJsonFile('second.json', 'Second Import Card');
    Object.defineProperty(secondInput!, 'files', { value: [secondFile], configurable: true });
    await fireEvent.change(secondInput!);

    await waitFor(() => {
      expect(container.textContent).toContain('Import 1 Valid');
    }, { timeout: 5_000 });
    const secondImportButton = await findByText((content, element) =>
      element?.tagName.toLowerCase() === 'button' && /Import 1 Valid/i.test(content),
    );
    await fireEvent.click(secondImportButton);
    expect(await findByText(/1 cards imported/i)).toBeTruthy();

    const cards = await testDb.cards.where('profileId').equals(profileId).toArray();
    expect(cards.map((card) => card.title).sort()).toEqual(['First Import Card', 'Second Import Card']);
  });
});
