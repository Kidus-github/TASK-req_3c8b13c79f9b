import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { syncService } from '$lib/services/sync.service';

beforeEach(() => {
  syncService.init();
});

afterEach(() => {
  syncService.destroy();
});

describe('sync.service edit locks', () => {
  it('exposes lock changes from remote tabs', () => {
    let latest: Map<string, string> = new Map();
    const unsub = syncService.onLockChange((locks) => { latest = locks; });

    // Simulate a remote tab broadcasting an edit lock for card-123
    syncService.__injectMessage({
      type: 'EDIT_LOCK',
      tabId: 'other-tab',
      timestamp: Date.now(),
      payload: { cardId: 'card-123' },
    });

    expect(latest.has('card-123')).toBe(true);
    expect(syncService.isLockedByOther('card-123')).toBe(true);

    // And unlock clears it
    syncService.__injectMessage({
      type: 'EDIT_UNLOCK',
      tabId: 'other-tab',
      timestamp: Date.now(),
      payload: { cardId: 'card-123' },
    });

    expect(latest.has('card-123')).toBe(false);
    expect(syncService.isLockedByOther('card-123')).toBe(false);

    unsub();
  });

  it('routes DATA_CHANGED messages to subscribers', () => {
    const received: unknown[] = [];
    const unsub = syncService.on('DATA_CHANGED', (msg) => {
      received.push(msg.payload);
    });

    syncService.__injectMessage({
      type: 'DATA_CHANGED',
      tabId: 'other-tab',
      timestamp: Date.now(),
      payload: { entity: 'cards', ids: ['c1', 'c2'] },
    });

    expect(received).toHaveLength(1);
    expect((received[0] as { entity: string }).entity).toBe('cards');

    unsub();
  });

  it('ignores messages originating from its own tab', () => {
    const received: unknown[] = [];
    syncService.on('DATA_CHANGED', (msg) => received.push(msg));
    syncService.__injectMessage({
      type: 'DATA_CHANGED',
      tabId: syncService.getTabId(),
      timestamp: Date.now(),
      payload: { entity: 'cards', ids: [] },
    });
    expect(received).toHaveLength(0);
  });
});
