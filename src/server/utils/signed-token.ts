import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

export function signToken(purpose: string, value: string): string {
  return createHmac('sha256', config.secretKey).update(`${purpose}:${value}`).digest('base64url');
}

export function verifySignedToken(purpose: string, value: string, signature: string): boolean {
  const expected = Buffer.from(signToken(purpose, value));
  const provided = Buffer.from(signature);
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}
