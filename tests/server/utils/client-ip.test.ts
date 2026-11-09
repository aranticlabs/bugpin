import { describe, it, expect, afterEach } from 'bun:test';
import { config } from '../../../src/server/config';
import {
  getClientIp,
  getEffectiveOrigin,
  ignoresForwardedHeaders,
  isPrivateAddress,
  rateLimitAddress,
  type TrustProxyMode,
} from '../../../src/server/utils/client-ip';

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
      url: 'http://bugpin.test/api/auth/login',
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

  it('uses the proxy-appended entry when every forwarded address is private', () => {
    const c = createContext({
      peer: '127.0.0.1',
      headers: { 'x-forwarded-for': '10.9.9.9, 192.168.1.50' },
    });
    expect(getClientIp(c, 'auto')).toBe('192.168.1.50');
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

describe('rateLimitAddress', () => {
  it.each([
    ['2001:db8:1:2:3:4:5:6', '2001:db8:1:2::/64'],
    ['2001:db8:1:2:ffff::1', '2001:db8:1:2::/64'],
    ['2001:0db8:0000:0002::', '2001:db8:0:2::/64'],
    ['2001:db8::1', '2001:db8:0:0::/64'],
    ['::1', '0:0:0:0::/64'],
    ['203.0.113.7', '203.0.113.7'],
  ])('maps %s to %s', (address, expected) => {
    expect(rateLimitAddress(address)).toBe(expected);
  });
});

describe('request origin', () => {
  const originalTrustProxy = config.trustProxy;
  const proxied = { host: 'bugpin:7300', 'x-forwarded-host': 'bugs.example.com' };

  function setTrustProxy(mode: TrustProxyMode) {
    Object.assign(config, { trustProxy: mode });
  }

  afterEach(() => {
    Object.assign(config, { trustProxy: originalTrustProxy });
  });

  it('uses the Host header and connection protocol for a direct request', () => {
    setTrustProxy('auto');
    const c = createContext({ peer: '203.0.113.7', headers: { host: 'bugs.example.com:7300' } });
    expect(getEffectiveOrigin(c)).toBe('http://bugs.example.com:7300');
    expect(ignoresForwardedHeaders(c)).toBe(false);
  });

  it('honors forwarded host and protocol from a trusted proxy', () => {
    setTrustProxy('auto');
    const c = createContext({
      peer: '172.18.0.2',
      headers: { ...proxied, 'x-forwarded-proto': 'https' },
    });
    expect(getEffectiveOrigin(c)).toBe('https://bugs.example.com');
    expect(ignoresForwardedHeaders(c)).toBe(false);
  });

  it('ignores forwarded host and protocol when no proxy is trusted', () => {
    setTrustProxy('never');
    const c = createContext({
      peer: '172.18.0.2',
      headers: { ...proxied, 'x-forwarded-proto': 'https' },
    });
    expect(getEffectiveOrigin(c)).toBe('http://bugpin:7300');
    expect(ignoresForwardedHeaders(c)).toBe(true);
  });

  it('ignores forwarded headers from a public peer in auto mode', () => {
    setTrustProxy('auto');
    const c = createContext({
      peer: '203.0.113.7',
      headers: { host: 'bugs.example.com', 'x-forwarded-for': '198.51.100.1' },
    });
    expect(getEffectiveOrigin(c)).toBe('http://bugs.example.com');
    expect(ignoresForwardedHeaders(c)).toBe(true);
  });

  it('trusts forwarded headers from any peer when always trusting', () => {
    setTrustProxy('always');
    const c = createContext({
      peer: '203.0.113.7',
      headers: { ...proxied, 'x-forwarded-proto': 'https' },
    });
    expect(getEffectiveOrigin(c)).toBe('https://bugs.example.com');
    expect(ignoresForwardedHeaders(c)).toBe(false);
  });

  it('returns null for an unknown forwarded protocol or a malformed host', () => {
    setTrustProxy('always');
    expect(
      getEffectiveOrigin(
        createContext({ peer: '10.0.0.1', headers: { ...proxied, 'x-forwarded-proto': 'ftp' } })
      )
    ).toBeNull();
    expect(
      getEffectiveOrigin(
        createContext({ peer: '10.0.0.1', headers: { host: 'bugs.example.com/@evil' } })
      )
    ).toBeNull();
  });
});
