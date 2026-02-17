import { getDb } from '../database.js';
import { generateApiTokenId, generateApiToken } from '../../utils/id.js';
import { hashApiKey, extractApiKeyPrefix } from '../../utils/crypto.js';
import type { CreateApiTokenData, ApiTokenWithHash } from './interfaces.js';
import type { ApiToken, ApiTokenScope } from '@shared/types';

// Database Row Type

interface ApiTokenRow {
  id: string;
  user_id: string;
  name: string;
  token_hash: string;
  token_prefix: string;
  scopes: string;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

// Row to Entity Mapping

function mapRowToApiToken(row: ApiTokenRow): ApiToken {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    tokenPrefix: row.token_prefix,
    scopes: JSON.parse(row.scopes) as ApiTokenScope[],
    lastUsedAt: row.last_used_at ?? undefined,
    expiresAt: row.expires_at ?? undefined,
    createdAt: row.created_at,
    revokedAt: row.revoked_at ?? undefined,
  };
}

function mapRowToApiTokenWithHash(row: ApiTokenRow): ApiTokenWithHash {
  return {
    ...mapRowToApiToken(row),
    tokenHash: row.token_hash,
  };
}

// Repository

export { CreateApiTokenData };

export const apiTokensRepo = {
  /**
   * Create a new API token
   * Returns both the token entity and the raw token (only shown once)
   */
  async create(data: CreateApiTokenData): Promise<{ token: ApiToken; rawToken: string }> {
    const db = getDb();
    const id = generateApiTokenId();
    const rawToken = generateApiToken();
    const tokenHash = hashApiKey(rawToken);
    const tokenPrefix = extractApiKeyPrefix(rawToken);
    const scopes = data.scopes ?? ['read'];
    const now = new Date().toISOString();

    db.run(
      `INSERT INTO api_tokens (id, user_id, name, token_hash, token_prefix, scopes, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.userId,
        data.name,
        tokenHash,
        tokenPrefix,
        JSON.stringify(scopes),
        data.expiresAt ?? null,
        now,
      ],
    );

    const token = await this.findById(id);
    if (!token) {
      throw new Error('Failed to create API token');
    }
    return { token, rawToken };
  },

  /**
   * Find an API token by ID
   */
  async findById(id: string): Promise<ApiToken | null> {
    const db = getDb();
    const row = db
      .query('SELECT * FROM api_tokens WHERE id = ? AND revoked_at IS NULL')
      .get(id) as ApiTokenRow | null;
    return row ? mapRowToApiToken(row) : null;
  },

  /**
   * Find an API token by its hash (for authentication)
   * Only returns valid (non-expired, non-revoked) tokens
   */
  async findByTokenHash(tokenHash: string): Promise<ApiTokenWithHash | null> {
    const db = getDb();
    const now = new Date().toISOString();
    const row = db
      .query(
        `SELECT * FROM api_tokens
         WHERE token_hash = ?
         AND revoked_at IS NULL
         AND (expires_at IS NULL OR expires_at > ?)`,
      )
      .get(tokenHash, now) as ApiTokenRow | null;
    return row ? mapRowToApiTokenWithHash(row) : null;
  },

  /**
   * Find all API tokens for a user
   */
  async findByUserId(userId: string): Promise<ApiToken[]> {
    const db = getDb();
    const rows = db
      .query(
        'SELECT * FROM api_tokens WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at DESC',
      )
      .all(userId) as ApiTokenRow[];
    return rows.map(mapRowToApiToken);
  },

  /**
   * Update last used timestamp
   */
  async updateLastUsed(id: string): Promise<boolean> {
    const db = getDb();
    const now = new Date().toISOString();
    const result = db.run('UPDATE api_tokens SET last_used_at = ? WHERE id = ?', [now, id]);
    return result.changes > 0;
  },

  /**
   * Revoke an API token
   */
  async revoke(id: string): Promise<boolean> {
    const db = getDb();
    const now = new Date().toISOString();
    const result = db.run(
      'UPDATE api_tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL',
      [now, id],
    );
    return result.changes > 0;
  },

  /**
   * Revoke all API tokens for a user
   */
  async revokeAllForUser(userId: string): Promise<number> {
    const db = getDb();
    const now = new Date().toISOString();
    const result = db.run(
      'UPDATE api_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL',
      [now, userId],
    );
    return result.changes;
  },

  /**
   * Delete expired tokens (cleanup)
   */
  async deleteExpired(): Promise<number> {
    const db = getDb();
    const now = new Date().toISOString();
    const result = db.run('DELETE FROM api_tokens WHERE expires_at < ? OR revoked_at IS NOT NULL', [
      now,
    ]);
    return result.changes;
  },
};
