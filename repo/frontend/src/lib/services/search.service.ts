import { getDb } from '$lib/db/connection';
import type { Card } from '$lib/types/card';
import type { SearchQuery, SearchHit, SearchFilters, SearchSort, SearchIndexRecord } from '$lib/types/search';
import { type AppResult, ok, err, ErrorCode } from '$lib/types/result';
import { generateId } from '$lib/utils/id';
import { dateToEpochDay } from '$lib/utils/date';
import { normalizeTags } from '$lib/utils/validation';

const FIELD_WEIGHTS: Record<string, number> = {
  title: 3.0,
  tags: 2.0,
  body: 1.0,
};

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'it', 'in', 'on', 'at', 'to', 'of', 'for', 'and', 'or', 'but',
  'was', 'were', 'be', 'been', 'has', 'have', 'had', 'do', 'does', 'did',
  'this', 'that', 'with', 'from', 'by', 'as', 'not', 'no',
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP_WORDS.has(t));
}

export async function buildSearchIndex(card: Card): Promise<void> {
  const db = getDb();

  const titleTokens = tokenize(card.title);
  const bodyTokens = tokenize(card.body);
  const tagTokens = card.tags.map(t => t.toLowerCase());

  const tokenMap: Record<string, number[]> = {};

  titleTokens.forEach((t, i) => {
    if (!tokenMap[`title:${t}`]) tokenMap[`title:${t}`] = [];
    tokenMap[`title:${t}`].push(i);
  });

  bodyTokens.forEach((t, i) => {
    if (!tokenMap[`body:${t}`]) tokenMap[`body:${t}`] = [];
    tokenMap[`body:${t}`].push(i);
  });

  tagTokens.forEach((t, i) => {
    if (!tokenMap[`tags:${t}`]) tokenMap[`tags:${t}`] = [];
    tokenMap[`tags:${t}`].push(i);
  });

  const record: SearchIndexRecord = {
    cardId: card.id,
    profileId: card.profileId,
    tokenMap,
    tagTerms: tagTokens,
    mood: card.mood,
    dateEpochDay: dateToEpochDay(card.date),
    updatedAt: Date.now(),
    indexVersion: 1,
  };

  await db.searchIndex.put(record);
}

export async function removeFromSearchIndex(cardId: string): Promise<void> {
  const db = getDb();
  await db.searchIndex.delete(cardId);
}

export async function rebuildSearchIndex(cards: Card[], profileId?: string): Promise<number> {
  const db = getDb();
  if (profileId) {
    // Scoped rebuild: only clear this profile's records so other profiles are untouched.
    const existing = await db.searchIndex.where('profileId').equals(profileId).toArray();
    for (const rec of existing) await db.searchIndex.delete(rec.cardId);
  } else {
    await db.searchIndex.clear();
  }

  let indexed = 0;
  for (const card of cards) {
    if (card.deletedAt === null && (!profileId || card.profileId === profileId)) {
      await buildSearchIndex(card);
      indexed++;
    }
  }
  return indexed;
}

/**
 * Worker-backed rebuild. Tokenization runs inside heavy-task.worker.ts and
 * results are persisted here. Progress/logs flow through the queue runner
 * so the Jobs monitor reflects live state and cancellation works.
 */
export async function rebuildSearchIndexViaWorker(
  cards: Card[],
  profileId?: string,
): Promise<{ indexed: number; jobId: string }> {
  const { runJob } = await import('./queue-runner.service');
  const scope = cards.filter(c => c.deletedAt === null && (!profileId || c.profileId === profileId));
  const workerPayload = {
    cards: scope.map(c => ({
      id: c.id,
      title: c.title,
      body: c.body,
      tags: c.tags,
      mood: c.mood,
      date: c.date,
      deletedAt: c.deletedAt,
    })),
  };
  const { job, result } = await runJob<{ records: Array<{ cardId: string; tokenMap: Record<string, number[]>; tagTerms: string[]; mood: number; dateEpochDay: number; updatedAt: number; indexVersion: number }>; count: number }>(
    'index_rebuild',
    workerPayload,
  );

  const db = getDb();
  if (profileId) {
    const existing = await db.searchIndex.where('profileId').equals(profileId).toArray();
    for (const rec of existing) await db.searchIndex.delete(rec.cardId);
  } else {
    await db.searchIndex.clear();
  }

  const cardProfileMap = new Map(scope.map(c => [c.id, c.profileId]));
  for (const rec of result.records) {
    const pid = cardProfileMap.get(rec.cardId);
    if (!pid) continue;
    await db.searchIndex.put({
      cardId: rec.cardId,
      profileId: pid,
      tokenMap: rec.tokenMap,
      tagTerms: rec.tagTerms,
      mood: rec.mood,
      dateEpochDay: rec.dateEpochDay,
      updatedAt: rec.updatedAt,
      indexVersion: rec.indexVersion,
    });
  }

  return { indexed: result.records.length, jobId: job.id };
}

