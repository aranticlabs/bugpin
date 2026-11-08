import { getDb } from '../database.js';
import { generateId } from '../../utils/id.js';
import type { ReporterAuthTokenSource } from '@shared/types';

interface AuthTokenRow {
  id: string;
  token_hash: string;
  email: string;
  source: ReporterAuthTokenSource;
  report_id: string | null;
  expires_at: string;
  consumed_at: string | null;
  revoked_at: string | null;
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

  findByHash(hash: string): AuthTokenRow | null {
    return getDb()
      .query<AuthTokenRow, [string]>(
        "SELECT * FROM reporter_auth_tokens WHERE token_hash = ? AND purpose = 'login'"
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
};
