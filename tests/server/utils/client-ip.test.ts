import { describe, it, expect } from 'bun:test';
import { getClientIp, isPrivateAddress } from '../../../src/server/utils/client-ip';

function createContext({
  peer,
  headers = {},
}: {
  peer?: string;
  headers?: Record<string, string>;
}) {
  const lookup = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    env: peer === undefined ? undefined : { requestIP: () => ({ address: peer }) },
    req: {
      raw: new Request('http://bugpin.test/api/auth/login'),
      header: (name: string) => lookup.get(name.toLowerCase()),
    },
  } as unknown as Parameters<typeof getClientIp>[0];
}

describe('isPrivateAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.0.10',
    '169.254.1.1',
    '::1',
    'fd00::1',
    'fe80::1',
    '::ffff:10.0.0.5',
  ])('treats %s as private', (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  it.each(['8.8.8.8', '172.32.0.1', '203.0.113.7', '2001:db8::1', 'not-an-ip'])(
    'treats %s as public or invalid',
    (address) => {
      expect(isPrivateAddress(address)).toBe(false);
    }
  );
});

describe('getClientIp', () => {
  it('ignores forwarded headers from a directly connected public client', () => {
    const c = createContext({
      peer: '203.0.113.7',
      headers: { 'x-forwarded-for': '198.51.100.1', 'x-real-ip': '198.51.100.2' },
    });
    expect(getClientIp(c, 'auto')).toBe('203.0.113.7');
  });

  it('uses the address the proxy appended when the peer is a private proxy', () => {
    const c = createContext({
      peer: '172.18.0.2',
      headers: { 'x-forwarded-for': '198.51.100.99, 203.0.113.7' },
    });
    expect(getClientIp(c, 'auto')).toBe('203.0.113.7');
  });

  it('skips private hops when reading X-Forwarded-For from the right', () => {
    const c = createContext({
      peer: '127.0.0.1',
      headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.4' },
    });
    expect(getClientIp(c, 'auto')).toBe('203.0.113.7');
  });

  it('falls back to X-Real-IP from a trusted proxy', () => {
    const c = createContext({ peer: '::1', headers: { 'x-real-ip': '203.0.113.7' } });
    expect(getClientIp(c, 'auto')).toBe('203.0.113.7');
  });

  it('uses the peer when a trusted proxy sends no usable header', () => {
    const c = createContext({ peer: '10.0.0.4', headers: { 'x-forwarded-for': 'garbage' } });
    expect(getClientIp(c, 'auto')).toBe('10.0.0.4');
  });

  it('never trusts headers when TRUST_PROXY is false', () => {
    const c = createContext({ peer: '10.0.0.4', headers: { 'x-forwarded-for': '203.0.113.7' } });
    expect(getClientIp(c, 'never')).toBe('10.0.0.4');
  });

  it('trusts a public proxy when TRUST_PROXY is true', () => {
    const c = createContext({
      peer: '198.51.100.20',
      headers: { 'x-forwarded-for': '203.0.113.7' },
    });
    expect(getClientIp(c, 'always')).toBe('203.0.113.7');
  });

  it('normalizes IPv4-mapped peer addresses', () => {
    const c = createContext({ peer: '::ffff:203.0.113.7' });
    expect(getClientIp(c, 'auto')).toBe('203.0.113.7');
  });

  it('returns undefined when the socket address is unavailable', () => {
    const c = createContext({ headers: { 'x-forwarded-for': '203.0.113.7' } });
    expect(getClientIp(c, 'auto')).toBeUndefined();
  });
});
