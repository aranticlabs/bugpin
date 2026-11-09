import { afterEach, expect, it } from 'bun:test';
import { config } from '../../../src/server/config';
import { normalizeEmail } from '../../../src/server/utils/email-normalize';
import { maskEmail } from '../../../src/server/utils/mask-email';
import { generateSecureToken, hashToken } from '../../../src/server/utils/secure-token';
import { signToken, verifySignedToken } from '../../../src/server/utils/signed-token';
import { isSecurePortalUrl } from '../../../src/server/utils/portal-url';

const original = { ...config };
afterEach(() => Object.assign(config, original));

it('normalizes email without changing dots or plus tags and masks the local part', () => {
  expect(normalizeEmail(' Jane.Doe+Tag@Example.COM ')).toBe('jane.doe+tag@example.com');
  expect(maskEmail('jane@example.com')).toBe('j***@example.com');
  expect(maskEmail('a@example.com')).toBe('a***@example.com');
});

it('generates independent 32-byte base64url credentials and deterministic SHA-256 hashes', () => {
  const first = generateSecureToken();
  expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(Buffer.from(first, 'base64url')).toHaveLength(32);
  expect(generateSecureToken()).not.toBe(first);
  expect(hashToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

it('binds signed tokens to their purpose, value, and instance secret', () => {
  const signed = signToken('unsubscribe', 'jane@example.com');
  expect(verifySignedToken('unsubscribe', 'jane@example.com', signed)).toBe(true);
  expect(verifySignedToken('login', 'jane@example.com', signed)).toBe(false);
  expect(verifySignedToken('unsubscribe', 'other@example.com', signed)).toBe(false);
  expect(verifySignedToken('unsubscribe', 'jane@example.com', 'bad')).toBe(false);
  config.secretKey = 'a-different-instance-secret-with-32-characters';
  expect(verifySignedToken('unsubscribe', 'jane@example.com', signed)).toBe(false);
});

it('allows HTTP only for loopback and development suffixes', () => {
  config.isDev = false;
  for (const url of [
    'https://example.com',
    'http://localhost:7301',
    'http://127.2.3.4',
    'http://[::1]',
  ])
    expect(isSecurePortalUrl(url)).toBe(true);
  for (const url of [
    'http://example.com',
    'http://foo.test',
    'http://foo.local',
    'http://localhost.evil.com',
    'http://127.1.2.3.evil.com',
    'ftp://localhost',
    'invalid',
    'https://user:pass@example.com',
  ])
    expect(isSecurePortalUrl(url)).toBe(false);
  config.isDev = true;
  expect(isSecurePortalUrl('http://foo.test')).toBe(true);
  expect(isSecurePortalUrl('http://foo.local')).toBe(true);
});
