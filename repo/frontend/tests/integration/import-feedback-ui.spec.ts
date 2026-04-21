import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';

import ImportProgress from '../../src/components/import/ImportProgress.svelte';
import ValidationReport from '../../src/components/import/ValidationReport.svelte';
import type { ImportRowResult } from '$lib/types/import';

function makeEvents(sink: Record<string, unknown[]>): Record<string, (e: CustomEvent) => void> {
  const out: Record<string, (e: CustomEvent) => void> = {};
  for (const name of Object.keys(sink)) {
    out[name] = (e: CustomEvent) => sink[name].push(e.detail);
  }
  return out;
}

function row(id: string, rowNumber: number, status: ImportRowResult['status']): ImportRowResult {
  return {
    id,
    importBatchId: 'batch-1',
    rowNumber,
    rawPayload: { title: `Raw ${rowNumber}` },
    normalizedPayload: status === 'valid' ? { title: `Normalized ${rowNumber}` } : null,
    status,
    errors: status === 'invalid' ? [{ field: 'title', message: 'Required' }] : [],
    warnings: [],
    resultCardId: null,
  };
}

describe('ImportProgress', () => {
  it('renders status, percentage, and dispatches cancel', async () => {
    const sink: Record<string, unknown[]> = { cancel: [] };
    const { container, getByText } = render(ImportProgress, {
      props: { progress: 2, total: 4, status: 'Validating rows...', cancellable: true },
      // @ts-expect-error Svelte 5 mount option
      events: makeEvents(sink),
    });

    expect(container.textContent).toContain('Validating rows...');
    expect(container.textContent).toContain('2/4 (50%)');
    expect(container.querySelector('[style="width: 50%;"]')).toBeTruthy();

    await fireEvent.click(getByText('Cancel'));
    expect(sink.cancel).toHaveLength(1);
  });

  it('handles zero-total and hidden cancel state', () => {
    const { container, queryByText } = render(ImportProgress, {
      props: { progress: 0, total: 0, status: 'Waiting...', cancellable: false },
    });

    expect(container.textContent).toContain('0/0 (0%)');
    expect(container.querySelector('[style="width: 0%;"]')).toBeTruthy();
    expect(queryByText('Cancel')).toBeNull();
  });
});

describe('ValidationReport', () => {
  it('filters valid and invalid rows and dispatches footer actions', async () => {
    const rows = [row('r1', 1, 'valid'), row('r2', 2, 'invalid')];
    const sink: Record<string, unknown[]> = { commit: [], cancel: [], downloadErrors: [] };
    const { container, getByText } = render(ValidationReport, {
      props: {
        rows,
        validCount: 1,
        invalidCount: 1,
      },
      // @ts-expect-error Svelte 5 mount option
      events: makeEvents(sink),
    });

    expect(container.textContent).toContain('1 valid');
    expect(container.textContent).toContain('1 invalid');
    expect(container.textContent).toContain('2 total');
    expect(container.textContent).toContain('Normalized 1');
    expect(container.textContent).toContain('title: Required');

    await fireEvent.click(getByText('Valid'));
    expect(container.textContent).toContain('Normalized 1');
    expect(container.textContent).not.toContain('title: Required');

    await fireEvent.click(getByText('Invalid'));
    expect(container.textContent).toContain('title: Required');
    expect(container.textContent).not.toContain('Normalized 1');

    await fireEvent.click(getByText('Download Error Log'));
    await fireEvent.click(getByText('Cancel'));
    await fireEvent.click(getByText('Import 1 Valid Rows'));

    expect(sink.downloadErrors).toHaveLength(1);
    expect(sink.cancel).toHaveLength(1);
    expect(sink.commit).toHaveLength(1);
  });

  it('disables commit when there are no valid rows', () => {
    const { getByText } = render(ValidationReport, {
      props: {
        rows: [row('r2', 2, 'invalid')],
        validCount: 0,
        invalidCount: 1,
      },
    });

    expect((getByText('Import 0 Valid Rows') as HTMLButtonElement).disabled).toBe(true);
  });
});
