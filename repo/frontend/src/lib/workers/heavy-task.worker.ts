/// <reference lib="webworker" />
/**
 * Heavy-task worker. Runs long-running work off the main thread.
 * Accepts a single `start` message with a job descriptor; emits progress,
 * log, done, error, and cancelled messages.
 *
 * Supported job types:
 *   - index_rebuild      : tokenize a batch of cards and return SearchIndexRecords
 *   - import_parse_validate : parse + validate a CSV/JSON text payload
 *   - parser_full_extract: extract rows from an HTML/JSON blob using selectors
 *   - parser_canary      : run extraction against N samples
 */

type WorkerInMsg =
  | { kind: 'start'; jobId: string; type: string; payload: unknown }
  | { kind: 'cancel'; jobId: string };

type WorkerOutMsg =
  | { kind: 'progress'; jobId: string; percent: number; note?: string }
  | { kind: 'log'; jobId: string; level: 'info' | 'warn' | 'error' | 'debug'; code: string; message: string; details?: unknown }
  | { kind: 'done'; jobId: string; result: unknown; throughput?: number }
  | { kind: 'error'; jobId: string; code: string; message: string }
  | { kind: 'cancelled'; jobId: string };

let cancelledJobs = new Set<string>();

function send(msg: WorkerOutMsg) {
  (self as unknown as Worker).postMessage(msg);
}

function log(jobId: string, level: 'info' | 'warn' | 'error' | 'debug', code: string, message: string, details?: unknown) {
  send({ kind: 'log', jobId, level, code, message, details });
}

function progress(jobId: string, percent: number, note?: string) {
  send({ kind: 'progress', jobId, percent, note });
}

(self as unknown as Worker).addEventListener('message', async (event: MessageEvent<WorkerInMsg>) => {
  const msg = event.data;
  if (msg.kind === 'cancel') {
    cancelledJobs.add(msg.jobId);
    return;
  }

  if (msg.kind !== 'start') return;
  const { jobId, type, payload } = msg;
  const started = Date.now();

  try {
    log(jobId, 'info', 'START', `Job ${type} started`);

    let result: unknown;
    switch (type) {
      case 'index_rebuild':
        result = await runIndexRebuild(jobId, payload as IndexRebuildPayload);
        break;
      case 'import_parse_validate':
        result = await runImportParseValidate(jobId, payload as ImportParseValidatePayload);
        break;
      case 'parser_full_extract':
        result = await runParserFullExtract(jobId, payload as ParserExtractPayload);
        break;
      case 'parser_canary':
        result = await runParserCanary(jobId, payload as ParserCanaryPayload);
        break;
      case 'import_commit':
        result = await runImportCommit(jobId, payload as ImportCommitPayload);
        break;
      case 'effect_precompute':
        result = await runEffectPrecompute(jobId, payload as EffectPrecomputePayload);
        break;
      default:
        throw new Error(`Unsupported job type: ${type}`);
    }

    if (cancelledJobs.has(jobId)) {
      send({ kind: 'cancelled', jobId });
      cancelledJobs.delete(jobId);
      return;
    }

    const elapsed = Math.max(1, Date.now() - started);
    const throughput = computeThroughput(type, result, elapsed);
    log(jobId, 'info', 'DONE', `Job ${type} completed in ${elapsed}ms`);
    send({ kind: 'done', jobId, result, throughput });
  } catch (e) {
    const err = e as Error;
    log(jobId, 'error', 'FAIL', err.message);
    send({ kind: 'error', jobId, code: 'WORKER_ERROR', message: err.message });
  }
});

function computeThroughput(type: string, result: unknown, elapsedMs: number): number | undefined {
  if (!result || typeof result !== 'object') return undefined;
  const r = result as Record<string, unknown>;
  const count = typeof r.count === 'number' ? r.count
    : Array.isArray(r.rows) ? r.rows.length
    : Array.isArray(r.records) ? r.records.length
    : Array.isArray(r.results) ? r.results.length
    : undefined;
  if (count == null) return undefined;
  return (count / elapsedMs) * 1000;
}

// ---------- Index Rebuild ----------
interface IndexRebuildPayload {
  cards: Array<{ id: string; title: string; body: string; tags: string[]; mood: number; date: string; deletedAt: number | null }>;
}

