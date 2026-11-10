import { isIP } from 'node:net';
import type { Context } from 'hono';
import { config } from '../config.js';

export type TrustProxyMode = 'auto' | 'always' | 'never';
const HOST_PATTERN = /^[a-z0-9.:[\]-]+$/i;

interface RequestIpServer {
  requestIP(request: Request): { address: string } | null;
}

function isRequestIpServer(value: unknown): value is RequestIpServer {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { requestIP?: unknown }).requestIP === 'function'
  );
}

// Bun passes its server as the second `fetch` argument, which Hono exposes as `c.env`.
export function getSocketAddress(c: Context): string | undefined {
  const env: unknown = c.env;
  if (!isRequestIpServer(env)) return undefined;
  try {
    const address = env.requestIP(c.req.raw)?.address;
    return address ? normalizeAddress(address) : undefined;
  } catch {
    return undefined;
  }
}

function normalizeAddress(address: string): string {
  const trimmed = address.trim();
  // IPv4-mapped IPv6 (`::ffff:10.0.0.1`) as reported for dual-stack sockets
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(trimmed);
  return mapped ? mapped[1] : trimmed;
}

export function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false;
  const ip = normalizeAddress(address);
  return ip === '::1' || (isIP(ip) === 4 && ip.startsWith('127.'));
}

/**
 * Loopback, private (RFC 1918), link-local and IPv6 unique-local addresses: the
 * networks a reverse proxy on the same host or container network connects from.
 */
export function isPrivateAddress(address: string): boolean {
  const ip = normalizeAddress(address);
  const version = isIP(ip);
  if (version === 4) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 127 ||
      a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254)
    );
  }
  if (version === 6) {
    const lower = ip.toLowerCase();
    return lower === '::1' || /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower);
  }
  return false;
}

function peerIsTrustedProxy(peer: string | undefined, mode: TrustProxyMode): boolean {
  if (mode === 'never') return false;
  if (mode === 'always') return true;
  return peer !== undefined && isPrivateAddress(peer);
}

export function getEffectiveOrigin(c: Context): string | null {
  try {
    const url = new URL(c.req.url);
    let host = c.req.header('host') ?? url.host;
    let protocol = url.protocol;
    if (peerIsTrustedProxy(getSocketAddress(c), config.trustProxy)) {
      host = c.req.header('x-forwarded-host') ?? host;
      const forwardedProtocol = c.req.header('x-forwarded-proto');
      if (
        forwardedProtocol !== undefined &&
        forwardedProtocol !== 'http' &&
        forwardedProtocol !== 'https'
      )
        return null;
      if (forwardedProtocol) protocol = `${forwardedProtocol}:`;
    }
    if (!HOST_PATTERN.test(host)) return null;
    return new URL(`${protocol}//${host}`).origin;
  } catch {
    return null;
  }
}

/**
 * The TRUST_PROXY value that would make BugPin honor this request's forwarded headers, or
 * null when it already honors them or the request carries none. Ignored forwarded headers
 * are the usual sign of a reverse proxy in front of an instance that does not trust it: a
 * proxy on a private network only needs `auto`, one with a public address needs `true`.
 */
export function requiredTrustProxy(c: Context): 'auto' | 'true' | null {
  const peer = getSocketAddress(c);
  if (peerIsTrustedProxy(peer, config.trustProxy)) return null;
  const hasForwardedHeaders = ['x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto'].some(
    (header) => c.req.header(header) !== undefined
  );
  if (!hasForwardedHeaders) return null;
  return peer !== undefined && isPrivateAddress(peer) ? 'auto' : 'true';
}

/**
 * The client address used for rate limiting and session records.
 *
 * Forwarded headers are only honored when the connecting peer is a trusted proxy
 * (TRUST_PROXY: `auto` trusts loopback and private-network peers, `true` trusts any
 * peer, `false` trusts none). X-Forwarded-For is read from the right, skipping
 * private hops, because entries to the left of the proxy's own entry are supplied by
 * the client and can be forged.
 */
export function getClientIp(
  c: Context,
  mode: TrustProxyMode = config.trustProxy
): string | undefined {
  const peer = getSocketAddress(c);
  if (!peerIsTrustedProxy(peer, mode)) return peer;

  const forwarded = (c.req.header('x-forwarded-for') ?? '')
    .split(',')
    .map(normalizeAddress)
    .filter((entry) => isIP(entry) !== 0);
  for (let index = forwarded.length - 1; index >= 0; index--) {
    if (!isPrivateAddress(forwarded[index])) return forwarded[index];
  }
  // Every entry is private: only the rightmost one was written by the trusted proxy
  if (forwarded.length > 0) return forwarded[forwarded.length - 1];

  const realIp = normalizeAddress(c.req.header('x-real-ip') ?? '');
  if (isIP(realIp) !== 0) return realIp;

  return peer;
}

/**
 * The rate-limit bucket for an address. IPv6 hosts usually get a whole /64, so keying on
 * the full address would hand one client billions of separate buckets.
 */
export function rateLimitAddress(address: string): string {
  if (isIP(address) !== 6) return address;
  const [head, tail = ''] = address.toLowerCase().split('::');
  const headGroups = head ? head.split(':') : [];
  const tailGroups = address.includes('::') && tail ? tail.split(':') : [];
  const missing = 8 - headGroups.length - tailGroups.length;
  const groups = [...headGroups, ...Array<string>(Math.max(0, missing)).fill('0'), ...tailGroups];
  const prefix = groups.slice(0, 4).map((group) => group.replace(/^0+(?=.)/, ''));
  return `${prefix.join(':')}::/64`;
}
