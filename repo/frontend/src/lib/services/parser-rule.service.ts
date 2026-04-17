import { getDb } from '$lib/db/connection';
import type { ParsingRuleSet, ParsingCanaryRun, ParserRuleVersion, RuleSelector, FieldMapping, CanaryResultItem } from '$lib/types/parser-rule';
import { type AppResult, ok, err, ErrorCode } from '$lib/types/result';
import { generateId } from '$lib/utils/id';
import { logAuditEvent } from './audit.service';
import { extractFromHtml } from '$lib/utils/html-parser';
import { evaluateJsonPath } from '$lib/utils/json-parser';
import { config } from '$lib/config';

export async function createRuleSet(
  profileId: string,
  name: string,
  sourceType: 'html' | 'json',
  selectors: RuleSelector[],
  fieldMappings: FieldMapping[]
): Promise<AppResult<ParsingRuleSet>> {
  const db = getDb();

  const ruleSet: ParsingRuleSet = {
    id: generateId(),
    profileId,
    name,
    sourceType,
    ruleVersion: 1,
    status: 'draft',
    selectors,
    fieldMappings,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastCanaryRunId: null,
  };

  // Save version
  const version: ParserRuleVersion = {
    id: generateId(),
    ruleSetId: ruleSet.id,
    version: 1,
    selectors,
    fieldMappings,
    createdAt: Date.now(),
  };

  await db.transaction('rw', [db.parsingRuleSets, db.parserRuleVersions], async () => {
    await db.parsingRuleSets.add(ruleSet);
    await db.parserRuleVersions.add(version);
  });

  return ok(ruleSet);
}

export async function updateRuleSet(
  ruleSetId: string,
  selectors: RuleSelector[],
  fieldMappings: FieldMapping[]
): Promise<AppResult<ParsingRuleSet>> {
  const db = getDb();
  const existing = await db.parsingRuleSets.get(ruleSetId);
  if (!existing) return err(ErrorCode.NOT_FOUND, 'Rule set not found');

  if (existing.status === 'active') {
    return err(ErrorCode.VALIDATION, 'Cannot edit active rule set. Archive it first.');
  }

  const newVersion = existing.ruleVersion + 1;

  const version: ParserRuleVersion = {
    id: generateId(),
    ruleSetId,
    version: newVersion,
    selectors,
    fieldMappings,
    createdAt: Date.now(),
  };

  await db.transaction('rw', [db.parsingRuleSets, db.parserRuleVersions], async () => {
    await db.parsingRuleSets.update(ruleSetId, {
      selectors,
      fieldMappings,
      ruleVersion: newVersion,
      status: 'draft',
      updatedAt: Date.now(),
    });
    await db.parserRuleVersions.add(version);
  });

  const updated = await db.parsingRuleSets.get(ruleSetId);
  return ok(updated!);
}

export async function markCanaryReady(ruleSetId: string): Promise<AppResult<void>> {
  const db = getDb();
  const existing = await db.parsingRuleSets.get(ruleSetId);
  if (!existing) return err(ErrorCode.NOT_FOUND, 'Rule set not found');
  if (existing.status !== 'draft') {
    return err(ErrorCode.VALIDATION, `Cannot mark canary ready from ${existing.status} state`);
  }
  await db.parsingRuleSets.update(ruleSetId, { status: 'canary_ready', updatedAt: Date.now() });
  return ok(undefined);
}