interface IndexedRecord {
  cardId: string;
  tokenMap: Record<string, number[]>;
  tagTerms: string[];
  mood: number;
  dateEpochDay: number;
  updatedAt: number;
  indexVersion: number;
}

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'it', 'in', 'on', 'at', 'to', 'of', 'for', 'and', 'or', 'but',
  'was', 'were', 'be', 'been', 'has', 'have', 'had', 'do', 'does', 'did',
  'this', 'that', 'with', 'from', 'by', 'as', 'not', 'no',
]);

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/).filter(t => t.length > 1 && !STOP_WORDS.has(t));
}

function dateToEpochDay(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00Z').getTime();
  return Math.floor(d / 86400000);
}

async function runIndexRebuild(jobId: string, payload: IndexRebuildPayload): Promise<{ records: IndexedRecord[]; count: number }> {
  const records: IndexedRecord[] = [];
  const total = payload.cards.length;
  const active = payload.cards.filter(c => c.deletedAt === null);

  for (let i = 0; i < active.length; i++) {
    if (cancelledJobs.has(jobId)) break;
    const card = active[i];
    const titleTokens = tokenize(card.title);
    const bodyTokens = tokenize(card.body);
    const tagTokens = card.tags.map(t => t.toLowerCase());
    const tokenMap: Record<string, number[]> = {};
    titleTokens.forEach((t, idx) => { (tokenMap[`title:${t}`] ??= []).push(idx); });
    bodyTokens.forEach((t, idx) => { (tokenMap[`body:${t}`] ??= []).push(idx); });
    tagTokens.forEach((t, idx) => { (tokenMap[`tags:${t}`] ??= []).push(idx); });

    records.push({
      cardId: card.id,
      tokenMap,
      tagTerms: tagTokens,
      mood: card.mood,
      dateEpochDay: dateToEpochDay(card.date),
      updatedAt: Date.now(),
      indexVersion: 1,
    });

    if ((i + 1) % 25 === 0 || i === active.length - 1) {
      progress(jobId, Math.round(((i + 1) / Math.max(1, total)) * 100), `Indexed ${i + 1}/${total}`);
    }
  }

  return { records, count: records.length };
}

// ---------- Import Parse + Validate ----------
interface ImportParseValidatePayload {
  format: 'csv' | 'json';
  text: string;
  maxRows: number;
}

interface ImportParseRow {
  rowNumber: number;
  data: Record<string, string>;
}

interface ImportValidationOutput {
  rows: ImportParseRow[];
  results: Array<{
    rowNumber: number;
    valid: boolean;
    normalized: { title: string; body: string; date: string; mood: number; tags: string[] } | null;
    errors: Array<{ field: string; message: string }>;
    warnings: string[];
  }>;
  count: number;
}

function isValidCalendarDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function parseCsvSimple(text: string): { rows: Record<string, string>[]; errors: string[] } {
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter(l => l.length > 0);
  if (lines.length === 0) return { rows: [], errors: ['Empty file'] };
  const headers = splitCsvLine(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, j) => { row[h] = cells[j] ?? ''; });
    rows.push(row);
  }
  return { rows, errors: [] };
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
    else if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { out.push(cur); cur = ''; }
    else { cur += ch; }
  }
  out.push(cur);
  return out.map(c => c.trim());
}

function parseJsonSimple(text: string): { rows: Record<string, string>[]; errors: string[] } {
  let parsed: unknown;
  try { parsed = JSON.parse(text); }
  catch (e) { return { rows: [], errors: [`Invalid JSON: ${(e as Error).message}`] }; }
  let items: unknown[];
  if (Array.isArray(parsed)) items = parsed;
  else if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    const k = Object.keys(obj).find(k => Array.isArray(obj[k]));
    items = k ? (obj[k] as unknown[]) : [parsed];
  } else return { rows: [], errors: ['JSON must be array or object'] };
  const rows: Record<string, string>[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const row: Record<string, string> = {};
    for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
      if (Array.isArray(v)) row[k] = v.map(String).join(', ');
      else if (v == null) row[k] = '';
      else row[k] = String(v);
    }
    rows.push(row);
  }
  return { rows, errors: [] };
}

