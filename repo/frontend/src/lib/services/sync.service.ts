import { generateId } from '$lib/utils/id';

export type SyncMessageType =
  | 'EDIT_LOCK'
  | 'EDIT_UNLOCK'
  | 'DATA_CHANGED'
  | 'TAB_HEARTBEAT';

export interface SyncMessage {
  type: SyncMessageType;
  tabId: string;
  timestamp: number;
  payload: unknown;
}

export interface EditLockPayload {
  cardId: string;
}

export interface DataChangedPayload {
  entity: 'cards' | 'profiles' | 'imports' | 'preferences' | 'backup';
  ids: string[];
}

type MessageHandler = (message: SyncMessage) => void;

class SyncService {
  private channel: BroadcastChannel | null = null;
  private tabId: string;
  private handlers: Map<SyncMessageType, Set<MessageHandler>> = new Map();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  /** Cards this tab is currently editing. */
  private myLocks: Set<string> = new Set();
  /** Cards locked by other tabs, keyed by cardId → remote tabId. */
  private remoteLocks: Map<string, string> = new Map();
  /** Subscribers to remote-lock changes. */
  private lockListeners: Set<(locks: Map<string, string>) => void> = new Set();

  constructor() {
    this.tabId = generateId();
  }

  init(): void {
    if (typeof BroadcastChannel === 'undefined') return;

    try {
      this.channel = new BroadcastChannel('nebulaforge-sync');
      this.channel.onmessage = (event: MessageEvent<SyncMessage>) => {
        const msg = event.data;
        if (msg.tabId === this.tabId) return;

        // Track remote edit locks so UI can warn about simultaneous edits.
        if (msg.type === 'EDIT_LOCK') {
          const p = msg.payload as EditLockPayload;
          this.remoteLocks.set(p.cardId, msg.tabId);
          this.emitLockChange();
        } else if (msg.type === 'EDIT_UNLOCK') {
          const p = msg.payload as EditLockPayload;
          this.remoteLocks.delete(p.cardId);
          this.emitLockChange();
        }

        const handlers = this.handlers.get(msg.type);
        if (handlers) {
          for (const handler of handlers) handler(msg);
        }
      };

      this.heartbeatInterval = setInterval(() => {
        this.broadcast('TAB_HEARTBEAT', {});
      }, 5000);
    } catch {
      // BroadcastChannel not supported
    }

    // Release locks if the tab is about to close so peers don't see stale locks.
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        for (const id of this.myLocks) this.broadcastEditUnlock(id);
        this.myLocks.clear();
      });
    }
  }

  broadcast(type: SyncMessageType, payload: unknown): void {
    if (!this.channel) return;
    const message: SyncMessage = {
      type,
      tabId: this.tabId,
      timestamp: Date.now(),
      payload,
    };
    try {
      this.channel.postMessage(message);
    } catch {
      // Channel may be closed
    }
  }

  on(type: SyncMessageType, handler: MessageHandler): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);

    return () => {
      this.handlers.get(type)?.delete(handler);
    };
  }

  /** Claim this tab's intent to edit a card; rebroadcast on reclaim. */
  broadcastEditLock(cardId: string): void {
    this.myLocks.add(cardId);
    this.broadcast('EDIT_LOCK', { cardId } as EditLockPayload);
  }

  broadcastEditUnlock(cardId: string): void {
    this.myLocks.delete(cardId);
    this.broadcast('EDIT_UNLOCK', { cardId } as EditLockPayload);
  }

  /** True if another tab currently holds an edit lock for this card. */
  isLockedByOther(cardId: string): boolean {
    return this.remoteLocks.has(cardId);
  }

  /** Subscribe to remote lock changes. Returns unsubscribe. */
  onLockChange(cb: (locks: Map<string, string>) => void): () => void {
    this.lockListeners.add(cb);
    cb(new Map(this.remoteLocks));
    return () => this.lockListeners.delete(cb);
  }

  private emitLockChange() {
    const snapshot = new Map(this.remoteLocks);
    for (const cb of this.lockListeners) cb(snapshot);
  }

  broadcastDataChanged(entity: DataChangedPayload['entity'], ids: string[]): void {
    this.broadcast('DATA_CHANGED', { entity, ids } as DataChangedPayload);
  }

  getTabId(): string {
    return this.tabId;
  }

  /** Testing helper: inject a message into local handlers as if it came from another tab. */
  __injectMessage(msg: SyncMessage): void {
    if (msg.tabId === this.tabId) return;
    if (msg.type === 'EDIT_LOCK') {
      this.remoteLocks.set((msg.payload as EditLockPayload).cardId, msg.tabId);
      this.emitLockChange();
    } else if (msg.type === 'EDIT_UNLOCK') {
      this.remoteLocks.delete((msg.payload as EditLockPayload).cardId);
      this.emitLockChange();
    }
    const handlers = this.handlers.get(msg.type);
    if (handlers) for (const h of handlers) h(msg);
  }

  destroy(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    this.handlers.clear();
    this.myLocks.clear();
    this.remoteLocks.clear();
    this.lockListeners.clear();
  }
}

export const syncService = new SyncService();
