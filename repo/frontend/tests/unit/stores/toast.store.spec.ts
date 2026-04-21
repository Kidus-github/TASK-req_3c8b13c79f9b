import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

async function loadToastStore() {
  return import('../../../src/lib/stores/toast.store');
}

describe('toast.store', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });

  afterEach(async () => {
    const { clearToasts } = await loadToastStore();
    clearToasts();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('adds toasts in insertion order and returns stable ids', async () => {
    const { pushToast, toasts } = await loadToastStore();

    const firstId = pushToast('First toast', 'info', 0);
    const secondId = pushToast('Second toast', 'success', 0, false);

    expect(firstId).toBe('toast-1');
    expect(secondId).toBe('toast-2');
    expect(get(toasts)).toEqual([
      {
        id: 'toast-1',
        type: 'info',
        message: 'First toast',
        duration: 0,
        dismissible: true,
      },
      {
        id: 'toast-2',
        type: 'success',
        message: 'Second toast',
        duration: 0,
        dismissible: false,
      },
    ]);
  });

  it('dismisses only the targeted toast and leaves duplicates independent', async () => {
    const { pushToast, dismissToast, toasts } = await loadToastStore();

    const firstId = pushToast('Same message', 'warning', 0);
    const secondId = pushToast('Same message', 'warning', 0);

    dismissToast(firstId);

    expect(get(toasts)).toEqual([
      {
        id: secondId,
        type: 'warning',
        message: 'Same message',
        duration: 0,
        dismissible: true,
      },
    ]);
  });

  it('auto-dismisses timed toasts and preserves longer-lived items until their own timers expire', async () => {
    const { pushToast, toasts } = await loadToastStore();

    pushToast('Short lived', 'info', 1000);
    pushToast('Long lived', 'success', 3000);

    expect(get(toasts).map((toast) => toast.message)).toEqual(['Short lived', 'Long lived']);

    await vi.advanceTimersByTimeAsync(1000);

    expect(get(toasts).map((toast) => toast.message)).toEqual(['Long lived']);

    await vi.advanceTimersByTimeAsync(2000);

    expect(get(toasts)).toEqual([]);
  });

  it('leaves duration-zero toasts in place until explicitly cleared', async () => {
    const { pushToast, toasts, clearToasts } = await loadToastStore();

    pushToast('Persistent', 'error', 0);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(get(toasts)).toHaveLength(1);

    clearToasts();
    expect(get(toasts)).toEqual([]);
  });
});