async function runImportParseValidate(jobId: string, payload: ImportParseValidatePayload): Promise<ImportValidationOutput> {
  const parsed = payload.format === 'csv'
    ? parseCsvSimple(payload.text)
    : parseJsonSimple(payload.text);

  if (parsed.rows.length === 0) throw new Error(parsed.errors.join('; ') || 'No rows found');
  if (parsed.rows.length > payload.maxRows) {
    throw new Error(`Batch exceeds maximum of ${payload.maxRows} rows (got ${parsed.rows.length})`);
  }

  const rows: ImportParseRow[] = parsed.rows.map((data, i) => ({ rowNumber: i + 1, data }));
  const results: ImportValidationOutput['results'] = [];
  log(jobId, 'info', 'PARSED', `Parsed ${rows.length} rows`);

  for (let i = 0; i < rows.length; i++) {
    if (cancelledJobs.has(jobId)) break;
    const row = rows[i];
    const data = row.data;
    const errors: Array<{ field: string; message: string }> = [];
    const warnings: string[] = [];

    const title = (data.title ?? '').trim();
    if (!title) errors.push({ field: 'title', message: 'Title is required' });
    else if (title.length > 30) errors.push({ field: 'title', message: 'Title must be 30 characters or fewer' });

    const body = (data.body ?? data.content ?? data.description ?? '').trim();
    if (!body) errors.push({ field: 'body', message: 'Body is required' });
    else if (body.length > 500) errors.push({ field: 'body', message: 'Body must be 500 characters or fewer' });

    const dateStr = (data.date ?? '').trim();
    if (!dateStr) errors.push({ field: 'date', message: 'Date is required' });
    else if (!isValidCalendarDate(dateStr)) errors.push({ field: 'date', message: 'Date must be a valid YYYY-MM-DD date' });

    const moodStr = (data.mood ?? '').trim();
    const mood = parseInt(moodStr, 10);
    if (!moodStr) errors.push({ field: 'mood', message: 'Mood is required' });
    else if (isNaN(mood) || mood < 1 || mood > 5) errors.push({ field: 'mood', message: 'Mood must be an integer from 1 to 5' });

    const tagsStr = data.tags ?? '';
    let tags: string[] = [];
    if (tagsStr) {
      tags = [...new Set(tagsStr.split(',').map(t => t.trim().toLowerCase()).filter(Boolean))];
      if (tags.length > 5) errors.push({ field: 'tags', message: 'Maximum 5 tags allowed' });
    }

    results.push(errors.length > 0
      ? { rowNumber: row.rowNumber, valid: false, normalized: null, errors, warnings }
      : { rowNumber: row.rowNumber, valid: true, normalized: { title, body, date: dateStr, mood, tags: tags.slice(0, 5) }, errors: [], warnings });

    if ((i + 1) % 50 === 0 || i === rows.length - 1) {
      progress(jobId, Math.round(((i + 1) / rows.length) * 100), `Validated ${i + 1}/${rows.length}`);
    }
  }

  return { rows, results, count: rows.length };
}

// ---------- Parser Full Extract ----------
interface ParserExtractPayload {
  sourceType: 'html' | 'json';
  content: string;
  containerSelector: string;
  selectorType: 'css' | 'xpath' | 'jsonpath';
  fieldSelectors: Record<string, string>;
}

async function runParserFullExtract(jobId: string, payload: ParserExtractPayload): Promise<{ rows: Record<string, string>[]; count: number; errors: string[] }> {
  // HTML path — uses DOMParser + XPath via the shared html-parser helper so
  // CSS and XPath rules both execute in the worker. Falls back to raw-text
  // scrape only when DOMParser is unavailable in the host.
  if (payload.sourceType === 'html') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Parser: any = (self as any).DOMParser;
    if (!Parser) return fallbackHtmlScrape(jobId, payload);

    if (payload.selectorType !== 'css' && payload.selectorType !== 'xpath') {
      throw new Error(`HTML extraction requires selectorType 'css' or 'xpath', got '${payload.selectorType}'`);
    }

    try {
      const { extractFromHtml } = await import('../utils/html-parser');
      const total = Math.max(1, payload.content.length);
      progress(jobId, 10, 'Parsing HTML');

      const out = extractFromHtml(
        payload.content,
        payload.selectorType,
        payload.containerSelector,
        payload.fieldSelectors,
      );

      if (cancelledJobs.has(jobId)) return { rows: [], errors: [], count: 0 };
      progress(jobId, 100, `Extracted ${out.rows.length} rows`);
      return { rows: out.rows, errors: out.errors, count: out.rows.length };
    } catch (e) {
      log(jobId, 'warn', 'HTML_EXTRACT_FALLBACK', `HTML extract failed, using fallback: ${(e as Error).message}`);
      return fallbackHtmlScrape(jobId, payload);
    }
  }

  // JSON path
  try {
    const parsed = JSON.parse(payload.content) as unknown;
    const items = evaluateJsonPath(parsed, payload.containerSelector).flatMap(v => Array.isArray(v) ? v : [v]);
    const rows: Record<string, string>[] = [];
    for (let i = 0; i < items.length; i++) {
      if (cancelledJobs.has(jobId)) break;
      const row: Record<string, string> = {};
      for (const [field, path] of Object.entries(payload.fieldSelectors)) {
        const vals = evaluateJsonPath(items[i], path);
        row[field] = vals.length > 0 ? String(vals[0]) : '';
      }
      rows.push(row);
      if ((i + 1) % 25 === 0 || i === items.length - 1) {
        progress(jobId, Math.round(((i + 1) / Math.max(1, items.length)) * 100));
      }
    }
    return { rows, errors: [], count: rows.length };
  } catch (e) {
    throw new Error(`JSON extraction failed: ${(e as Error).message}`);
  }
}

