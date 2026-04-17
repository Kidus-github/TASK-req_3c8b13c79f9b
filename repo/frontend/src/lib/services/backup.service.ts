import { getDb } from '$lib/db/connection';
import type { BackupPayload, BackupData, BackupArtifact, RestoreMode } from '$lib/types/backup';
import { type AppResult, ok, err, ErrorCode } from '$lib/types/result';
import { generateId } from '$lib/utils/id';
import { computeChecksum, verifyChecksum } from '$lib/utils/checksum';
import { logAuditEvent } from './audit.service';
import {
  serializeThumbnails,
  serializeRawImportFiles,
  restoreThumbnails,
  restoreRawImportFiles,
} from './blob.service';
import type { SerializedThumbnail, SerializedRawFile } from '$lib/types/blob-records';

const FORMAT_VERSION = 1;
const APP_VERSION = '1.0.0';

export async function exportBackup(
  profileId: string,
  passphrase?: string
): Promise<AppResult<Blob>> {
  const db = getDb();

  // Build cards first so dependent collections can be derived from them.
  const cards = await db.cards.where('profileId').equals(profileId).toArray();
  const cardIds = new Set(cards.map(c => c.id));

  const allRevisions = await db.cardRevisions.toArray();
  const cardRevisions = allRevisions.filter(r => cardIds.has(r.cardId));

  const parserRules = await db.parsingRuleSets.where('profileId').equals(profileId).toArray();
  const parserRuleIds = new Set(parserRules.map(r => r.id));
  const parserRuleVersions = (await db.parserRuleVersions.toArray())
    .filter(v => parserRuleIds.has(v.ruleSetId));

  const data: BackupData = {
    cards,
    cardRevisions,
    parserRules,
    parserRuleVersions,
    viewLogs: await db.viewLogs.where('profileId').equals(profileId).toArray(),
    missionDayActivities: await db.missionDayActivities.where('profileId').equals(profileId).toArray(),
    missionStreak: (await db.missionStreaks.where('profileId').equals(profileId).first()) ?? null,
    preferences: readPreferences(),
    importBatches: await db.importBatches.where('profileId').equals(profileId).toArray(),
    jobHistory: [],
    thumbnails: await serializeThumbnails(profileId),
    rawImportFiles: await serializeRawImportFiles(profileId),
  };

  const dataJson = JSON.stringify(data);
  const checksum = await computeChecksum(dataJson);

  let payload: BackupPayload;

  if (passphrase) {
    const encrypted = await encryptData(dataJson, passphrase);
    payload = {
      version: FORMAT_VERSION,
      createdAt: new Date().toISOString(),
      profileId,
      encrypted: true,
      checksum,
      encryptedData: encrypted,
    };
  } else {
    payload = {
      version: FORMAT_VERSION,
      createdAt: new Date().toISOString(),
      profileId,
      encrypted: false,
      checksum,
      data,
    };
  }

  const fileName = `nebulaforge-backup-${new Date().toISOString().slice(0, 10)}.nebula`;

  const artifact: BackupArtifact = {
    id: generateId(),
    profileId,
    createdAt: Date.now(),
    formatVersion: FORMAT_VERSION,
    encrypted: !!passphrase,
    checksum,
    sourceAppVersion: APP_VERSION,
    includedCollections: [
      'cards',
      'cardRevisions',
      'parserRules',
      'parserRuleVersions',
      'viewLogs',
      'missionDayActivities',
      'missionStreak',
      'preferences',
      'importBatches',
      'thumbnails',
      'rawImportFiles',
    ],
    fileName,
  };
  await db.backupArtifacts.add(artifact);
  await logAuditEvent('backup_export', profileId, { artifactId: artifact.id, encrypted: !!passphrase });

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  return ok(blob);
}

export async function validateBackup(
  file: string,
  passphrase?: string
): Promise<AppResult<{ data: BackupData; payload: BackupPayload }>> {
  let payload: BackupPayload;
  try {
    payload = JSON.parse(file);
  } catch {
    return err(ErrorCode.PARSE_ERROR, 'Invalid backup file format');
  }

  if (!payload.version || payload.version > FORMAT_VERSION) {
    return err(ErrorCode.VALIDATION, `Unsupported backup version: ${payload.version}`);
  }

  let data: BackupData;

  if (payload.encrypted) {
    if (!passphrase) {
      return err(ErrorCode.VALIDATION, 'Passphrase required for encrypted backup');
    }
    if (!payload.encryptedData) {
      return err(ErrorCode.VALIDATION, 'Missing encrypted data');
    }
    try {
      const decrypted = await decryptData(payload.encryptedData, passphrase);
      data = JSON.parse(decrypted);
    } catch {
      return err(ErrorCode.CRYPTO_FAIL, 'Wrong passphrase or corrupted backup');
    }
  } else {
    if (!payload.data) {
      return err(ErrorCode.VALIDATION, 'Missing backup data');
    }
    data = payload.data;
  }

  // Verify checksum
  const dataJson = JSON.stringify(data);
  const checksumValid = await verifyChecksum(dataJson, payload.checksum);
  if (!checksumValid) {
    return err(ErrorCode.CHECKSUM_MISMATCH, 'Backup data is corrupted (checksum mismatch)');
  }

  return ok({ data, payload });
}

