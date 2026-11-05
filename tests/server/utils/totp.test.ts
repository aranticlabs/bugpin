import { describe, it, expect } from 'bun:test';
import {
  base32Decode,
  base32Encode,
  buildOtpAuthUri,
  generateTotpCode,
  generateTotpSecret,
  timeStep,
  verifyTotpCode,
} from '../../../src/server/utils/totp';

// RFC 6238 appendix B: SHA-1 seed "12345678901234567890", truncated to 6 digits
const RFC_SECRET = base32Encode(new TextEncoder().encode('12345678901234567890'));

describe('totp', () => {
  it('round-trips base32', () => {
    const bytes = Uint8Array.from([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
    expect(RFC_SECRET).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  });

  it.each([
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
    [20000000000, '353130'],
  ])('matches the RFC 6238 vector at %i seconds', (seconds, code) => {
    expect(generateTotpCode(RFC_SECRET, timeStep(seconds * 1000))).toBe(code);
  });

  it('accepts the current and adjacent steps and returns the matching step', () => {
    const now = 1_700_000_000_000;
    const step = timeStep(now);
    expect(verifyTotpCode(RFC_SECRET, generateTotpCode(RFC_SECRET, step), now)).toBe(step);
    expect(verifyTotpCode(RFC_SECRET, generateTotpCode(RFC_SECRET, step - 1), now)).toBe(step - 1);
    expect(verifyTotpCode(RFC_SECRET, generateTotpCode(RFC_SECRET, step + 1), now)).toBe(step + 1);
    expect(verifyTotpCode(RFC_SECRET, generateTotpCode(RFC_SECRET, step - 2), now)).toBeNull();
  });

  it('rejects malformed codes', () => {
    expect(verifyTotpCode(RFC_SECRET, '12345')).toBeNull();
    expect(verifyTotpCode(RFC_SECRET, 'abcdef')).toBeNull();
  });

  it('generates 160-bit secrets and a standard otpauth URI', () => {
    const secret = generateTotpSecret();
    expect(base32Decode(secret)).toHaveLength(20);
    const uri = new URL(buildOtpAuthUri(secret, 'BugPin', 'admin@example.com'));
    expect(uri.protocol).toBe('otpauth:');
    expect(uri.host).toBe('totp');
    expect(decodeURIComponent(uri.pathname)).toBe('/BugPin:admin@example.com');
    expect(uri.searchParams.get('secret')).toBe(secret);
    expect(uri.searchParams.get('issuer')).toBe('BugPin');
  });
});
