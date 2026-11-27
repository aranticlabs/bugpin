import { getDb, transaction } from '../database.js';
import { generateId } from '../../utils/id.js';

export interface PortalOperatorSession {
  id: string;
  userId: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

export interface PortalOperatorToken {
  id: string;
  userId: string;
  email: string;
  expiresAt: string;
  consumedAt: string | null;
}

const sessionColumns = `id, user_id AS userId, created_at AS createdAt, last_used_at AS lastUsedAt,
  expires_at AS expiresAt, revoked_at AS revokedAt`;

export const portalOperatorsRepo = {
  verifiedEmail(userId: string): string | null {
    return (
      getDb()
        .query<{ email: string | null }, [string]>(
          'SELECT portal_verified_email AS email FROM users WHERE id = ?'
        )
        .get(userId)?.email ?? null
    );
  },

  setVerifiedEmail(userId: string, email: string): void {
    getDb().run('UPDATE users SET portal_verified_email = ? WHERE id = ?', [email, userId]);
  },

  createSession(data: { tokenHash: string; userId: string; now: string; expiresAt: string }) {
    const id = generateId('opses');
    getDb().run(
      `INSERT INTO portal_operator_sessions (id, token_hash, user_id, created_at, last_used_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, data.tokenHash, data.userId, data.now, data.now, data.expiresAt]
    );
    return { id, expiresAt: data.expiresAt };
  },

  findSessionByHash(hash: string): PortalOperatorSession | null {
    return getDb()
      .query<PortalOperatorSession, [string]>(
        `SELECT ${sessionColumns} FROM portal_operator_sessions WHERE token_hash = ?`
      )
      .get(hash);
  },

  touchSession(id: string, now: string): void {
    getDb().run(
      'UPDATE portal_operator_sessions SET last_used_at = ? WHERE id = ? AND revoked_at IS NULL',
      [now, id]
    );
  },

  revokeSession(id: string, now: string): void {
    getDb().run(
      'UPDATE portal_operator_sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL',
      [now, id]
    );
  },

  revokeAllForUser(userId: string, now: string): void {
    getDb().run(
      'UPDATE portal_operator_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL',
      [now, userId]
    );
  },

  revokeAll(now: string): void {
    getDb().run('UPDATE portal_operator_sessions SET revoked_at = ? WHERE revoked_at IS NULL', [
      now,
    ]);
  },

  createToken(data: {
    tokenHash: string;
    userId: string;
    email: string;
    now: string;
    expiresAt: string;
  }): void {
    getDb().run(
      `INSERT INTO portal_operator_tokens (id, token_hash, user_id, email, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [generateId('optok'), data.tokenHash, data.userId, data.email, data.expiresAt, data.now]
    );
  },

  findTokenByHash(hash: string): PortalOperatorToken | null {
    return getDb()
      .query<PortalOperatorToken, [string]>(
        `SELECT id, user_id AS userId, email, expires_at AS expiresAt, consumed_at AS consumedAt
         FROM portal_operator_tokens WHERE token_hash = ?`
      )
      .get(hash);
  },

  consumeToken(id: string, now: string): boolean {
    return (
      getDb().run(
        `UPDATE portal_operator_tokens SET consumed_at = ?
         WHERE id = ? AND consumed_at IS NULL AND expires_at > ?`,
        [now, id, now]
      ).changes === 1
    );
  },

  deleteOlderThan(cutoff: string): { tokens: number; sessions: number } {
    const db = getDb();
    const tokens = db.run(
      `DELETE FROM portal_operator_tokens WHERE julianday(expires_at) < julianday(?)
       OR julianday(consumed_at) < julianday(?)`,
      [cutoff, cutoff]
    ).changes;
    const sessions = db.run(
      `DELETE FROM portal_operator_sessions WHERE julianday(expires_at) < julianday(?)
       OR julianday(revoked_at) < julianday(?)`,
      [cutoff, cutoff]
    ).changes;
    return { tokens, sessions };
  },

  transaction<T>(work: () => T): T {
    return transaction(work);
  },
};
