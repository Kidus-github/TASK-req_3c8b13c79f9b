import { getDb, type AuditEvent } from '$lib/db/connection';
import { generateId } from '$lib/utils/id';

export type AuditEventType =
  | 'auth_register'
  | 'auth_login_success'
  | 'auth_login_failed'
  | 'auth_cooldown_start'
  | 'auth_cooldown_end'
  | 'card_create'
  | 'card_update'
  | 'card_delete'
  | 'card_restore'
  | 'import_start'
  | 'import_complete'
  | 'import_cancel'
  | 'import_fail'
  | 'parser_rule_activate'
  | 'parser_canary_pass'
  | 'parser_canary_fail'
  | 'backup_export'
  | 'backup_import'
  | 'backup_restore_mode'
  | 'worker_retry'
  | 'worker_cancel'
  | 'worker_fail';

export async function logAuditEvent(
  type: AuditEventType,
  profileId: string | null,
  details: Record<string, unknown> = {}
): Promise<void> {
  const db = getDb();
  const event: AuditEvent = {
    id: generateId(),
    type,
    profileId,
    timestamp: Date.now(),
    details,
  };
  await db.auditEvents.add(event);
}

export async function getAuditEvents(
  profileId: string,
  limit = 100
): Promise<AuditEvent[]> {
  const db = getDb();
  return db.auditEvents
    .where('profileId')
    .equals(profileId)
    .reverse()
    .sortBy('timestamp')
    .then(events => events.slice(0, limit));
}
