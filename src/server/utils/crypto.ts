import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { config } from '../config.js';

/**
 * Hash an API key using SHA256
 * Returns the hex-encoded hash
 */
export function hashApiKey(apiKey: string): string {
  const hasher = new Bun.CryptoHasher('sha256');
  hasher.update(apiKey);
  return hasher.digest('hex');
}

/**
 * Extract the prefix from an API key for display purposes
 * Returns the first 12 characters (e.g., "proj_a1b2c3d4")
 */
export function extractApiKeyPrefix(apiKey: string): string {
  // Return first 12 characters which includes "proj_" plus 7 chars of the UUID
  return apiKey.substring(0, 12);
}

const SECRET_BOX_VERSION = 'v1';

// A dedicated key per purpose, so the instance secret never encrypts data directly.
function deriveKey(purpose: string): Buffer {
  return createHash('sha256').update(`${config.secretKey}:${purpose}`).digest();
}

/**
 * Encrypt a small secret (for example a TOTP seed) with AES-256-GCM.
 * Output format: `v1:<iv>:<tag>:<ciphertext>`, each part base64url.
 */
export function encryptSecret(plaintext: string, purpose: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(purpose), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [
    SECRET_BOX_VERSION,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':');
}

/**
 * Decrypt a value produced by encryptSecret. Returns null when the value is malformed
 * or was encrypted with a different key.
 */
export function decryptSecret(value: string, purpose: string): string | null {
  const [version, iv, tag, ciphertext] = value.split(':');
  if (version !== SECRET_BOX_VERSION || !iv || !tag || ciphertext === undefined) return null;
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      deriveKey(purpose),
      Buffer.from(iv, 'base64url')
    );
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}

/**
 * SHA-256 hex digest, for high-entropy values such as recovery codes
 */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