export async function runCanary(
  ruleSetId: string,
  sampleData: string[],
  extractFn: (input: string, selectors: RuleSelector[], mappings: FieldMapping[]) => Record<string, string>
): Promise<AppResult<ParsingCanaryRun>> {
  const db = getDb();
  const ruleSet = await db.parsingRuleSets.get(ruleSetId);
  if (!ruleSet) return err(ErrorCode.NOT_FOUND, 'Rule set not found');

  if (ruleSet.status !== 'canary_ready' && ruleSet.status !== 'canary_failed') {
    return err(ErrorCode.VALIDATION, 'Rule set must be in canary_ready or canary_failed state');
  }

  await db.parsingRuleSets.update(ruleSetId, { status: 'canary_running' });

  const sampleSize = Math.min(
    Math.max(sampleData.length, config.canaryMinSampleSize),
    config.canaryMaxSampleSize
  );
  const samples = sampleData.slice(0, sampleSize);

  const results: CanaryResultItem[] = [];
  let passCount = 0;
  let failCount = 0;

  for (let i = 0; i < samples.length; i++) {
    try {
      const extracted = extractFn(samples[i], ruleSet.selectors, ruleSet.fieldMappings);
      const requiredFields = ['title', 'body', 'date', 'mood'];
      const missing = requiredFields.filter(f => !extracted[f] || extracted[f].trim() === '');

      if (missing.length === 0) {
        results.push({ sampleIndex: i, passed: true, extractedFields: extracted, errors: [] });
        passCount++;
      } else {
        results.push({ sampleIndex: i, passed: false, extractedFields: extracted, errors: missing.map(f => `Missing field: ${f}`) });
        failCount++;
      }
    } catch (e) {
      results.push({ sampleIndex: i, passed: false, extractedFields: {}, errors: [(e as Error).message] });
      failCount++;
    }
  }

  const total = passCount + failCount;
  const failureRate = total > 0 ? failCount / total : 1;
  const passed = failureRate <= config.canaryFailureThreshold;

  const canaryRun: ParsingCanaryRun = {
    id: generateId(),
    ruleSetId,
    sampleSize: total,
    status: passed ? 'passed' : 'failed',
    passCount,
    failCount,
    startedAt: Date.now(),
    completedAt: Date.now(),
    resultsSummary: results,
    jobId: generateId(),
  };

  await db.parsingCanaryRuns.add(canaryRun);
  await db.parsingRuleSets.update(ruleSetId, {
    status: passed ? 'canary_passed' : 'canary_failed',
    lastCanaryRunId: canaryRun.id,
    updatedAt: Date.now(),
  });

  const eventType = passed ? 'parser_canary_pass' : 'parser_canary_fail';
  await logAuditEvent(eventType, ruleSet.profileId, { ruleSetId, passCount, failCount });

  return ok(canaryRun);
}

export async function activateRuleSet(ruleSetId: string): Promise<AppResult<void>> {
  const db = getDb();
  const ruleSet = await db.parsingRuleSets.get(ruleSetId);
  if (!ruleSet) return err(ErrorCode.NOT_FOUND, 'Rule set not found');

  if (ruleSet.status !== 'canary_passed') {
    return err(ErrorCode.VALIDATION, 'Only canary-passed rule sets can be activated');
  }

  // Archive any currently active rule sets of the same name
  const active = await db.parsingRuleSets
    .where('profileId')
    .equals(ruleSet.profileId)
    .toArray()
    .then(rules => rules.filter(r => r.status === 'active' && r.name === ruleSet.name));

  for (const r of active) {
    await db.parsingRuleSets.update(r.id, { status: 'archived', updatedAt: Date.now() });
  }

  await db.parsingRuleSets.update(ruleSetId, { status: 'active', updatedAt: Date.now() });
  await logAuditEvent('parser_rule_activate', ruleSet.profileId, { ruleSetId });

  return ok(undefined);
}

export async function archiveRuleSet(ruleSetId: string): Promise<AppResult<void>> {
  const db = getDb();
  await db.parsingRuleSets.update(ruleSetId, { status: 'archived', updatedAt: Date.now() });
  return ok(undefined);
}

export async function getRuleSet(ruleSetId: string): Promise<ParsingRuleSet | undefined> {
  return getDb().parsingRuleSets.get(ruleSetId);
}

export async function listRuleSets(profileId: string): Promise<ParsingRuleSet[]> {
  return getDb().parsingRuleSets.where('profileId').equals(profileId).toArray();
}

export async function getRuleVersions(ruleSetId: string): Promise<ParserRuleVersion[]> {
  return getDb().parserRuleVersions.where('ruleSetId').equals(ruleSetId).sortBy('version');
}

export async function getCanaryRuns(ruleSetId: string): Promise<ParsingCanaryRun[]> {
  return getDb().parsingCanaryRuns.where('ruleSetId').equals(ruleSetId).sortBy('startedAt');
}