function evaluateJsonPath(obj: unknown, path: string): unknown[] {
  if (!path || path === '$' || path === '$.') return [obj];
  if (!path.startsWith('$')) return [];
  const parts = path.replace(/^\$\.?/, '').split('.').filter(Boolean);
  let current: unknown[] = [obj];
  for (const part of parts) {
    const next: unknown[] = [];
    for (const item of current) {
      if (item == null || typeof item !== 'object') continue;
      if (part === '*') {
        if (Array.isArray(item)) next.push(...item);
        else next.push(...Object.values(item as Record<string, unknown>));
      } else {
        const v = (item as Record<string, unknown>)[part];
        if (v !== undefined) next.push(v);
      }
    }
    current = next;
  }
  return current;
}

function fallbackHtmlScrape(jobId: string, payload: ParserExtractPayload): { rows: Record<string, string>[]; count: number; errors: string[] } {
  // Very small fallback when DOMParser is unavailable: just strip tags.
  log(jobId, 'warn', 'FALLBACK', 'Using fallback HTML scrape');
  const text = payload.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const row: Record<string, string> = {};
  for (const field of Object.keys(payload.fieldSelectors)) row[field] = text;
  return { rows: [row], count: 1, errors: ['DOMParser unavailable; used raw text fallback'] };
}

// ---------- Parser Canary ----------
interface ParserCanaryPayload {
  samples: string[];
  sourceType: 'html' | 'json';
  containerSelector: string;
  selectorType: 'css' | 'xpath' | 'jsonpath';
  fieldSelectors: Record<string, string>;
}

async function runParserCanary(jobId: string, payload: ParserCanaryPayload): Promise<{ results: Array<{ sampleIndex: number; passed: boolean; extractedFields: Record<string, string>; errors: string[] }>; count: number; passCount: number; failCount: number }> {
  const results: Array<{ sampleIndex: number; passed: boolean; extractedFields: Record<string, string>; errors: string[] }> = [];
  let passCount = 0;
  let failCount = 0;
  const required = ['title', 'body', 'date', 'mood'];

  for (let i = 0; i < payload.samples.length; i++) {
    if (cancelledJobs.has(jobId)) break;
    const sample = payload.samples[i];
    try {
      const extracted = await runParserFullExtract(jobId + '-canary-' + i, {
        sourceType: payload.sourceType,
        content: sample,
        containerSelector: payload.containerSelector,
        selectorType: payload.selectorType,
        fieldSelectors: payload.fieldSelectors,
      });
      const firstRow = extracted.rows[0] ?? {};
      const missing = required.filter(f => !firstRow[f] || firstRow[f].trim() === '');
      if (missing.length === 0) {
        results.push({ sampleIndex: i, passed: true, extractedFields: firstRow, errors: [] });
        passCount++;
      } else {
        results.push({ sampleIndex: i, passed: false, extractedFields: firstRow, errors: missing.map(f => `Missing field: ${f}`) });
        failCount++;
      }
    } catch (e) {
      results.push({ sampleIndex: i, passed: false, extractedFields: {}, errors: [(e as Error).message] });
      failCount++;
    }
    progress(jobId, Math.round(((i + 1) / payload.samples.length) * 100), `Tested ${i + 1}/${payload.samples.length}`);
  }

  return { results, count: payload.samples.length, passCount, failCount };
}

// ---------- Import Commit ----------
interface ImportCommitRow {
  rowId: string;
  rowNumber: number;
  normalized: { title: string; body: string; date: string; mood: number; tags: string[] } | null;
  existingDuplicateCardId?: string | null;
  rawId?: string | null;
}

interface ImportCommitPayload {
  rows: ImportCommitRow[];
  dedupeMode: 'create_new' | 'skip_exact_duplicate' | 'overwrite_by_id';
}

