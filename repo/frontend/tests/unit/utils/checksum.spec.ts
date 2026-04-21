import { describe, it, expect } from 'vitest';
import { computeChecksum, verifyChecksum } from '../../../src/lib/utils/checksum';

describe('checksum utils', () => {
  it('computeChecksum returns the SHA-256 hex digest for input text', async () => {
    const checksum = await computeChecksum('hello world');
    expect(checksum).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
  });

  it('verifyChecksum returns true for a matching digest and false otherwise', async () => {
    await expect(verifyChecksum('nebula', await computeChecksum('nebula'))).resolves.toBe(true);
    await expect(verifyChecksum('nebula', await computeChecksum('galaxy'))).resolves.toBe(false);
  });
});
