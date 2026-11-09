import { getDb } from '../database.js';
import { generateId } from '../../utils/id.js';
import type { ReporterAuthTokenSource } from '@shared/types';

interface ReporterAuthToken {
  id: string;
  email: string;
  source: ReporterAuthTokenSource;
  reportId: string | null;
  expiresAt: string;
  consumedAt: string | null;
  revokedAt: string | null;
}

export const reporterAuthTokensRepo = {
  create(data: {
    tokenHash: string;
    email: string;
    source: ReporterAuthTokenSource;
    reportId?: string;
    expiresAt: string;
    now: string;
  }): void {
    getDb().run(
      `INSERT INTO reporter_auth_tokens (id, token_hash, email, purpose, source, report_id, expires_at, created_at)
       VALUES (?, ?, ?, 'login', ?, ?, ?, ?)`,
      [
        generateId('rtok'),
        data.tokenHash,
        data.email,
        data.source,
        data.reportId ?? null,
        data.expiresAt,
        data.now,
      ]
    );
  },

  findByHash(hash: string): ReporterAuthToken | null {
    return getDb()
      .query<ReporterAuthToken, [string]>(
        `SELECT id, email, source, report_id AS reportId, expires_at AS expiresAt,
         consumed_at AS consumedAt, revoked_at AS revokedAt FROM reporter_auth_tokens
         WHERE token_hash = ? AND purpose = 'login'`
      )
      .get(hash);
  },

  consume(id: string, now: string): boolean {
    return (
      getDb().run(
        `UPDATE reporter_auth_tokens SET consumed_at = ?
       WHERE id = ? AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at > ?`,
        [now, id, now]
      ).changes === 1
    );
  },

  revokeByEmail(email: string, now: string): void {
    getDb().run(
      'UPDATE reporter_auth_tokens SET revoked_at = ? WHERE email = ? AND consumed_at IS NULL AND revoked_at IS NULL',
      [now, email]
    );
  },

  deleteOlderThan(cutoff: string): number {
    return getDb().run(
      'DELETE FROM reporter_auth_tokens WHERE julianday(expires_at) < julianday(?) OR julianday(consumed_at) < julianday(?)',
      [cutoff, cutoff]
    ).changes;
  },
};
