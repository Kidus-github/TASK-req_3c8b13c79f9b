import { extractFromHtml } from '$lib/utils/html-parser';

type WorkerInMsg =
  | { kind: 'start'; jobId: string; type: string; payload: any }
  | { kind: 'cancel'; jobId: string };

type Listener = (ev: MessageEvent) => void;

/**
 * In-process Worker stand-in for tests. Speaks the same protocol as
 * `heavy-task.worker.ts` for the job types the tests drive. Parser extraction
 * reuses the shared `extractFromHtml` helper so CSS and XPath paths execute
 * exactly as the real worker would.
 */
export interface FakeWorkerOptions {
  progressSteps?: number[];
}

export class FakeHeavyTaskWorker {
  onmessage: Listener | null = null;
  private listeners = new Map<string, Set<Listener>>();
  private options: FakeWorkerOptions;

  constructor(options: FakeWorkerOptions = {}) {
    this.options = options;
  }

  addEventListener(event: string, fn: Listener): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn);
  }

  removeEventListener(event: string, fn: Listener): void {
    this.listeners.get(event)?.delete(fn);
  }

  postMessage(msg: WorkerInMsg): void {
    // Dispatch asynchronously so consumers' handlers see a real microtask boundary.
    queueMicrotask(() => { void this.handle(msg); });
  }

  terminate(): void {
    this.listeners.clear();
  }

  emit(msg: unknown): void {
    const event = { data: msg } as MessageEvent;
    const set = this.listeners.get('message');
    if (set) for (const fn of set) fn(event);
    if (this.onmessage) this.onmessage(event);
  }

  private async handle(msg: WorkerInMsg): Promise<void> {
    if (msg.kind !== 'start') return;
    const { jobId, type, payload } = msg;

    // Emit any configured progress steps before computing the result so tests
    // that bind to live progress have something to observe. Each step yields
    // through setTimeout(0) so consumer async handlers (DB writes, store
    // updates) fully drain before the next step.
    if (this.options.progressSteps?.length) {
      for (const percent of this.options.progressSteps) {
        this.emit({ kind: 'progress', jobId, percent });
        await new Promise<void>(r => setTimeout(r, 0));
        // A second tick ensures Dexie's put + getJob round-trip resolves
        // before we emit the next progress message.
        await new Promise<void>(r => setTimeout(r, 0));
      }
    }

    try {
      let result: unknown;
      switch (type) {
        case 'parser_full_extract': {
          if (payload.sourceType !== 'html') {
            throw new Error('Fake worker only implements html extract for tests');
          }
          if (payload.selectorType !== 'css' && payload.selectorType !== 'xpath') {
            throw new Error(`Unsupported selectorType: ${payload.selectorType}`);
          }
          const out = extractFromHtml(
            payload.content,
            payload.selectorType,
            payload.containerSelector,
            payload.fieldSelectors,
          );
          result = { rows: out.rows, count: out.rows.length, errors: out.errors };
          break;
        }
        case 'import_parse_validate': {
          result = this.parseValidateJson(payload);
          break;
        }
        case 'index_rebuild': {
          result = this.indexRebuild(payload);
          break;
        }
        case 'import_commit': {
          result = this.importCommit(payload);
          break;
        }
        case 'effect_precompute': {
          result = this.effectPrecompute(payload);
          break;
        }
        default:
          throw new Error(`Unsupported job type in fake worker: ${type}`);
      }
      this.emit({ kind: 'done', jobId, result, throughput: 1 });
    } catch (e) {
      this.emit({ kind: 'error', jobId, code: 'FAKE_ERROR', message: (e as Error).message });
    }
  }

  private parseValidateJson(payload: { text: string; maxRows: number }) {
    const parsed = JSON.parse(payload.text) as unknown;
    const rawRows: { rowNumber: number; data: Record<string, string> }[] = [];
    if (Array.isArray(parsed)) {
      parsed.forEach((item, i) => {
        if (item && typeof item === 'object') {
          const data: Record<string, string> = {};
          for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
            data[k] = v == null ? '' : String(v);
          }
          rawRows.push({ rowNumber: i + 1, data });
        }
      });
    }
    const results = rawRows.map(r => {
      const data = r.data;
      const errors: { field: string; message: string }[] = [];
      const title = (data.title ?? '').trim();
      const body = (data.body ?? '').trim();
      const date = (data.date ?? '').trim();
      const moodStr = (data.mood ?? '').trim();
      const mood = parseInt(moodStr, 10);
      if (!title) errors.push({ field: 'title', message: 'Title is required' });
      if (!body) errors.push({ field: 'body', message: 'Body is required' });
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.push({ field: 'date', message: 'Date invalid' });
      if (isNaN(mood) || mood < 1 || mood > 5) errors.push({ field: 'mood', message: 'Mood invalid' });
      return errors.length > 0
        ? { rowNumber: r.rowNumber, valid: false, normalized: null, errors, warnings: [] }
        : { rowNumber: r.rowNumber, valid: true, normalized: { title, body, date, mood, tags: [] }, errors: [], warnings: [] };
    });
    return { rows: rawRows, results, count: rawRows.length };
  }

  private indexRebuild(payload: { cards: Array<{ id: string; title: string; body: string; tags: string[]; mood: number; date: string; deletedAt: number | null }> }) {
    const STOP = new Set(['a','an','the','is','it','in','on','at','to','of','for','and','or','but','was','were','be','been','has','have','had','do','does','did','this','that','with','from','by','as','not','no']);
    const tokenize = (s: string) => s.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/).filter(t => t.length > 1 && !STOP.has(t));
    const toDay = (d: string) => {
      const t = new Date(d + 'T00:00:00Z').getTime();
      return Math.floor(t / 86400000);
    };
    const active = payload.cards.filter(c => c.deletedAt === null);
    const records = active.map(card => {
      const tokenMap: Record<string, number[]> = {};
      tokenize(card.title).forEach((t, i) => { (tokenMap[`title:${t}`] ??= []).push(i); });
      tokenize(card.body).forEach((t, i) => { (tokenMap[`body:${t}`] ??= []).push(i); });
      card.tags.map(t => t.toLowerCase()).forEach((t, i) => { (tokenMap[`tags:${t}`] ??= []).push(i); });
      return {
        cardId: card.id,
        tokenMap,
        tagTerms: card.tags.map(t => t.toLowerCase()),
        mood: card.mood,
        dateEpochDay: toDay(card.date),
        updatedAt: Date.now(),
        indexVersion: 1,
      };
    });
    return { records, count: records.length };
  }

  private importCommit(payload: { rows: Array<{ rowId: string; rowNumber: number; normalized: any; existingDuplicateCardId?: string | null; rawId?: string | null }>; dedupeMode: string }) {
    let imported = 0, skipped = 0, failed = 0;
    const decisions = payload.rows.map(row => {
      if (!row.normalized) { failed++; return { rowId: row.rowId, rowNumber: row.rowNumber, action: 'fail', normalized: null, targetCardId: null, reason: 'missing normalized' }; }
      if (payload.dedupeMode === 'skip_exact_duplicate' && row.existingDuplicateCardId) { skipped++; return { rowId: row.rowId, rowNumber: row.rowNumber, action: 'skip', normalized: row.normalized, targetCardId: row.existingDuplicateCardId }; }
      if (payload.dedupeMode === 'overwrite_by_id') {
        if (!row.rawId) { failed++; return { rowId: row.rowId, rowNumber: row.rowNumber, action: 'fail', normalized: row.normalized, targetCardId: null, reason: 'overwrite_by_id requires an id column on each row' }; }
        if (!row.existingDuplicateCardId) { failed++; return { rowId: row.rowId, rowNumber: row.rowNumber, action: 'fail', normalized: row.normalized, targetCardId: null, reason: `No existing card matches id "${row.rawId}"` }; }
        imported++;
        return { rowId: row.rowId, rowNumber: row.rowNumber, action: 'overwrite', normalized: row.normalized, targetCardId: row.existingDuplicateCardId };
      }
      imported++;
      return { rowId: row.rowId, rowNumber: row.rowNumber, action: 'create', normalized: row.normalized, targetCardId: null };
    });
    return { decisions, count: decisions.length, imported, skipped, failed };
  }

  private effectPrecompute(payload: { kind: string; stardustUnlocked: boolean; seed?: number; particleCount?: number; bounds?: { x: number; y: number; z: number } }) {
    if (!payload.stardustUnlocked) return { enabled: false, particles: [], count: 0, kind: payload.kind };
    const count = Math.max(8, Math.min(256, payload.particleCount ?? 32));
    const bounds = payload.bounds ?? { x: 10, y: 6, z: 10 };
    let seed = payload.seed ?? 1;
    const rand = () => { seed = (seed * 1664525 + 1013904223) | 0; return ((seed >>> 0) % 1_000_000) / 1_000_000; };
    const particles = [] as Array<{ x: number; y: number; z: number; size: number; hue: number; twinkle: number }>;
    for (let i = 0; i < count; i++) {
      particles.push({
        x: (rand() * 2 - 1) * bounds.x,
        y: (rand() * 2 - 1) * bounds.y,
        z: (rand() * 2 - 1) * bounds.z,
        size: 0.05 + rand() * 0.25,
        hue: 40 + rand() * 30,
        twinkle: rand(),
      });
    }
    return { enabled: true, particles, count: particles.length, kind: payload.kind };
  }
}

export function fakeWorkerFactory(options: FakeWorkerOptions = {}): FakeHeavyTaskWorker {
  return new FakeHeavyTaskWorker(options);
}
