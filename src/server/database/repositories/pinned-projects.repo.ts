import { getDb } from '../database.js';
import type { IPinnedProjectsRepository } from './interfaces.js';
import type { ProjectSummary } from '@shared/types';

interface PinnedProjectRow {
  id: string;
  name: string;
  is_active: number;
}

export const pinnedProjectsRepo: IPinnedProjectsRepository = {
  async listForUser(userId) {
    const rows = getDb()
      .query(
        `SELECT p.id, p.name, p.is_active
         FROM user_pinned_projects up
         JOIN projects p ON p.id = up.project_id
         WHERE up.user_id = ? AND p.deleted_at IS NULL
         ORDER BY up.position, up.created_at`
      )
      .all(userId) as PinnedProjectRow[];
    return rows.map((row): ProjectSummary => ({
      id: row.id,
      name: row.name,
      isActive: row.is_active === 1,
    }));
  },

  async count(userId) {
    const row = getDb()
      .query(
        `SELECT COUNT(*) as count
         FROM user_pinned_projects up
         JOIN projects p ON p.id = up.project_id
         WHERE up.user_id = ? AND p.deleted_at IS NULL`
      )
      .get(userId) as { count: number };
    return row.count;
  },

  async pin(userId, projectId) {
    getDb().run(
      `INSERT OR IGNORE INTO user_pinned_projects (user_id, project_id, created_at, position)
       VALUES (?, ?, ?, (SELECT COALESCE(MAX(position) + 1, 0) FROM user_pinned_projects WHERE user_id = ?))`,
      [userId, projectId, new Date().toISOString(), userId]
    );
  },

  async unpin(userId, projectId) {
    const result = getDb().run(
      'DELETE FROM user_pinned_projects WHERE user_id = ? AND project_id = ?',
      [userId, projectId]
    );
    return result.changes > 0;
  },

  async reorder(userId, projectIds) {
    const db = getDb();
    const update = db.prepare(
      'UPDATE user_pinned_projects SET position = ? WHERE user_id = ? AND project_id = ?'
    );
    db.transaction(() => {
      projectIds.forEach((projectId, index) => update.run(index, userId, projectId));
    })();
  },
};
