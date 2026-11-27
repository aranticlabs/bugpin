export { sha256Hex as hashToken } from './crypto.js';

export function generateSecureToken(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
}
