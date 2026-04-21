import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import FileDropZone from '../../../src/components/import/FileDropZone.svelte';

function makeEvents(sink: Record<string, unknown[]>) {
  return Object.fromEntries(
    Object.keys(sink).map((name) => [name, (e: CustomEvent) => sink[name].push(e.detail)])
  );
}

describe('FileDropZone', () => {
  it('dispatches a csv file selection with normalized type', async () => {
    const sink = { file: [] as unknown[] };
    const { container } = render(FileDropZone, { events: makeEvents(sink) });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['title,body,date,mood'], 'cards.csv', { type: 'text/csv' });

    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await fireEvent.change(input);

    expect(sink.file).toEqual([{ file, type: 'csv' }]);
  });

  it('dispatches dropped html files as html_snapshot', async () => {
    const sink = { file: [] as unknown[] };
    const { getByRole } = render(FileDropZone, { events: makeEvents(sink) });
    const zone = getByRole('button');
    const file = new File(['<html></html>'], 'snapshot.html', { type: 'text/html' });

    await fireEvent.drop(zone, { dataTransfer: { files: [file] } });

    expect(sink.file).toEqual([{ file, type: 'html_snapshot' }]);
  });

  it('ignores dropped files while disabled', async () => {
    const sink = { file: [] as unknown[] };
    const { getByRole } = render(FileDropZone, {
      props: { disabled: true },
      events: makeEvents(sink),
    });
    const zone = getByRole('button');
    const file = new File(['{}'], 'cards.json', { type: 'application/json' });

    await fireEvent.drop(zone, { dataTransfer: { files: [file] } });

    expect(sink.file).toEqual([]);
  });
});
