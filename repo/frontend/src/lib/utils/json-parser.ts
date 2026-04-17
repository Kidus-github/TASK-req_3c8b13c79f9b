export interface JsonParseResult {
  rows: Record<string, string>[];
  errors: string[];
}

export function parseJsonImport(text: string): JsonParseResult {
  const errors: string[] = [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { rows: [], errors: [`Invalid JSON: ${(e as Error).message}`] };
  }

  let items: unknown[];

  if (Array.isArray(parsed)) {
    items = parsed;
  } else if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    // Check for common wrapper patterns: { data: [...] }, { cards: [...] }, { items: [...] }
    const obj = parsed as Record<string, unknown>;
    const arrayKey = Object.keys(obj).find(k => Array.isArray(obj[k]));
    if (arrayKey) {
      items = obj[arrayKey] as unknown[];
    } else {
      // Single object - wrap it
      items = [parsed];
    }
  } else {
    return { rows: [], errors: ['JSON must be an array or object'] };
  }

  const rows: Record<string, string>[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item || typeof item !== 'object') {
      errors.push(`Item ${i + 1}: Expected an object, got ${typeof item}`);
      continue;
    }

    const row: Record<string, string> = {};
    const obj = item as Record<string, unknown>;

    for (const [key, value] of Object.entries(obj)) {
      if (Array.isArray(value)) {
        row[key] = value.map(String).join(', ');
      } else if (value === null || value === undefined) {
        row[key] = '';
      } else {
        row[key] = String(value);
      }
    }

    rows.push(row);
  }

  return { rows, errors };
}

export function evaluateJsonPath(obj: unknown, path: string): unknown[] {
  if (!path.startsWith('$')) return [];

  const parts = path
    .replace(/^\$\.?/, '')
    .split('.')
    .filter(Boolean);

  let current: unknown[] = [obj];

  for (const part of parts) {
    const next: unknown[] = [];
    for (const item of current) {
      if (item == null || typeof item !== 'object') continue;

      if (part === '*') {
        if (Array.isArray(item)) {
          next.push(...item);
        } else {
          next.push(...Object.values(item as Record<string, unknown>));
        }
      } else if (part.includes('[') && part.includes(']')) {
        const [key, indexStr] = part.split('[');
        const index = parseInt(indexStr.replace(']', ''), 10);
        const val = (item as Record<string, unknown>)[key];
        if (Array.isArray(val) && !isNaN(index)) {
          if (val[index] !== undefined) next.push(val[index]);
        }
      } else {
        const val = (item as Record<string, unknown>)[part];
        if (val !== undefined) {
          next.push(val);
        }
      }
    }
    current = next;
  }

  return current;
}
