import { describe, it, expect } from 'bun:test';
import { decryptSecret, encryptSecret } from '../../../src/server/utils/crypto';

describe('encryptSecret', () => {
  it('round-trips and uses a fresh IV each time', () => {
    const first = encryptSecret('JBSWY3DPEHPK3PXP', 'totp-secret');
    const second = encryptSecret('JBSWY3DPEHPK3PXP', 'totp-secret');
    expect(first).not.toBe(second);
    expect(decryptSecret(first, 'totp-secret')).toBe('JBSWY3DPEHPK3PXP');
  });

  it('rejects tampering and a different purpose', () => {
    const value = encryptSecret('JBSWY3DPEHPK3PXP', 'totp-secret');
    const parts = value.split(':');
    const flipped = parts[3].startsWith('A') ? `B${parts[3].slice(1)}` : `A${parts[3].slice(1)}`;
    expect(decryptSecret([...parts.slice(0, 3), flipped].join(':'), 'totp-secret')).toBeNull();
    expect(decryptSecret(value, 'other-purpose')).toBeNull();
    expect(decryptSecret('not-a-secret', 'totp-secret')).toBeNull();
  });
});
