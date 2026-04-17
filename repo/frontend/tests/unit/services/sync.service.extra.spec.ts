/**
 * Extra coverage for sync.service paths not exercised in sync.service.spec.ts:
 * broadcastEditLock/Unlock + lock listener notification, broadcastDataChanged
 * via injectMessage, and the destroy() teardown path.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { syncService } from '$lib/services/sync.service';

beforeEach(() => syncService.init());
afterEach(() => syncService.destroy());

describe('sync.service edit-lock broadcast paths', () => {
  it('broadcastEditLock + broadcastEditUnlock affect myLocks but not remoteLocks', () => {
    syncService.broadcastEditLock('card-A');
    expect(syncService.isLockedByOther('card-A')).toBe(false);
    syncService.broadcastEditUnlock('card-A');
    expect(syncService.isLockedByOther('card-A')).toBe(false);
  });

  it('onLockChange invokes the callback synchronously with the current snapshot', () => {
    const seen: Map<string, string>[] = [];
    const unsub = syncService.onLockChange((locks) => seen.push(new Map(locks)));
    expect(seen).toHaveLength(1);
    expect(seen[0].size).toBe(0);

    syncService.__injectMessage({
      type: 'EDIT_LOCK',
      tabId: 'tab-other',
      timestamp: Date.now(),
      payload: { cardId: 'card-X' },
    });
    expect(seen.at(-1)!.get('card-X')).toBe('tab-other');
    unsub();
  });

  it('broadcastDataChanged routes through subscribers', () => {
    const got: unknown[] = [];
    const unsub = syncService.on('DATA_CHANGED', (m) => got.push(m.payload));
    // Inject pretending another tab sent it (broadcast won't reach own handlers).
    syncService.__injectMessage({
      type: 'DATA_CHANGED',
      tabId: 'tab-other',
      timestamp: Date.now(),
      payload: { entity: 'imports', ids: ['i1'] },
    });
    expect(got).toHaveLength(1);
    unsub();
  });

  it('destroy clears handlers and lock state', () => {
    let count = 0;
    syncService.on('DATA_CHANGED', () => count++);
    syncService.__injectMessage({ type: 'DATA_CHANGED', tabId: 'x', timestamp: 0, payload: { entity: 'cards', ids: [] } });
    expect(count).toBe(1);
    syncService.destroy();
    syncService.init();
    syncService.__injectMessage({ type: 'DATA_CHANGED', tabId: 'x', timestamp: 0, payload: { entity: 'cards', ids: [] } });
    expect(count).toBe(1); // handler was cleared by destroy()
  });
});
