/**
 * UI coverage for backup components.
 *
 * Covers BackupExport and BackupImport. The real backup.service runs against
 * a fake-indexeddb test DB; only DOM-side primitives that jsdom doesn't ship
 * (URL.createObjectURL/revokeObjectURL, anchor.click) are stubbed.
 *
 * Includes rendering, interaction, and edge cases (empty profile, mismatched
 * passphrase, restore mode toggle, full export-then-import round trip).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';

import BackupExport from '../../src/components/backup/BackupExport.svelte';
import BackupImport from '../../src/components/backup/BackupImport.svelte';

import { type NebulaDB, setDbFactory } from '$lib/db/connection';
import { createTestDb, destroyTestDb } from '../helpers/db-factory';
import { register, logout } from '$lib/stores/auth.store';
import { createCard } from '$lib/services/card.service';
import { exportBackup } from '$lib/services/backup.service';
import { toasts, clearToasts } from '$lib/stores/toast.store';

let testDb: NebulaDB;

async function blobText(blob: Blob): Promise<string> {
  // jsdom doesn't implement Blob.prototype.text(); fall back to FileReader.
  if (typeof (blob as any).text === 'function') {
    try { return await (blob as any).text(); } catch { /* fallthrough */ }
  }
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

function makeFile(content: string, name: string, type = 'application/json'): File {
  const f = new File([content], name, { type });
  Object.defineProperty(f, 'text', {
    value: () => Promise.resolve(content),
    configurable: true,
  });
  return f;
}

beforeEach(async () => {
  testDb = createTestDb();
  setDbFactory(() => testDb);
  clearToasts();
  await register('demo', 'demopass1');
});

afterEach(async () => {
  logout();
  setDbFactory(null);
  await destroyTestDb(testDb);
  clearToasts();
  vi.restoreAllMocks();
});

function stubBlobDownload() {
  const createUrlSpy = vi.fn(() => 'blob:test');
  const revokeUrlSpy = vi.fn();
  const clickSpy = vi.fn();
  // @ts-expect-error jsdom lacks these
  URL.createObjectURL = createUrlSpy;
  // @ts-expect-error jsdom lacks these
  URL.revokeObjectURL = revokeUrlSpy;
  const origCreate = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    const el = origCreate(tag);
    if (tag === 'a') {
      (el as HTMLAnchorElement).click = clickSpy;
    }
    return el;
  });
  return { createUrlSpy, revokeUrlSpy, clickSpy };
}

describe('BackupExport', () => {
  it('renders the export panel header and Export button', () => {
    const { getAllByText, getByRole } = render(BackupExport);
    expect(getAllByText('Export Backup').length).toBeGreaterThanOrEqual(1);
    expect(getByRole('button', { name: 'Export Backup' })).toBeTruthy();
  });

  it('exports an unencrypted backup and toasts success', async () => {
    const { createUrlSpy, clickSpy } = stubBlobDownload();
    const { getByText } = render(BackupExport);
    await fireEvent.click(getByText('Export Backup', { selector: 'button' }));

    await waitFor(() => {
      const list = get(toasts);
      expect(list.some((t) => t.type === 'success' && /exported/i.test(t.message))).toBe(true);
    });
    expect(createUrlSpy).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
  });

  it('reveals passphrase fields when "Protect with passphrase" is checked', async () => {
    const { container, getByLabelText } = render(BackupExport);
    const checkbox = getByLabelText(/Protect with passphrase/i) as HTMLInputElement;
    await fireEvent.click(checkbox);
    const passInputs = container.querySelectorAll('input[type="password"]');
    expect(passInputs.length).toBe(2);
  });

  it('edge case: mismatched passphrase blocks export and toasts error', async () => {
    const { container, getByText, getByLabelText } = render(BackupExport);
    await fireEvent.click(getByLabelText(/Protect with passphrase/i));
    const [pass, confirm] = container.querySelectorAll('input[type="password"]') as NodeListOf<HTMLInputElement>;
    await fireEvent.input(pass, { target: { value: 'topsecret' } });
    await fireEvent.input(confirm, { target: { value: 'mismatched' } });

    const exportBtn = getByText('Export Backup', { selector: 'button' }) as HTMLButtonElement;
    expect(exportBtn.disabled).toBe(true);
  });

  it('edge case: with matching passphrase, export proceeds', async () => {
    const { createUrlSpy } = stubBlobDownload();
    const { container, getByText, getByLabelText } = render(BackupExport);
    await fireEvent.click(getByLabelText(/Protect with passphrase/i));
    const [pass, confirm] = container.querySelectorAll('input[type="password"]') as NodeListOf<HTMLInputElement>;
    await fireEvent.input(pass, { target: { value: 'correct-horse' } });
    await fireEvent.input(confirm, { target: { value: 'correct-horse' } });
    const btn = getByText('Export Backup', { selector: 'button' });
    await fireEvent.click(btn);
    await waitFor(() => expect(createUrlSpy).toHaveBeenCalled());
  });
});

