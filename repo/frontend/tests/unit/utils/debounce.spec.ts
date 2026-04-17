import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce, throttle } from '$lib/utils/debounce';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('debounce', () => {
  it('delays the call by the configured ms', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d('a');
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(99);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledWith('a');
  });

  it('only calls once with the latest args when invoked rapidly', () => {
    const fn = vi.fn();
    const d = debounce(fn, 50);
    d('first');
    d('second');
    d('third');
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('third');
  });

  it('forwards multiple arguments', () => {
    const fn = vi.fn();
    const d = debounce<(a: number, b: string) => void>(fn, 10);
    d(1, 'x');
    vi.advanceTimersByTime(10);
    expect(fn).toHaveBeenCalledWith(1, 'x');
  });
});

describe('throttle', () => {
  it('fires immediately on first call and suppresses subsequent calls within the window', () => {
    const fn = vi.fn();
    const t = throttle(fn, 100);
    t('a');
    t('b');
    t('c');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('a');
  });

  it('allows another call after the window elapses', () => {
    const fn = vi.fn();
    const t = throttle(fn, 100);
    t('a');
    vi.advanceTimersByTime(100);
    t('b');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('forwards multiple arguments', () => {
    const fn = vi.fn();
    const t = throttle<(a: number, b: string) => void>(fn, 100);
    t(7, 'q');
    expect(fn).toHaveBeenCalledWith(7, 'q');
  });
});
