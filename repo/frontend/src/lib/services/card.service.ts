import Dexie from 'dexie';
import { getDb } from '$lib/db/connection';
import type { Card, CardDraft, CardRevision } from '$lib/types/card';
import { type AppResult, ok, err, ErrorCode } from '$lib/types/result';
import { validateCardDraft, normalizeTags } from '$lib/utils/validation';
import { generateId } from '$lib/utils/id';
import { logAuditEvent } from './audit.service';
import { logger } from '$lib/logging';
import { buildSearchIndex, removeFromSearchIndex } from './search.service';
import { syncService } from './sync.service';
import { storeThumbnail, deleteThumbnailsForCard } from './blob.service';

export interface CreateCardOptions {
  importId?: string;
  rowNumber?: number;
  editSource?: CardRevision['editSource'];
  thumbnail?: Blob;
  thumbnailWidth?: number;
  thumbnailHeight?: number;
}

export async function createCard(
  profileId: string,
  draft: CardDraft,
  source?: CreateCardOptions
): Promise<AppResult<Card>> {
  logger.info('cards', 'create', 'Creating card', { profileId, title: draft.title });
  const errors = validateCardDraft(draft);
  if (errors.length > 0) {
    logger.warn('cards', 'create', 'Validation failed', { errors });
    return err(ErrorCode.VALIDATION, 'Card validation failed', errors);
  }

  const now = Date.now();
  const cardId = generateId();
  let thumbnailId: string | null = null;

  if (source?.thumbnail) {
    const thumbnail = await storeThumbnail(
      profileId,
      cardId,
      source.thumbnail,
      source.thumbnailWidth ?? 0,
      source.thumbnailHeight ?? 0,
    );
    thumbnailId = thumbnail.id;
  }

  const card: Card = {
    id: cardId,
    profileId,
    title: draft.title.trim(),
    body: draft.body.trim(),
    date: draft.date,
    mood: draft.mood,
    tags: normalizeTags(draft.tags),
    sourceImportId: source?.importId ?? null,
    sourceRowNumber: source?.rowNumber ?? null,
    thumbnailId,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    version: 1,
  };

  const db = getDb();
  await db.cards.add(card);
  await buildSearchIndex(card);

  await logAuditEvent('card_create', profileId, { cardId: card.id, title: card.title });
  syncService.broadcastDataChanged('cards', [card.id]);

  return ok(card);
}

export async function attachCardThumbnail(
  cardId: string,
  thumbnail: Blob,
  width = 0,
  height = 0,
): Promise<AppResult<Card>> {
  const db = getDb();
  const existing = await db.cards.get(cardId);
  if (!existing) return err(ErrorCode.NOT_FOUND, 'Card not found');

  await deleteThumbnailsForCard(cardId);
  const record = await storeThumbnail(existing.profileId, cardId, thumbnail, width, height);
  await db.cards.update(cardId, { thumbnailId: record.id, updatedAt: Date.now() });
  const updated = await db.cards.get(cardId);
  return ok(updated!);
}

export async function updateCard(
  cardId: string,
  draft: CardDraft,
  expectedVersion: number,
  tabInstanceId: string | null = null,
  editSource: CardRevision['editSource'] = 'manual'
): Promise<AppResult<Card>> {
  const errors = validateCardDraft(draft);
  if (errors.length > 0) {
    return err(ErrorCode.VALIDATION, 'Card validation failed', errors);
  }

  const db = getDb();
  const existing = await db.cards.get(cardId);

  if (!existing) {
    return err(ErrorCode.NOT_FOUND, 'Card not found');
  }

  if (existing.deletedAt) {
    return err(ErrorCode.VALIDATION, 'Cannot edit a deleted card');
  }

  if (existing.version !== expectedVersion) {
    return err(ErrorCode.CONFLICT, 'Card has been modified by another session', {
      currentVersion: existing.version,
      expectedVersion,
    });
  }

  const now = Date.now();
  const newVersion = existing.version + 1;

  const beforeSnapshot: Partial<Card> = {
    title: existing.title,
    body: existing.body,
    date: existing.date,
    mood: existing.mood,
    tags: [...existing.tags],
  };

  const afterSnapshot: Partial<Card> = {
    title: draft.title.trim(),
    body: draft.body.trim(),
    date: draft.date,
    mood: draft.mood,
    tags: normalizeTags(draft.tags),
  };

  const revision: CardRevision = {
    id: generateId(),
    cardId,
    version: newVersion,
    beforeSnapshot,
    afterSnapshot,
    editedAt: now,
    editSource,
    tabInstanceId,
  };

  await db.transaction('rw', [db.cards, db.cardRevisions], async () => {
    await db.cards.update(cardId, {
      title: draft.title.trim(),
      body: draft.body.trim(),
      date: draft.date,
      mood: draft.mood,
      tags: normalizeTags(draft.tags),
      updatedAt: now,
      version: newVersion,
    });
    await db.cardRevisions.add(revision);
  });

  const updated = await db.cards.get(cardId);
  if (updated) {
    await buildSearchIndex(updated);
  }

  await logAuditEvent('card_update', existing.profileId, { cardId, version: newVersion });
  syncService.broadcastDataChanged('cards', [cardId]);

  return ok(updated!);
}

