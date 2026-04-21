import { describe, it, expect, vi } from 'vitest';
import { generateId } from '../../../src/lib/utils/id';

describe('id utils', () => {
  it('generateId delegates to crypto.randomUUID', () => {
    const uuidSpy = vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('uuid-fixed');
    expect(generateId()).toBe('uuid-fixed');
    expect(uuidSpy).toHaveBeenCalledTimes(1);
  });
});
