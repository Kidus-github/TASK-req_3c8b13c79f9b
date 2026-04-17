import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, destroyTestDb } from '../../helpers/db-factory';
import { type NebulaDB, setDbFactory } from '$lib/db/connection';
import { logAuditEvent, getAuditEvents } from '$lib/services/audit.service';

let testDb: NebulaDB;

beforeEach(() => {
  testDb = createTestDb();
  setDbFactory(() => testDb);
});

afterEach(async () => {
  setDbFactory(null);
  await destroyTestDb(testDb);
});

describe('audit.service', () => {
  it('persists an event with the supplied type, profile, and details', async () => {
    await logAuditEvent('card_create', 'profile-1', { cardId: 'c1', title: 'First' });

    const stored = await testDb.auditEvents.toArray();
    expect(stored).toHaveLength(1);
    const ev = stored[0];
    expect(ev.type).toBe('card_create');
    expect(ev.profileId).toBe('profile-1');
    expect(ev.details).toEqual({ cardId: 'c1', title: 'First' });
    expect(ev.id).toBeTruthy();
    expect(ev.timestamp).toBeGreaterThan(0);
  });

  it('defaults details to an empty object when omitted', async () => {
    await logAuditEvent('auth_login_success', 'profile-2');
    const stored = await testDb.auditEvents.toArray();
    expect(stored[0].details).toEqual({});
  });

  it('supports a null profileId for system-level events', async () => {
    await logAuditEvent('worker_fail', null, { jobId: 'j-1' });
    const [ev] = await testDb.auditEvents.toArray();
    expect(ev.profileId).toBeNull();
  });

  it('getAuditEvents returns most-recent-first for a profile', async () => {
    await logAuditEvent('card_create', 'profile-a', { i: 1 });
    // Ensure strictly increasing timestamps in deterministic order.
    await new Promise((r) => setTimeout(r, 2));
    await logAuditEvent('card_update', 'profile-a', { i: 2 });
    await new Promise((r) => setTimeout(r, 2));
    await logAuditEvent('card_delete', 'profile-a', { i: 3 });
    await logAuditEvent('card_create', 'profile-other', { i: 99 });

    const events = await getAuditEvents('profile-a');
    expect(events.map((e) => e.type)).toEqual([
      'card_delete',
      'card_update',
      'card_create',
    ]);
    // other profile's events are excluded
    expect(events.find((e) => e.profileId === 'profile-other')).toBeUndefined();
  });

  it('respects the limit argument', async () => {
    for (let i = 0; i < 5; i++) {
      await logAuditEvent('card_create', 'profile-limit', { i });
      await new Promise((r) => setTimeout(r, 1));
    }
    const events = await getAuditEvents('profile-limit', 2);
    expect(events).toHaveLength(2);
  });
});
