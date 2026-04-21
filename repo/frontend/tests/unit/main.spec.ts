import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const mount = vi.fn(() => ({ destroy: vi.fn() }));
const init = vi.fn();
const markInterruptedJobs = vi.fn(() => Promise.resolve(undefined));

vi.mock('svelte', () => ({
  mount,
}));

vi.mock('../../src/App.svelte', () => ({
  default: {},
}));

vi.mock('$lib/services/sync.service', () => ({
  syncService: { init },
}));

vi.mock('$lib/services/worker-queue.service', () => ({
  markInterruptedJobs,
}));

describe('main entrypoint', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('MODE', 'test');
    document.body.innerHTML = '<div id="app"></div>';
    mount.mockClear();
    init.mockClear();
    markInterruptedJobs.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('initializes sync, attempts interrupted-job recovery, and mounts the app', async () => {
    const mod = await import('../../src/main');

    expect(init).toHaveBeenCalledTimes(1);
    expect(markInterruptedJobs).toHaveBeenCalledTimes(1);
    expect(mount).toHaveBeenCalledWith(expect.anything(), {
      target: document.getElementById('app'),
    });
    expect(mod.default).toBeDefined();
  });

  it('swallows interrupted-job recovery errors during bootstrap', async () => {
    markInterruptedJobs.mockImplementationOnce(async () => {
      throw new Error('boom');
    });

    await expect(import('../../src/main')).resolves.toBeDefined();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(init).toHaveBeenCalledTimes(1);
    expect(markInterruptedJobs).toHaveBeenCalledTimes(1);
  });
});
