import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { writable } from 'svelte/store';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Stub auth before anything imports from it.
vi.mock('$lib/stores/auth.store', () => {
  const currentProfileId = writable('reset-profile');
  return {
    currentProfileId,
    isUnlocked: writable(true),
    currentProfile: writable({ id: 'reset-profile', username: 'tester' }),
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

vi.mock('$lib/stores/cards.store', () => ({
  loadCards: vi.fn(async () => undefined),
  cards: writable([]),
}));

// Short-circuit the heavy pipeline — we want a fast wizard transition from
// upload -> review -> done -> upload. The fake worker + real DB path is
// covered elsewhere (live-import-progress.spec.ts).
vi.mock('$lib/services/import.service', () => ({
  createImportBatch: vi.fn(async (_profileId: string, fileName: string) => ({
    id: 'batch-' + fileName,
    profileId: 'reset-profile',
    fileName,
    fileType: 'json',
    status: 'review',
    rowCount: 1,
    validRowCount: 1,
    invalidRowCount: 0,
    skippedRowCount: 0,
    startedAt: Date.now(),
    completedAt: null,
    cancelledAt: null,
    failureReason: null,
    rawFileBlobId: null,
    jobId: null,
    dedupeMode: 'create_new',
    overwriteMode: false,
  })),
  storeValidationResults: vi.fn(async () => undefined),
  getImportRows: vi.fn(async () => ([
    {
      id: 'row-1',
      importBatchId: 'batch-first.json',
      rowNumber: 1,
      rawPayload: { title: 'A', body: 'body', date: '2024-01-01', mood: '3' },
      normalizedPayload: { title: 'A', body: 'body', date: '2024-01-01', mood: 3, tags: [] },
      status: 'valid',
      errors: [],
      warnings: [],
      resultCardId: null,
    },
  ])),
  commitValidRows: vi.fn(async () => ({
    ok: true,
    data: { imported: 1, skipped: 0, failed: 0 },
  })),
  cancelImport: vi.fn(async () => ({ ok: true, data: undefined })),
  generateErrorLog: vi.fn(async () => ''),
}));

vi.mock('$lib/services/parser-rule.service', () => ({
  listRuleSets: vi.fn(async () => []),
  getRuleSet: vi.fn(async () => null),
  extractFromJsonSnapshot: vi.fn(() => ({ rows: [], errors: [] })),
}));

vi.mock('$lib/services/queue-runner.service', () => ({
  runJob: vi.fn(async (_type: string, _payload: unknown, opts?: { onStart?: (id: string) => void }) => {
    opts?.onStart?.('fake-job-id');
    return {
      result: {
        rows: [{ rowNumber: 1, data: { title: 'A', body: 'body', date: '2024-01-01', mood: '3' } }],
        results: [
          {
            rowNumber: 1,
            valid: true,
            normalized: { title: 'A', body: 'body', date: '2024-01-01', mood: 3, tags: [] },
            errors: [],
            warnings: [],
          },
        ],
        count: 1,
      },
      job: { id: 'fake-job-id' },
    };
  }),
  cancelRunningJob: vi.fn(async () => undefined),
}));

vi.mock('$lib/stores/toast.store', () => ({
  pushToast: vi.fn(),
  toasts: writable([]),
  dismissToast: vi.fn(),
}));

vi.mock('$lib/stores/jobs.store', () => ({
  jobs: writable([]),
  activeJobs: writable([]),
  completedJobs: writable([]),
  progressDrawerOpen: writable(false),
  openProgressDrawer: vi.fn(),
  closeProgressDrawer: vi.fn(),
  toggleProgressDrawer: vi.fn(),
  loadJobs: vi.fn(async () => undefined),
}));

import ImportWizard from '../../src/components/import/ImportWizard.svelte';
import * as importService from '$lib/services/import.service';

const __dirname = dirname(fileURLToPath(import.meta.url));
const wizardPath = resolve(__dirname, '../../src/components/import/ImportWizard.svelte');

beforeEach(() => {
  vi.clearAllMocks();
  delete (globalThis as Record<string, unknown>).progress;
  delete (globalThis as Record<string, unknown>).total;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// jsdom's File doesn't implement .text(); polyfill so the wizard's async
// handleFile can read the uploaded payload.
function makeFile(name: string): File {
  const f = new File(['[]'], name, { type: 'application/json' });
  if (typeof (f as unknown as { text?: () => unknown }).text !== 'function') {
    Object.defineProperty(f, 'text', { value: () => Promise.resolve('[]') });
  }
  return f;
}

describe('ImportWizard reset path: source-level regression', () => {
  // Static guard: the bug was `reset()` writing to undeclared `progress` /
  // `total`. In Svelte's default (loose) compile those silently leak onto
  // globalThis. Parse the component script and assert every LHS identifier
  // in `reset()` is a declared `let` in the same script block.
  it('reset() only assigns to declared component state', () => {
    const src = readFileSync(wizardPath, 'utf-8');
    const scriptMatch = src.match(/<script[^>]*>([\s\S]*?)<\/script>/);
    expect(scriptMatch, 'ImportWizard has a <script> block').toBeTruthy();
    const script = scriptMatch![1];

    const declared = new Set<string>();
    for (const m of script.matchAll(/\blet\s+([A-Za-z_$][\w$]*)/g)) declared.add(m[1]);

    const resetMatch = script.match(/function\s+reset\s*\(\s*\)\s*\{([\s\S]*?)\n\s*\}/);
    expect(resetMatch, 'reset() function found').toBeTruthy();
    const body = resetMatch![1];

    const assigned = new Set<string>();
    for (const m of body.matchAll(/^\s*([A-Za-z_$][\w$]*)\s*=/gm)) assigned.add(m[1]);
    expect(assigned.size, 'reset() assigns at least one identifier').toBeGreaterThan(0);

    for (const ident of assigned) {
      expect(declared.has(ident), `reset() assigns undeclared identifier "${ident}"`).toBe(true);
    }
  });
});

describe('ImportWizard reset path: rendered flow', () => {
  it('"Import Another File" restores the wizard to a usable upload state', async () => {
    const { container, findByText, queryByText } = render(ImportWizard);

    // Trigger the file input change — Svelte's `createEventDispatcher`
    // events only fire through the component tree, so the parent's
    // `on:file` handler is only reachable by invoking FileDropZone's own
    // change/drop handler, not by dispatching a DOM CustomEvent.
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input, 'file input rendered').toBeTruthy();
    const file = makeFile('first.json');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await fireEvent.change(input);

    const commitBtn = await findByText(/Import \d+ Valid Rows/i);
    await fireEvent.click(commitBtn);

    const resetBtn = await findByText('Import Another File');
    expect(queryByText('Import Complete')).toBeTruthy();

    // The actual reset click — this is the line that crashed / silently
    // leaked globals before the fix.
    await fireEvent.click(resetBtn);

    await waitFor(() => {
      expect(container.textContent).toContain('Duplicate Handling');
    });
    expect(queryByText('Import Complete')).toBeNull();
    expect(queryByText('Import Another File')).toBeNull();

    // Global-leak regression: `progress` / `total` must not leak onto
    // globalThis from an undeclared-assignment regression.
    expect((globalThis as Record<string, unknown>).progress).toBeUndefined();
    expect((globalThis as Record<string, unknown>).total).toBeUndefined();

    expect(importService.createImportBatch).toHaveBeenCalledTimes(1);

    // Starting a second import confirms the wizard is actually usable, not
    // just visually reset.
    const input2 = container.querySelector('input[type="file"]') as HTMLInputElement;
    const secondFile = makeFile('second.json');
    Object.defineProperty(input2, 'files', { value: [secondFile], configurable: true });
    await fireEvent.change(input2);
    const secondCommit = await findByText(/Import \d+ Valid Rows/i);
    expect(secondCommit).toBeTruthy();
    expect(importService.createImportBatch).toHaveBeenCalledTimes(2);
  });
});