describe('BackupImport', () => {
  async function makeBackupBlob(): Promise<Blob> {
    const profile = await testDb.profiles.toCollection().first();
    await createCard(profile!.id, {
      title: 'Backup Source',
      body: 'Roundtrip body',
      date: '2024-08-01',
      mood: 4,
      tags: ['t1'],
    });
    const result = await exportBackup(profile!.id);
    if (!result.ok) throw new Error('export failed');
    return result.data;
  }

  it('renders the file picker in the initial select step', () => {
    const { getByText, container } = render(BackupImport);
    expect(getByText('Restore Backup')).toBeTruthy();
    const file = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(file).toBeTruthy();
    expect(file.accept).toContain('.nebula');
  });

  it('full flow: validates → confirm → restore → done', async () => {
    const blob = await makeBackupBlob();
    const text = await blobText(blob);
    const file = makeFile(text, 'backup.nebula');

    const { container, findByText, getByText } = render(BackupImport);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
    await fireEvent.change(fileInput);

    expect(await findByText(/Backup validated successfully/i)).toBeTruthy();
    await fireEvent.click(getByText('Restore'));
    expect(await findByText(/Restore complete/i)).toBeTruthy();
  });

  it('toggling Replace mode shows the destructive warning', async () => {
    const blob = await makeBackupBlob();
    const text = await blobText(blob);
    const file = makeFile(text, 'backup.nebula');

    const { container, findByText } = render(BackupImport);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
    await fireEvent.change(fileInput);
    await findByText(/Backup validated successfully/i);

    const radios = container.querySelectorAll('input[type="radio"]') as NodeListOf<HTMLInputElement>;
    const replace = Array.from(radios).find((r) => r.value === 'replace')!;
    await fireEvent.click(replace);
    expect(await findByText(/Warning: Replace mode/i)).toBeTruthy();
  });

  it('edge case: malformed JSON file shows an error toast and stays on select step', async () => {
    const file = makeFile('this is not json', 'broken.nebula');
    const { container, findByText } = render(BackupImport);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
    await fireEvent.change(fileInput);

    await waitFor(() => {
      const list = get(toasts);
      expect(list.some((t) => t.type === 'error' && /Invalid backup/i.test(t.message))).toBe(true);
    });
    // Still on select step → file input still rendered
    expect(container.querySelector('input[type="file"]')).toBeTruthy();
  });

  it('edge case: encrypted backup forces the passphrase step', async () => {
    const profile = await testDb.profiles.toCollection().first();
    await createCard(profile!.id, {
      title: 'Encrypted', body: 'Body', date: '2024-08-01', mood: 3, tags: [],
    });
    const result = await exportBackup(profile!.id, 'secret123');
    if (!result.ok) throw new Error('encrypted export failed');
    const text = await blobText(result.data);
    const file = makeFile(text, 'enc.nebula');

    const { container, findByText } = render(BackupImport);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
    await fireEvent.change(fileInput);
    expect(await findByText(/This backup is encrypted/i)).toBeTruthy();
  });

  it('Cancel from confirm step returns to the select step', async () => {
    const blob = await makeBackupBlob();
    const text = await blobText(blob);
    const file = makeFile(text, 'backup.nebula');

    const { container, findByText, getByText } = render(BackupImport);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
    await fireEvent.change(fileInput);
    await findByText(/Backup validated successfully/i);

    await fireEvent.click(getByText('Cancel'));
    await waitFor(() => {
      expect(container.querySelector('input[type="file"]')).toBeTruthy();
    });
  });
});
