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

  resolve(email: string, displayName: string, now: string): Reporter {
    getDb().run(
      `INSERT OR IGNORE INTO reporters (id, email, display_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [generateId('rptr'), email, displayName, now, now]
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

  list(filter: {
    search?: string;
    status?: 'active' | 'suspended';
    cursor?: { createdAt: string; id: string };
    limit: number;
  }): { reporters: Reporter[]; total: number } {
    const conditions: string[] = [];
    const params: string[] = [];
    if (filter.search) {
      conditions.push("(email LIKE ? ESCAPE '\\' OR display_name LIKE ? ESCAPE '\\')");
      const search = `%${filter.search.replace(/[\\%_]/g, '\\$&')}%`;
      params.push(search, search);
    }
    if (filter.status)
      conditions.push(`suspended_at IS ${filter.status === 'active' ? '' : 'NOT '}NULL`);
    const where = () => (conditions.length ? `WHERE ${conditions.join(' AND ')}` : '');
    const total = getDb()
      .query<{ count: number }, string[]>(`SELECT COUNT(*) AS count FROM reporters ${where()}`)
      .get(...params)!.count;
    if (filter.cursor) {
      conditions.push('(created_at < ? OR (created_at = ? AND id < ?))');
      params.push(filter.cursor.createdAt, filter.cursor.createdAt, filter.cursor.id);
    }
    const rows = getDb()
      .query<ReporterRow, (string | number)[]>(
        `SELECT * FROM reporters ${where()} ORDER BY created_at DESC, id DESC LIMIT ?`
      )
      .all(...params, filter.limit + 1);
    return { reporters: rows.map(mapReporter), total };
  },

  ownedProjects(
    ids: string[]
  ): Array<{ reporterId: string; projectId: string; projectName: string; reportCount: number }> {
    if (!ids.length) return [];
    return getDb()
      .query<
        { reporterId: string; projectId: string; projectName: string; reportCount: number },
        string[]
      >(
        `SELECT reports.reporter_id AS reporterId, projects.id AS projectId, projects.name AS projectName, COUNT(*) AS reportCount
       FROM reports JOIN projects ON projects.id = reports.project_id
       WHERE reports.reporter_id IN (${ids.map(() => '?').join(',')}) AND projects.deleted_at IS NULL
       GROUP BY reports.reporter_id, projects.id ORDER BY projects.name, projects.id`
      )
      .all(...ids);
  },

  setSuspension(id: string, suspendedAt: string | null, userId: string | null, now: string): void {
    getDb().run(
      'UPDATE reporters SET suspended_at = ?, suspended_by_user_id = ?, updated_at = ? WHERE id = ?',
      [suspendedAt, userId, now, id]
    );
  },

  recordRevocation(id: string, userId: string | null, now: string): void {
    getDb().run(
      'UPDATE reporters SET sessions_revoked_at = ?, sessions_revoked_by_user_id = ?, updated_at = ? WHERE id = ?',
      [now, userId, now, id]
    );
  },

  anonymizeMessages(id: string, authorName: string): void {
    if (
      getDb()
        .query("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'report_messages'")
        .get()
    ) {
      getDb().run(
        "UPDATE report_messages SET author_name = ? WHERE author_kind = 'reporter' AND reporter_id = ?",
        [authorName, id]
      );
    }
  },

  delete(id: string): void {
    getDb().run('DELETE FROM reporters WHERE id = ?', [id]);
  },

  findIdle(cutoff: string): Reporter[] {
    return getDb()
      .query<ReporterRow, [string]>(
        `SELECT * FROM reporters WHERE suspended_at IS NULL AND julianday(COALESCE(last_login_at, created_at)) < julianday(?)
       AND NOT EXISTS (SELECT 1 FROM reports WHERE reports.reporter_id = reporters.id)
       AND NOT EXISTS (SELECT 1 FROM reports WHERE reports.reporter_id IS NULL AND reports.claimable_email = reporters.email)`
      )
      .all(cutoff)
      .map(mapReporter);
  },

  transaction<T>(work: () => T): T {
    return transaction(work);
  },
};
