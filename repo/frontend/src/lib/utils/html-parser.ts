export interface HtmlExtractionResult {
  rows: Record<string, string>[];
  errors: string[];
}

export type HtmlSelectorType = 'css' | 'xpath';

type GlobalWithDOM = {
  DOMParser?: typeof DOMParser;
  XPathResult?: typeof XPathResult;
};

function globalCtx(): GlobalWithDOM {
  if (typeof globalThis !== 'undefined') return globalThis as GlobalWithDOM;
  if (typeof self !== 'undefined') return self as unknown as GlobalWithDOM;
  return {} as GlobalWithDOM;
}

function getDOMParser(): typeof DOMParser | null {
  const g = globalCtx();
  return typeof g.DOMParser === 'function' ? g.DOMParser : null;
}

function parseHtml(html: string): Document | null {
  const Parser = getDOMParser();
  if (!Parser) return null;
  return new Parser().parseFromString(html, 'text/html');
}

function xpathNodes(doc: Document, context: Node, expression: string): Node[] {
  const Result = (globalCtx().XPathResult ?? XPathResult);
  const r = doc.evaluate(expression, context, null, Result.ORDERED_NODE_SNAPSHOT_TYPE, null);
  const out: Node[] = [];
  for (let i = 0; i < r.snapshotLength; i++) {
    const n = r.snapshotItem(i);
    if (n) out.push(n);
  }
  return out;
}

function xpathStringValue(doc: Document, context: Node, expression: string): string {
  const Result = (globalCtx().XPathResult ?? XPathResult);
  const r = doc.evaluate(expression, context, null, Result.STRING_TYPE, null);
  return (r.stringValue ?? '').trim();
}

export function extractFromHtml(
  html: string,
  selectorType: HtmlSelectorType,
  containerSelector: string,
  fieldSelectors: Record<string, string>
): HtmlExtractionResult {
  const errors: string[] = [];

  const doc = parseHtml(html);
  if (!doc) {
    return { rows: [], errors: ['DOMParser unavailable in this environment'] };
  }

  let containers: Element[];

  if (selectorType === 'css') {
    try {
      containers = Array.from(doc.querySelectorAll(containerSelector)) as Element[];
    } catch {
      return { rows: [], errors: [`Invalid CSS selector: ${containerSelector}`] };
    }
  } else {
    try {
      containers = xpathNodes(doc, doc, containerSelector)
        .filter((n): n is Element => (n as Element).nodeType === 1);
    } catch {
      return { rows: [], errors: [`Invalid XPath: ${containerSelector}`] };
    }
  }

  if (containers.length === 0) {
    return { rows: [], errors: ['No elements matched the container selector'] };
  }

  const rows: Record<string, string>[] = [];

  for (let i = 0; i < containers.length; i++) {
    const container = containers[i];
    const row: Record<string, string> = {};

    for (const [field, selector] of Object.entries(fieldSelectors)) {
      try {
        if (selectorType === 'css') {
          const el = container.querySelector(selector);
          row[field] = el?.textContent?.trim() ?? '';
        } else {
          row[field] = xpathStringValue(doc, container, selector);
        }
      } catch {
        errors.push(`Row ${i + 1}, field "${field}": selector error`);
        row[field] = '';
      }
    }

    rows.push(row);
  }

  return { rows, errors };
}

export function validateCssSelector(selector: string): boolean {
  try {
    const g = globalCtx() as { document?: Document };
    if (g.document && typeof g.document.createElement === 'function') {
      g.document.createElement('div').querySelector(selector);
      return true;
    }
    const doc = parseHtml('<x/>');
    if (!doc) return false;
    doc.querySelector(selector);
    return true;
  } catch {
    return false;
  }
}

export function validateXPath(xpath: string): boolean {
  try {
    const Parser = getDOMParser();
    if (!Parser) return false;
    const doc = new Parser().parseFromString('<x/>', 'text/xml');
    const Result = globalCtx().XPathResult ?? XPathResult;
    doc.evaluate(xpath, doc, null, Result.ANY_TYPE, null);
    return true;
  } catch {
    return false;
  }
}
