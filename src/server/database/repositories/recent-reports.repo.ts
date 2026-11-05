import { getDb } from '../database.js';
import type { IRecentReportsRepository } from './interfaces.js';
import type { ReportStatus } from '@shared/types';

interface RecentReportRow {
  id: string;
  title: string;
  project_id: string;
  status: ReportStatus;
  viewed_at: string;
}

export const recentReportsRepo: IRecentReportsRepository = {
  async record(userId, reportId, keep) {
    const db = getDb();
    db.transaction(() => {
      // Re-inserting gives the latest view the highest rowid, which orders views that
      // share a timestamp.
      db.run('DELETE FROM user_recent_reports WHERE user_id = ? AND report_id = ?', [
        userId,
        reportId,
      ]);
      db.run('INSERT INTO user_recent_reports (user_id, report_id, viewed_at) VALUES (?, ?, ?)', [
        userId,
        reportId,
        new Date().toISOString(),
      ]);
      db.run(
        `DELETE FROM user_recent_reports
         WHERE user_id = ? AND rowid NOT IN (
           SELECT rowid FROM user_recent_reports
           WHERE user_id = ? ORDER BY rowid DESC LIMIT ?
         )`,
        [userId, userId, keep]
      );
    })();
  },

  async listForUser(userId, limit) {
    const rows = getDb()
      .query(
        `SELECT r.id, r.title, r.project_id, r.status, ur.viewed_at
         FROM user_recent_reports ur
         JOIN reports r ON r.id = ur.report_id
         JOIN projects p ON p.id = r.project_id
         WHERE ur.user_id = ? AND p.deleted_at IS NULL
         ORDER BY ur.rowid DESC
         LIMIT ?`
      )
      .all(userId, limit) as RecentReportRow[];
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      projectId: row.project_id,
      status: row.status,
      viewedAt: row.viewed_at,
    }));
  },
};