export async function searchCards(
  query: SearchQuery,
  profileId: string
): Promise<SearchHit[]> {
  const db = getDb();

  // Profile isolation: only records belonging to the active profile may be queried.
  let records = await db.searchIndex.where('profileId').equals(profileId).toArray();

  // Apply filters first
  records = applyFilters(records, query.filters);

  // If no query text, return all matching cards
  if (!query.queryText.trim()) {
    const hits: SearchHit[] = records.map(r => ({
      cardId: r.cardId,
      score: 0,
      matchedFields: [],
    }));
    return sortHits(hits, query.sort, db);
  }

  // Score cards against query
  const queryTokens = tokenize(query.queryText);
  if (queryTokens.length === 0) {
    const hits: SearchHit[] = records.map(r => ({
      cardId: r.cardId,
      score: 0,
      matchedFields: [],
    }));
    return sortHits(hits, query.sort, db);
  }

  const hits: SearchHit[] = [];

  for (const record of records) {
    let totalScore = 0;
    const matchedFields = new Set<string>();

    for (const queryToken of queryTokens) {
      for (const [field, weight] of Object.entries(FIELD_WEIGHTS)) {
        const key = `${field}:${queryToken}`;
        const positions = record.tokenMap[key];
        if (positions && positions.length > 0) {
          totalScore += weight * positions.length;
          matchedFields.add(field);
        }

        // Also partial match
        for (const tokenKey of Object.keys(record.tokenMap)) {
          if (tokenKey.startsWith(`${field}:`) && tokenKey.includes(queryToken) && tokenKey !== key) {
            totalScore += weight * 0.5;
            matchedFields.add(field);
          }
        }
      }
    }

    if (totalScore > 0) {
      hits.push({
        cardId: record.cardId,
        score: totalScore,
        matchedFields: [...matchedFields],
      });
    }
  }

  return sortHits(hits, query.sort, db);
}

function applyFilters(records: SearchIndexRecord[], filters: SearchFilters): SearchIndexRecord[] {
  let result = records;

  if (filters.tags && filters.tags.length > 0) {
    const filterTags = filters.tags.map(t => t.toLowerCase());
    result = result.filter(r => filterTags.some(ft => r.tagTerms.includes(ft)));
  }

  if (filters.moodMin != null) {
    result = result.filter(r => r.mood >= filters.moodMin!);
  }

  if (filters.moodMax != null) {
    result = result.filter(r => r.mood <= filters.moodMax!);
  }

  if (filters.dateStart) {
    const startEpoch = dateToEpochDay(filters.dateStart);
    result = result.filter(r => r.dateEpochDay >= startEpoch);
  }

  if (filters.dateEnd) {
    const endEpoch = dateToEpochDay(filters.dateEnd);
    result = result.filter(r => r.dateEpochDay <= endEpoch);
  }

  return result;
}

async function sortHits(
  hits: SearchHit[],
  sort: SearchSort,
  db: ReturnType<typeof getDb>
): Promise<SearchHit[]> {
  if (sort.field === 'relevance') {
    hits.sort((a, b) => b.score - a.score);
    return hits;
  }

  // Need card data for non-relevance sorts
  const cardIds = hits.map(h => h.cardId);
  const cards = await db.cards.bulkGet(cardIds);
  const cardMap = new Map(cards.filter(Boolean).map(c => [c!.id, c!]));

  const dir = sort.direction === 'asc' ? 1 : -1;

  hits.sort((a, b) => {
    const cardA = cardMap.get(a.cardId);
    const cardB = cardMap.get(b.cardId);
    if (!cardA || !cardB) return 0;

    switch (sort.field) {
      case 'date':
        return dir * cardA.date.localeCompare(cardB.date);
      case 'title':
        return dir * cardA.title.localeCompare(cardB.title);
      case 'mood':
        return dir * (cardA.mood - cardB.mood);
      default:
        return b.score - a.score;
    }
  });

  return hits;
}

export async function getSearchIndexStats(
  profileId?: string
): Promise<{ totalRecords: number; indexVersion: number }> {
  const db = getDb();
  const count = profileId
    ? await db.searchIndex.where('profileId').equals(profileId).count()
    : await db.searchIndex.count();
  return { totalRecords: count, indexVersion: 1 };
}

export function highlightMatches(text: string, queryText: string): string {
  const tokens = tokenize(queryText);
  if (tokens.length === 0) return escapeHtml(text);
  const escaped = escapeHtml(text);
  let out = escaped;
  for (const token of tokens) {
    const re = new RegExp(`(${escapeRegExp(token)})`, 'gi');
    out = out.replace(re, '<mark>$1</mark>');
  }
  return out;
}

export function extractSnippet(text: string, queryText: string, maxLength = 120): string {
  const tokens = tokenize(queryText);
  if (tokens.length === 0 || text.length <= maxLength) return text.slice(0, maxLength);
  const lower = text.toLowerCase();
  for (const token of tokens) {
    const idx = lower.indexOf(token);
    if (idx >= 0) {
      const start = Math.max(0, idx - 30);
      const end = Math.min(text.length, start + maxLength);
      const prefix = start > 0 ? '...' : '';
      const suffix = end < text.length ? '...' : '';
      return `${prefix}${text.slice(start, end)}${suffix}`;
    }
  }
  return text.slice(0, maxLength);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
