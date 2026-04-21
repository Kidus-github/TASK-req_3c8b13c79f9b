import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('sync.service environment and teardown branches', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(async () => {
    const mod = await import('$lib/services/sync.service');
    mod.syncService.destroy();
    vi.restoreAllMocks();
  });

  it('init is a no-op when BroadcastChannel is unavailable', async () => {
    const original = (globalThis as any).BroadcastChannel;
    // @ts-expect-error test override
    delete globalThis.BroadcastChannel;
    try {
      const { syncService } = await import('$lib/services/sync.service');
      expect(() => syncService.init()).not.toThrow();
      syncService.broadcastDataChanged('cards', ['a']);
    } finally {
      (globalThis as any).BroadcastChannel = original;
    }
  });

  it('init tolerates BroadcastChannel constructor failures', async () => {
    const original = (globalThis as any).BroadcastChannel;
    class BrokenChannel {
      constructor() {
        throw new Error('unsupported');
      }
    }
    (globalThis as any).BroadcastChannel = BrokenChannel;
    try {
      const { syncService } = await import('$lib/services/sync.service');
      expect(() => syncService.init()).not.toThrow();
    } finally {
      (globalThis as any).BroadcastChannel = original;
    }
  });

  it('beforeunload releases this tab\'s edit locks', async () => {
    const postMessage = vi.fn();
    const close = vi.fn();
    const original = (globalThis as any).BroadcastChannel;
    class FakeBC {
      onmessage: ((event: MessageEvent<any>) => void) | null = null;
      postMessage = postMessage;
      close = close;
      constructor(_name: string) {}
    }
    (globalThis as any).BroadcastChannel = FakeBC;
    try {
      const { syncService } = await import('$lib/services/sync.service');
      syncService.init();
      syncService.broadcastEditLock('card-a');
      syncService.broadcastEditLock('card-b');
      window.dispatchEvent(new Event('beforeunload'));
      expect(postMessage.mock.calls.some((c) => c[0].type === 'EDIT_UNLOCK' && c[0].payload.cardId === 'card-a')).toBe(true);
      expect(postMessage.mock.calls.some((c) => c[0].type === 'EDIT_UNLOCK' && c[0].payload.cardId === 'card-b')).toBe(true);
    } finally {
      (globalThis as any).BroadcastChannel = original;
    }
  });

  it('broadcast swallows postMessage failures on a closed channel', async () => {
    const original = (globalThis as any).BroadcastChannel;
    class ThrowingBC {
      onmessage: ((event: MessageEvent<any>) => void) | null = null;
      constructor(_name: string) {}
      postMessage(): void {
        throw new Error('closed');
      }
      close(): void {}
    }
    (globalThis as any).BroadcastChannel = ThrowingBC;
    try {
      const { syncService } = await import('$lib/services/sync.service');
      syncService.init();
      expect(() => syncService.broadcastDataChanged('backup', ['b1'])).not.toThrow();
    } finally {
      (globalThis as any).BroadcastChannel = original;
    }
  });
});
