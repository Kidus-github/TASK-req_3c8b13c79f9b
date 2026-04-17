import { writable } from 'svelte/store';

export interface Toast {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  duration: number;
  dismissible: boolean;
}

const toastsStore = writable<Toast[]>([]);
let nextId = 0;

export function pushToast(
  message: string,
  type: Toast['type'] = 'info',
  duration = 5000,
  dismissible = true
): string {
  const id = `toast-${++nextId}`;
  const toast: Toast = { id, type, message, duration, dismissible };
  toastsStore.update(toasts => [...toasts, toast]);

  if (duration > 0) {
    setTimeout(() => dismissToast(id), duration);
  }

  return id;
}

export function dismissToast(id: string): void {
  toastsStore.update(toasts => toasts.filter(t => t.id !== id));
}

export function clearToasts(): void {
  toastsStore.set([]);
}

export const toasts = { subscribe: toastsStore.subscribe };
