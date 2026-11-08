import { getDb } from '../database.js';
import type { ReportPriority } from '@shared/types';

export interface UserResolutionRow {
  userId: string;
  reportId: string;
  projectId: string;
  priority: ReportPriority;
  createdAt: string;
  resolvedAt: string;
  /** Latest hand-over of the report to this user before the resolution */
  assignedAt: string | null;
  /** First time anyone was assigned the report before the resolution */
  firstAssignedAt: string | null;
  /** First time the report went back to open or in progress after this resolution */
  reopenedAt: string | null;
}

export interface UserTimeRow {
  userId: string;
  at: string;
}

export interface OpenAssignedRow {
  reportId: string;
  priority: ReportPriority;
  createdAt: string;
  firstAssignedAt: string | null;
  /** Whether this user already resolved the report once, so resolving it again earns nothing */
  resolvedBefore: boolean;
}

export interface GamificationSettingsWrite {
  settings: Record<string, boolean>;
  enable: string[];
  disable: string[];
}

const FIRST_ASSIGNED_AT = (reportId: string, before: string) => `(
  SELECT MIN(fa.created_at) FROM report_history fa
  WHERE fa.report_id = ${reportId} AND fa.action = 'assignee_changed'
    AND fa.new_value IS NOT NULL AND fa.created_at <= ${before}
)`;

function placeholders(values: readonly unknown[]): string {
  return values.map(() => '?').join(', ');
}

export const gamificationRepo = {
  /**
   * Every report each user has ever moved to resolved, counted once at its first resolution by
   * that user. Reopening and resolving a report again does not count twice. Reports resolved
   * before report history was recorded fall back to the report's own resolver and time.
   */
  listUserResolutions(userIds: readonly string[]): UserResolutionRow[] {
    if (userIds.length === 0) return [];
    const ids = placeholders(userIds);
    return getDb()
      .query(
        `SELECT first.user_id AS userId, first.report_id AS reportId, r.project_id AS projectId,
           r.priority AS priority, r.created_at AS createdAt, first.resolved_at AS resolvedAt,
           (SELECT MAX(a.created_at) FROM report_history a
            WHERE a.report_id = first.report_id AND a.action = 'assignee_changed'
              AND a.new_value = first.user_id AND a.created_at <= first.resolved_at) AS assignedAt,
           ${FIRST_ASSIGNED_AT('first.report_id', 'first.resolved_at')} AS firstAssignedAt,
           (SELECT MIN(o.created_at) FROM report_history o
            WHERE o.report_id = first.report_id AND o.action = 'status_changed'
              AND o.old_value IN ('resolved', 'closed') AND o.new_value IN ('open', 'in_progress')
              AND o.created_at > first.resolved_at) AS reopenedAt
         FROM (
           SELECT h.user_id, h.report_id, MIN(h.created_at) AS resolved_at
           FROM report_history h
           WHERE h.user_id IN (${ids}) AND h.action = 'status_changed' AND h.new_value = 'resolved'
           GROUP BY h.user_id, h.report_id
           UNION ALL
           SELECT legacy.resolved_by, legacy.id, legacy.resolved_at
           FROM reports legacy
           WHERE legacy.resolved_by IN (${ids}) AND legacy.resolved_at IS NOT NULL
             AND NOT EXISTS (
               SELECT 1 FROM report_history recorded
               WHERE recorded.report_id = legacy.id AND recorded.action = 'status_changed'
                 AND recorded.new_value = 'resolved'
             )
         ) AS first
         JOIN reports r ON r.id = first.report_id
         ORDER BY first.resolved_at ASC`
      )
      .all(...userIds, ...userIds) as UserResolutionRow[];
  },

  /** Times each user first set the priority of a report within the triage window after it arrived */
  listQuickTriage(userIds: readonly string[], withinSeconds: number): UserTimeRow[] {
    if (userIds.length === 0) return [];
    return getDb()
      .query(
        `SELECT h.user_id AS userId, MIN(h.created_at) AS at
         FROM report_history h
         JOIN reports r ON r.id = h.report_id
         WHERE h.user_id IN (${placeholders(userIds)}) AND h.action = 'priority_changed'
           AND unixepoch(h.created_at) - unixepoch(r.created_at) <= ?
         GROUP BY h.user_id, h.report_id
         ORDER BY at ASC`
      )
      .all(...userIds, withinSeconds) as UserTimeRow[];
  },

  listReporterMessageTimes(userIds: readonly string[]): UserTimeRow[] {
    if (userIds.length === 0) return [];
    return getDb()
      .query(
        `SELECT user_id AS userId, created_at AS at FROM report_messages
         WHERE author_kind = 'staff' AND user_id IN (${placeholders(userIds)})`
      )
      .all(...userIds) as UserTimeRow[];
  },

  /** Open reports assigned to the user, with what decides the XP a resolution would earn now */
  listOpenAssigned(userId: string, now: string): OpenAssignedRow[] {
    const rows = getDb()
      .query(
        `SELECT r.id AS reportId, r.priority AS priority, r.created_at AS createdAt,
           ${FIRST_ASSIGNED_AT('r.id', '?')} AS firstAssignedAt,
           EXISTS (
             SELECT 1 FROM report_history h
             WHERE h.report_id = r.id AND h.user_id = ? AND h.action = 'status_changed'
               AND h.new_value = 'resolved'
           ) AS resolvedBefore
         FROM reports r
         WHERE r.status IN ('open', 'in_progress') AND r.assigned_to = ?`
      )
      .all(now, userId, userId) as (Omit<OpenAssignedRow, 'resolvedBefore'> & {
      resolvedBefore: number;
    })[];
    return rows.map((row) => ({ ...row, resolvedBefore: row.resolvedBefore === 1 }));
  },

  /** Workspace settings and per-user switches, written together or not at all */
  saveSettings(write: GamificationSettingsWrite): void {
    const db = getDb();
    const now = new Date().toISOString();
    const setting = db.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    );
    const user = db.prepare(
      'UPDATE users SET gamification_enabled = ?, updated_at = ? WHERE id = ?'
    );
    db.transaction(() => {
      for (const [key, value] of Object.entries(write.settings)) {
        setting.run(key, JSON.stringify(value), now);
      }
      for (const id of write.enable) user.run(1, now, id);
      for (const id of write.disable) user.run(0, now, id);
    })();
  },
};