export async function restoreBackup(
  profileId: string,
  data: BackupData,
  mode: RestoreMode
): Promise<AppResult<{ restored: number }>> {
  const db = getDb();

  if (mode === 'replace') {
    await db.transaction(
      'rw',
      [
        db.cards,
        db.cardRevisions,
        db.viewLogs,
        db.missionDayActivities,
        db.missionStreaks,
        db.parsingRuleSets,
        db.parserRuleVersions,
        db.importBatches,
        db.thumbnails,
        db.rawImportFiles,
      ],
      async () => {
        const cards = await db.cards.where('profileId').equals(profileId).toArray();
        const cardIdSet = new Set(cards.map(c => c.id));
        await db.cards.where('profileId').equals(profileId).delete();
        const allRevs = await db.cardRevisions.toArray();
        for (const rev of allRevs) {
          if (cardIdSet.has(rev.cardId)) await db.cardRevisions.delete(rev.id);
        }
        await db.viewLogs.where('profileId').equals(profileId).delete();
        await db.missionDayActivities.where('profileId').equals(profileId).delete();
        await db.missionStreaks.where('profileId').equals(profileId).delete();

        const ruleSets = await db.parsingRuleSets.where('profileId').equals(profileId).toArray();
        const ruleSetIds = new Set(ruleSets.map(r => r.id));
        await db.parsingRuleSets.where('profileId').equals(profileId).delete();
        const allVersions = await db.parserRuleVersions.toArray();
        for (const v of allVersions) {
          if (ruleSetIds.has(v.ruleSetId)) await db.parserRuleVersions.delete(v.id);
        }
        await db.importBatches.where('profileId').equals(profileId).delete();
        await db.thumbnails.where('profileId').equals(profileId).delete();
        await db.rawImportFiles.where('profileId').equals(profileId).delete();
      }
    );
  }

  let restored = 0;

  if (Array.isArray(data.cards)) {
    for (const card of data.cards) {
      const c = { ...(card as any), profileId };
      try {
        if (mode === 'merge') {
          const existing = await db.cards.get(c.id);
          if (existing) {
            if (c.updatedAt > existing.updatedAt) {
              await db.cards.put(c);
              restored++;
            }
          } else {
            await db.cards.add(c);
            restored++;
          }
        } else {
          await db.cards.add(c);
          restored++;
        }
      } catch { /* skip duplicate */ }
    }
  }

  if (Array.isArray(data.cardRevisions)) {
    for (const rev of data.cardRevisions) {
      try { await db.cardRevisions.put(rev as any); } catch { /* skip */ }
    }
  }

  if (Array.isArray(data.parserRules)) {
    for (const rule of data.parserRules) {
      try {
        const r = { ...(rule as any), profileId };
        await db.parsingRuleSets.put(r);
      } catch { /* skip */ }
    }
  }

  if (Array.isArray(data.parserRuleVersions)) {
    for (const v of data.parserRuleVersions) {
      try { await db.parserRuleVersions.put(v as any); } catch { /* skip */ }
    }
  }

  if (Array.isArray(data.viewLogs)) {
    for (const log of data.viewLogs) {
      try {
        const l = { ...(log as any), profileId };
        await db.viewLogs.put(l);
      } catch { /* skip */ }
    }
  }

  if (Array.isArray(data.missionDayActivities)) {
    for (const act of data.missionDayActivities) {
      try {
        const a = { ...(act as any), profileId };
        await db.missionDayActivities.put(a);
      } catch { /* skip */ }
    }
  }

  if (data.missionStreak) {
    try {
      const s = { ...(data.missionStreak as any), profileId };
      await db.missionStreaks.put(s);
    } catch { /* skip */ }
  }

  if (Array.isArray(data.importBatches)) {
    for (const batch of data.importBatches) {
      try {
        const b = { ...(batch as any), profileId };
        await db.importBatches.put(b);
      } catch { /* skip */ }
    }
  }

  if (data.preferences) {
    writePreferences(data.preferences);
  }

  if (Array.isArray(data.thumbnails)) {
    restored += await restoreThumbnails(profileId, data.thumbnails as SerializedThumbnail[]);
  }

  if (Array.isArray(data.rawImportFiles)) {
    restored += await restoreRawImportFiles(profileId, data.rawImportFiles as SerializedRawFile[]);
  }

  await logAuditEvent('backup_import', profileId, { mode, restored });
  await logAuditEvent('backup_restore_mode', profileId, { mode });

  return ok({ restored });
}

function readPreferences(): unknown {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem('nebulaforge_preferences');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writePreferences(prefs: unknown): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem('nebulaforge_preferences', JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

async function encryptData(plaintext: string, passphrase: string): Promise<string> {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']
  );

  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext)
  );

  // Pack salt + iv + ciphertext
  const result = new Uint8Array(salt.length + iv.length + new Uint8Array(ciphertext).length);
  result.set(salt, 0);
  result.set(iv, salt.length);
  result.set(new Uint8Array(ciphertext), salt.length + iv.length);

  return btoa(String.fromCharCode(...result));
}

async function decryptData(encryptedBase64: string, passphrase: string): Promise<string> {
  const enc = new TextEncoder();
  const data = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));

  const salt = data.slice(0, 16);
  const iv = data.slice(16, 28);
  const ciphertext = data.slice(28);

  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']
  );

  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );

  return new TextDecoder().decode(plaintext);
}

export async function getBackupHistory(profileId: string): Promise<BackupArtifact[]> {
  const db = getDb();
  return db.backupArtifacts
    .where('profileId')
    .equals(profileId)
    .reverse()
    .sortBy('createdAt');
}