/**
 * Default extraction function used by both canary runs and full imports.
 * Takes a single sample (HTML or JSON text) and returns a flat field map
 * for the first container matched by the rule selectors.
 */
export function defaultExtract(
  ruleSet: ParsingRuleSet
): (sample: string, selectors: RuleSelector[], mappings: FieldMapping[]) => Record<string, string> {
  const sourceType = ruleSet.sourceType;
  const primary = ruleSet.selectors[0];
  const containerSelector = primary?.expression ?? (sourceType === 'html' ? 'body' : '$.');
  const selectorType = primary?.selectorType ?? (sourceType === 'html' ? 'css' : 'jsonpath');

  const fieldMap: Record<string, string> = {};
  for (const m of ruleSet.fieldMappings) fieldMap[m.targetField] = m.sourceSelector;

  return (sample: string) => {
    if (sourceType === 'html') {
      if (selectorType === 'jsonpath') return {};
      const result = extractFromHtml(sample, selectorType as 'css' | 'xpath', containerSelector, fieldMap);
      return result.rows[0] ?? {};
    }

    // JSON path
    try {
      const parsed = JSON.parse(sample);
      const items = containerSelector && containerSelector !== '$' && containerSelector !== '$.'
        ? evaluateJsonPath(parsed, containerSelector)
        : [parsed];
      const first = items[0];
      if (!first || typeof first !== 'object') return {};
      const out: Record<string, string> = {};
      for (const [field, path] of Object.entries(fieldMap)) {
        const vals = path.startsWith('$')
          ? evaluateJsonPath(first, path)
          : [(first as Record<string, unknown>)[path]];
        out[field] = vals[0] != null ? String(vals[0]) : '';
      }
      return out;
    } catch {
      return {};
    }
  };
}

/**
 * Run canary against an array of raw samples. Wraps runCanary with the rule
 * set's default extractor so UIs can just hand in the files.
 */
export async function runCanaryWithDefaultExtract(
  ruleSetId: string,
  sampleData: string[]
): Promise<AppResult<ParsingCanaryRun>> {
  const ruleSet = await getDb().parsingRuleSets.get(ruleSetId);
  if (!ruleSet) return err(ErrorCode.NOT_FOUND, 'Rule set not found');
  return runCanary(ruleSetId, sampleData, defaultExtract(ruleSet));
}

/**
 * Extract rows from a JSON snapshot using a JSON-type parser rule set.
 * Walks `containerSelector` to get an array of items and applies each
 * field mapping. Returns `{rows, errors}` ready for the import validator.
 */
export function extractFromJsonSnapshot(
  ruleSet: ParsingRuleSet,
  text: string
): { rows: Record<string, string>[]; errors: string[] } {
  if (ruleSet.sourceType !== 'json') {
    return { rows: [], errors: ['Rule set source type must be json'] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { rows: [], errors: [`Invalid JSON: ${(e as Error).message}`] };
  }

  const primary = ruleSet.selectors[0];
  const containerSelector = primary?.expression ?? '$';

  let items: unknown[];
  if (!containerSelector || containerSelector === '$' || containerSelector === '$.') {
    items = Array.isArray(parsed) ? parsed : [parsed];
  } else {
    const raw = evaluateJsonPath(parsed, containerSelector);
    items = raw.flatMap(v => (Array.isArray(v) ? v : [v]));
  }

  const fieldMap: Record<string, string> = {};
  for (const m of ruleSet.fieldMappings) fieldMap[m.targetField] = m.sourceSelector;

  const rows: Record<string, string>[] = [];
  const errors: string[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item == null || typeof item !== 'object') {
      errors.push(`Item ${i + 1}: not an object`);
      continue;
    }
    const row: Record<string, string> = {};
    for (const [field, path] of Object.entries(fieldMap)) {
      const vals = path.startsWith('$')
        ? evaluateJsonPath(item, path)
        : [(item as Record<string, unknown>)[path]];
      const v = vals[0];
      if (Array.isArray(v)) row[field] = v.map(String).join(', ');
      else row[field] = v != null ? String(v) : '';
    }
    rows.push(row);
  }

  return { rows, errors };
}

