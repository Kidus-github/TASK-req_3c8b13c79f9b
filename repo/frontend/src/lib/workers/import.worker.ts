import { parseCsv } from '$lib/utils/csv-parser';
import { parseJsonImport } from '$lib/utils/json-parser';
import { validateCardDraft, normalizeTags, isValidCalendarDate } from '$lib/utils/validation';
import type { ImportCommand, ImportResponse, RawRow, RowValidationResult, NormalizedCardRow, FieldError } from './protocol';

let cancelled = false;

self.onmessage = (event: MessageEvent<ImportCommand>) => {
  const cmd = event.data;

  if (cmd.command === 'cancel') {
    cancelled = true;
    respond({ id: cmd.id, jobId: cmd.jobId, type: 'cancelled', data: undefined });
    return;
  }

  cancelled = false;

  if (cmd.command === 'parse-csv') {
    handleParseCsv(cmd);
  } else if (cmd.command === 'parse-json') {
    handleParseJson(cmd);
  } else if (cmd.command === 'validate-rows') {
    handleValidateRows(cmd);
  }
};

function respond(response: ImportResponse) {
  self.postMessage(response);
}

function handleParseCsv(cmd: ImportCommand & { command: 'parse-csv' }) {
  const { text } = cmd.payload as { text: string };
  const result = parseCsv(text);

  if (result.errors.length > 0 && result.rows.length === 0) {
    respond({ id: cmd.id, jobId: cmd.jobId, type: 'error', data: { message: result.errors.join('; ') } });
    return;
  }

  const rows: RawRow[] = result.rows.map((data, i) => ({
    rowNumber: i + 1,
    data,
  }));

  respond({
    id: cmd.id,
    jobId: cmd.jobId,
    type: 'parse-complete',
    data: { rows, totalRows: rows.length },
  });
}

function handleParseJson(cmd: ImportCommand & { command: 'parse-json' }) {
  const { text } = cmd.payload as { text: string };
  const result = parseJsonImport(text);

  if (result.errors.length > 0 && result.rows.length === 0) {
    respond({ id: cmd.id, jobId: cmd.jobId, type: 'error', data: { message: result.errors.join('; ') } });
    return;
  }

  const rows: RawRow[] = result.rows.map((data, i) => ({
    rowNumber: i + 1,
    data,
  }));

  respond({
    id: cmd.id,
    jobId: cmd.jobId,
    type: 'parse-complete',
    data: { rows, totalRows: rows.length },
  });
}

function handleValidateRows(cmd: ImportCommand & { command: 'validate-rows' }) {
  const { rows, maxRows } = cmd.payload as { rows: RawRow[]; maxRows: number };

  if (rows.length > maxRows) {
    respond({
      id: cmd.id,
      jobId: cmd.jobId,
      type: 'error',
      data: { message: `Batch exceeds maximum of ${maxRows} rows (got ${rows.length})`, code: 'LIMIT_EXCEEDED' },
    });
    return;
  }

  const results: RowValidationResult[] = [];

  for (let i = 0; i < rows.length; i++) {
    if (cancelled) {
      respond({ id: cmd.id, jobId: cmd.jobId, type: 'cancelled', data: undefined });
      return;
    }

    const row = rows[i];
    const result = validateRow(row);
    results.push(result);

    if ((i + 1) % 100 === 0 || i === rows.length - 1) {
      respond({
        id: cmd.id,
        jobId: cmd.jobId,
        type: 'progress',
        data: { parsed: i + 1, total: rows.length },
      });
    }
  }

  respond({
    id: cmd.id,
    jobId: cmd.jobId,
    type: 'validation-complete',
    data: { results },
  });
}

function validateRow(row: RawRow): RowValidationResult {
  const data = row.data;
  const errors: FieldError[] = [];
  const warnings: string[] = [];

  const title = (data.title ?? '').trim();
  if (!title) {
    errors.push({ field: 'title', message: 'Title is required' });
  } else if (title.length > 30) {
    errors.push({ field: 'title', message: 'Title must be 30 characters or fewer' });
  }

  const body = (data.body ?? data.content ?? data.description ?? '').trim();
  if (!body) {
    errors.push({ field: 'body', message: 'Body is required' });
  } else if (body.length > 500) {
    errors.push({ field: 'body', message: 'Body must be 500 characters or fewer' });
  }

  const dateStr = (data.date ?? '').trim();
  if (!dateStr) {
    errors.push({ field: 'date', message: 'Date is required' });
  } else if (!isValidCalendarDate(dateStr)) {
    errors.push({ field: 'date', message: 'Date must be a valid YYYY-MM-DD date' });
  }

  const moodStr = (data.mood ?? '').trim();
  const mood = parseInt(moodStr, 10);
  if (!moodStr) {
    errors.push({ field: 'mood', message: 'Mood is required' });
  } else if (isNaN(mood) || mood < 1 || mood > 5) {
    errors.push({ field: 'mood', message: 'Mood must be an integer from 1 to 5' });
  }

  const tagsStr = data.tags ?? '';
  let tags: string[] = [];
  if (tagsStr) {
    tags = tagsStr.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
    const unique = [...new Set(tags)];
    if (unique.length > 5) {
      errors.push({ field: 'tags', message: 'Maximum 5 tags allowed' });
    }
    tags = unique;
  }

  if (errors.length > 0) {
    return { rowNumber: row.rowNumber, valid: false, normalized: null, errors, warnings };
  }

  const normalized: NormalizedCardRow = {
    title,
    body,
    date: dateStr,
    mood,
    tags: tags.slice(0, 5),
  };

  return { rowNumber: row.rowNumber, valid: true, normalized, errors: [], warnings };
}
