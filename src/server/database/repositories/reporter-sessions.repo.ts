import { getDb } from '../database.js';
import { generateId } from '../../utils/id.js';

interface ReporterSession {
  id: string;
  reporterId: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  absoluteExpiresAt: string;
  revokedAt: string | null;
}

export const reporterSessionsRepo = {
  create(tokenHash: string, reporterId: string, now: string): ReporterSession {
    const id = generateId('rses');
    const expiresAt = new Date(Date.parse(now) + 30 * 86400000).toISOString();
    const absoluteExpiresAt = new Date(Date.parse(now) + 90 * 86400000).toISOString();
    getDb().run(
      `INSERT INTO reporter_sessions (id, token_hash, reporter_id, created_at, last_used_at, expires_at, absolute_expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, tokenHash, reporterId, now, now, expiresAt, absoluteExpiresAt]
    );
    return {
      id,
      reporterId,
      createdAt: now,
      lastUsedAt: now,
      expiresAt,
      absoluteExpiresAt,
      revokedAt: null,
    };
  },

  findByHash(hash: string): ReporterSession | null {
    return getDb()
      .query<ReporterSession, [string]>(
        `SELECT id, reporter_id AS reporterId, created_at AS createdAt, last_used_at AS lastUsedAt,
       expires_at AS expiresAt, absolute_expires_at AS absoluteExpiresAt, revoked_at AS revokedAt
       FROM reporter_sessions WHERE token_hash = ?`
      )
      .get(hash);
  },

  renew(id: string, now: string, expiresAt: string): void {
    getDb().run(
      'UPDATE reporter_sessions SET last_used_at = ?, expires_at = ? WHERE id = ? AND revoked_at IS NULL',
      [now, expiresAt, id]
    );
  },

  revoke(id: string, now: string): void {
    getDb().run('UPDATE reporter_sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL', [
      now,
      id,
    ]);
  },
};