interface ImportCommitDecision {
  rowId: string;
  rowNumber: number;
  action: 'create' | 'skip' | 'overwrite' | 'fail';
  normalized: ImportCommitRow['normalized'];
  targetCardId: string | null;
  reason?: string;
}

async function runImportCommit(
  jobId: string,
  payload: ImportCommitPayload,
): Promise<{ decisions: ImportCommitDecision[]; count: number; imported: number; skipped: number; failed: number }> {
  const decisions: ImportCommitDecision[] = [];
  let imported = 0;
  let skipped = 0;
  let failed = 0;
  const total = payload.rows.length;

  for (let i = 0; i < total; i++) {
    if (cancelledJobs.has(jobId)) break;
    const row = payload.rows[i];
    if (!row.normalized) {
      decisions.push({ rowId: row.rowId, rowNumber: row.rowNumber, action: 'fail', normalized: null, targetCardId: null, reason: 'missing normalized payload' });
      failed++;
    } else if (payload.dedupeMode === 'skip_exact_duplicate' && row.existingDuplicateCardId) {
      decisions.push({ rowId: row.rowId, rowNumber: row.rowNumber, action: 'skip', normalized: row.normalized, targetCardId: row.existingDuplicateCardId });
      skipped++;
    } else if (payload.dedupeMode === 'overwrite_by_id') {
      if (!row.rawId) {
        decisions.push({ rowId: row.rowId, rowNumber: row.rowNumber, action: 'fail', normalized: row.normalized, targetCardId: null, reason: 'overwrite_by_id requires an id column on each row' });
        failed++;
      } else if (!row.existingDuplicateCardId) {
        decisions.push({ rowId: row.rowId, rowNumber: row.rowNumber, action: 'fail', normalized: row.normalized, targetCardId: null, reason: `No existing card matches id "${row.rawId}"` });
        failed++;
      } else {
        decisions.push({ rowId: row.rowId, rowNumber: row.rowNumber, action: 'overwrite', normalized: row.normalized, targetCardId: row.existingDuplicateCardId });
        imported++;
      }
    } else {
      decisions.push({ rowId: row.rowId, rowNumber: row.rowNumber, action: 'create', normalized: row.normalized, targetCardId: null });
      imported++;
    }

    if ((i + 1) % 25 === 0 || i === total - 1) {
      progress(jobId, Math.round(((i + 1) / Math.max(1, total)) * 100), `Planned ${i + 1}/${total}`);
    }
  }

  return { decisions, count: total, imported, skipped, failed };
}

// ---------- Effect Precompute ----------
interface EffectPrecomputePayload {
  kind: 'stardust' | 'galaxy-halo' | string;
  stardustUnlocked: boolean;
  seed?: number;
  particleCount?: number;
  bounds?: { x: number; y: number; z: number };
}

interface StardustParticle {
  x: number;
  y: number;
  z: number;
  size: number;
  hue: number;
  twinkle: number;
}

function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return ((s >>> 0) % 1_000_000) / 1_000_000;
  };
}

async function runEffectPrecompute(
  jobId: string,
  payload: EffectPrecomputePayload,
): Promise<{ enabled: boolean; particles: StardustParticle[]; count: number; kind: string }> {
  const enabled = payload.stardustUnlocked === true;
  if (!enabled) {
    progress(jobId, 100, 'Stardust locked; empty precompute');
    return { enabled: false, particles: [], count: 0, kind: payload.kind };
  }

  const count = Math.max(64, Math.min(4096, payload.particleCount ?? 600));
  const bounds = payload.bounds ?? { x: 30, y: 18, z: 30 };
  const rand = seededRandom(payload.seed ?? 1);
  const particles: StardustParticle[] = [];

  for (let i = 0; i < count; i++) {
    if (cancelledJobs.has(jobId)) break;
    particles.push({
      x: (rand() * 2 - 1) * bounds.x,
      y: (rand() * 2 - 1) * bounds.y,
      z: (rand() * 2 - 1) * bounds.z,
      size: 0.05 + rand() * 0.25,
      hue: 40 + rand() * 30, // warm gold range
      twinkle: rand(),
    });

    if ((i + 1) % 128 === 0 || i === count - 1) {
      progress(jobId, Math.round(((i + 1) / count) * 100), `Particles ${i + 1}/${count}`);
    }
  }

  return { enabled: true, particles, count: particles.length, kind: payload.kind };
}

export {};
