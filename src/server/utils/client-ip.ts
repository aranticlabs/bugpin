import { isIP } from 'node:net';
import type { Context } from 'hono';
import { config } from '../config.js';

export type TrustProxyMode = 'auto' | 'always' | 'never';

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
function getSocketAddress(c: Context): string | undefined {
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
  if (forwarded.length > 0) return forwarded[0];

  const realIp = normalizeAddress(c.req.header('x-real-ip') ?? '');
  if (isIP(realIp) !== 0) return realIp;

  return peer;
}
