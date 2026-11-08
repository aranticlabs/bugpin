import { getDb, transaction } from '../database.js';
import { generateId } from '../../utils/id.js';
import type { Reporter } from '@shared/types';

interface ReporterRow {
  id: string;
  email: string;
  display_name: string;
  locale: string;
  suspended_at: string | null;
  suspended_by_user_id: string | null;
  sessions_revoked_at: string | null;
  sessions_revoked_by_user_id: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

function mapReporter(row: ReporterRow): Reporter {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    locale: row.locale,
    suspendedAt: row.suspended_at,
    suspendedByUserId: row.suspended_by_user_id,
    sessionsRevokedAt: row.sessions_revoked_at,
    sessionsRevokedByUserId: row.sessions_revoked_by_user_id,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const reportersRepo = {
  findByEmail(email: string): Reporter | null {
    const row = getDb()
      .query<ReporterRow, [string]>('SELECT * FROM reporters WHERE email = ?')
      .get(email);
    return row ? mapReporter(row) : null;
  },

  findById(id: string): Reporter | null {
    const row = getDb()
      .query<ReporterRow, [string]>('SELECT * FROM reporters WHERE id = ?')
      .get(id);
    return row ? mapReporter(row) : null;
  },

  resolve(email: string, now: string): Reporter {
    getDb().run(
      `INSERT OR IGNORE INTO reporters (id, email, display_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [
        generateId('rptr'),
        email,
        email
          .split('@')[0]
          .replace(/[\x00-\x1f\x7f]/g, '')
          .slice(0, 80),
        now,
        now,
      ]
    );
    return this.findByEmail(email)!;
  },

  recordLogin(id: string, now: string): Reporter {
    getDb().run('UPDATE reporters SET last_login_at = ?, updated_at = ? WHERE id = ?', [
      now,
      now,
      id,
    ]);
    return this.findById(id)!;
  },

  transaction<T>(work: () => T): T {
    return transaction(work);
  },
};
