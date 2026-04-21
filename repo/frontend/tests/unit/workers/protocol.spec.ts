import { describe, it, expect, vi } from 'vitest';

describe('worker protocol helpers', () => {
  it('generateMessageId increments and includes the current timestamp', async () => {
    vi.resetModules();
    vi.spyOn(Date, 'now').mockReturnValue(1234567890);
    const { generateMessageId } = await import('../../../src/lib/workers/protocol');

    expect(generateMessageId()).toBe('msg-1-1234567890');
    expect(generateMessageId()).toBe('msg-2-1234567890');
  });
});