export async function softDeleteCard(cardId: string): Promise<AppResult<Card>> {
  const db = getDb();
  const existing = await db.cards.get(cardId);

  if (!existing) {
    return err(ErrorCode.NOT_FOUND, 'Card not found');
  }

  if (existing.deletedAt) {
    return err(ErrorCode.VALIDATION, 'Card is already deleted');
  }

  const now = Date.now();
  await db.cards.update(cardId, {
    deletedAt: now,
    updatedAt: now,
  });

  await removeFromSearchIndex(cardId);
  // Drop any linked thumbnail so the orphaned blob does not outlive the card.
  await deleteThumbnailsForCard(cardId);
  await db.cards.update(cardId, { thumbnailId: null });

  await logAuditEvent('card_delete', existing.profileId, { cardId, title: existing.title });
  syncService.broadcastDataChanged('cards', [cardId]);

  const updated = await db.cards.get(cardId);
  return ok(updated!);
}

export async function restoreCard(
  cardId: string,
  tabInstanceId: string | null = null
): Promise<AppResult<Card>> {
  const db = getDb();
  const existing = await db.cards.get(cardId);

  if (!existing) {
    return err(ErrorCode.NOT_FOUND, 'Card not found');
  }

  if (!existing.deletedAt) {
    return err(ErrorCode.VALIDATION, 'Card is not deleted');
  }

  const now = Date.now();
  const newVersion = existing.version + 1;

  const revision: CardRevision = {
    id: generateId(),
    cardId,
    version: newVersion,
    beforeSnapshot: { deletedAt: existing.deletedAt },
    afterSnapshot: { deletedAt: null },
    editedAt: now,
    editSource: 'restore',
    tabInstanceId,
  };

  await db.transaction('rw', [db.cards, db.cardRevisions], async () => {
    await db.cards.update(cardId, {
      deletedAt: null,
      updatedAt: now,
      version: newVersion,
    });
    await db.cardRevisions.add(revision);
  });

  const updated = await db.cards.get(cardId);
  if (updated) {
    await buildSearchIndex(updated);
  }

  await logAuditEvent('card_restore', existing.profileId, { cardId, title: existing.title });
  syncService.broadcastDataChanged('cards', [cardId]);

  return ok(updated!);
}

export async function getCard(cardId: string): Promise<AppResult<Card>> {
  const db = getDb();
  const card = await db.cards.get(cardId);
  if (!card) {
    return err(ErrorCode.NOT_FOUND, 'Card not found');
  }
  return ok(card);
}

export async function listCards(
  profileId: string,
  includeDeleted = false
): Promise<Card[]> {
  const db = getDb();
  if (includeDeleted) {
    return db.cards.where('profileId').equals(profileId).toArray();
  }

  try {
    const cards = await db.cards
      .where('[profileId+deletedAt]')
      .between([profileId, Dexie.minKey], [profileId, Dexie.maxKey], false, false)
      .toArray();
    return cards.filter(c => c.deletedAt === null);
  } catch {
    const allCards = await db.cards.where('profileId').equals(profileId).toArray();
    return allCards.filter(c => c.deletedAt === null);
  }
}

export async function listActiveCards(profileId: string): Promise<Card[]> {
  const db = getDb();
  const allCards = await db.cards.where('profileId').equals(profileId).toArray();
  return allCards.filter(c => c.deletedAt === null);
}

export async function getCardRevisions(cardId: string): Promise<CardRevision[]> {
  const db = getDb();
  return db.cardRevisions
    .where('cardId')
    .equals(cardId)
    .reverse()
    .sortBy('version');
}

export async function countActiveCards(profileId: string): Promise<number> {
  const cards = await listActiveCards(profileId);
  return cards.length;
}
