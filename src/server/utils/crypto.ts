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
