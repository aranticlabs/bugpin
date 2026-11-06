import { getDb } from '../database.js';
import type {
  ReportAssignee,
  ReportHistoryAction,
  ReportHistoryEntry,
  ReportPriority,
  ReportStatus,
} from '@shared/types';

export interface ReportTimelineRow {
  createdAt: string;
  /** When the report reached resolved or closed; null while it is still open */
  doneAt: string | null;
}

export interface AttentionRow {
  id: string;
  title: string;
  projectName: string;
  status: ReportStatus;
  priority: ReportPriority;
  assignee?: ReportAssignee;
  since: string;
}

export interface ActivityRow extends ReportHistoryEntry {
  reportTitle: string;
}

export interface ResolutionRow {
  resolvedBy: string;
  resolvedAt: string;
  assignedAt: string | null;
  priority: ReportPriority;
}

export interface UserResolutionRow {
  reportId: string;
  projectId: string;
  priority: ReportPriority;
  createdAt: string;
  resolvedAt: string;
  assignedAt: string | null;
  /** First time the report went back to open or in progress after this resolution */
  reopenedAt: string | null;
}

interface AttentionDbRow {
  id: string;
  title: string;
  project_name: string;
  status: ReportStatus;
  priority: ReportPriority;
  since: string;
  assignee_id: string | null;
  assignee_name: string | null;
  assignee_email: string | null;
  assignee_avatar_url: string | null;
}

interface ActivityDbRow {
  id: string;
  report_id: string;
  report_title: string;
  user_id: string | null;
  user_name: string | null;
  action: ReportHistoryAction;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

const DONE_AT = `CASE WHEN r.status IN ('resolved', 'closed')
  THEN COALESCE(r.resolved_at, r.closed_at, r.updated_at) END`;

const ACTIVE = `r.status IN ('open', 'in_progress')`;

const ATTENTION_COLUMNS = `r.id, r.title, p.name AS project_name, r.status, r.priority,
  u.id AS assignee_id, u.name AS assignee_name, u.email AS assignee_email,
  u.avatar_url AS assignee_avatar_url`;

const ATTENTION_JOINS = `JOIN projects p ON p.id = r.project_id
  LEFT JOIN users u ON u.id = r.assigned_to`;

// Latest hand-over of the report to the person who later resolved it
const ASSIGNED_AT = (resolver: string, resolvedAt: string) => `(
  SELECT MAX(a.created_at) FROM report_history a
  WHERE a.report_id = r.id AND a.action = 'assignee_changed'
    AND a.new_value = ${resolver} AND a.created_at <= ${resolvedAt}
)`;

function projectClause(projectId: string | undefined): { sql: string; params: string[] } {
  return projectId ? { sql: 'AND r.project_id = ?', params: [projectId] } : { sql: '', params: [] };
}

function mapAttention(row: AttentionDbRow): AttentionRow {
  return {
    id: row.id,
    title: row.title,
    projectName: row.project_name,
    status: row.status,
    priority: row.priority,
    since: row.since,
    assignee: row.assignee_id
      ? {
          id: row.assignee_id,
          name: row.assignee_name ?? row.assignee_email ?? row.assignee_id,
          email: row.assignee_email ?? '',
          avatarUrl: row.assignee_avatar_url ?? undefined,
        }
      : undefined,
  };
}

export const dashboardRepo = {
  /** Reports created or finished since the given time */
  listTimeline(projectId: string | undefined, since: string): ReportTimelineRow[] {
    const project = projectClause(projectId);
    return getDb()
      .query(
        `SELECT r.created_at AS createdAt, ${DONE_AT} AS doneAt
         FROM reports r
         WHERE (r.created_at >= ? OR ${DONE_AT} >= ?) ${project.sql}`
      )
      .all(since, since, ...project.params) as ReportTimelineRow[];
  },

  countActive(projectId: string | undefined): number {
    const project = projectClause(projectId);
    const row = getDb()
      .query(`SELECT COUNT(*) AS count FROM reports r WHERE ${ACTIVE} ${project.sql}`)
      .get(...project.params) as { count: number };
    return row.count;
  },

  countActiveByPriority(
    projectId: string | undefined
  ): { priority: ReportPriority; count: number }[] {
    const project = projectClause(projectId);
    return getDb()
      .query(
        `SELECT r.priority AS priority, COUNT(*) AS count FROM reports r
         WHERE ${ACTIVE} ${project.sql} GROUP BY r.priority`
      )
      .all(...project.params) as { priority: ReportPriority; count: number }[];
  },

  listReopened(projectId: string | undefined, since: string, limit: number): AttentionRow[] {
    const project = projectClause(projectId);
    const rows = getDb()
      .query(
        `SELECT ${ATTENTION_COLUMNS}, MAX(h.created_at) AS since
         FROM report_history h
         JOIN reports r ON r.id = h.report_id
         ${ATTENTION_JOINS}
         WHERE h.action = 'status_changed'
           AND h.old_value IN ('resolved', 'closed')
           AND h.new_value IN ('open', 'in_progress')
           AND h.created_at >= ? AND ${ACTIVE} ${project.sql}
         GROUP BY r.id
         ORDER BY since DESC
         LIMIT ?`
      )
      .all(since, ...project.params, limit) as AttentionDbRow[];
    return rows.map(mapAttention);
  },

  listUnassignedUrgent(projectId: string | undefined, limit: number): AttentionRow[] {
    const project = projectClause(projectId);
    const rows = getDb()
      .query(
        `SELECT ${ATTENTION_COLUMNS}, r.created_at AS since
         FROM reports r
         ${ATTENTION_JOINS}
         WHERE ${ACTIVE} AND r.assigned_to IS NULL AND r.priority IN ('highest', 'high')
           ${project.sql}
         ORDER BY r.created_at ASC
         LIMIT ?`
      )
      .all(...project.params, limit) as AttentionDbRow[];
    return rows.map(mapAttention);
  },

  listStale(projectId: string | undefined, updatedBefore: string, limit: number): AttentionRow[] {
    const project = projectClause(projectId);
    const rows = getDb()
      .query(
        `SELECT ${ATTENTION_COLUMNS}, r.updated_at AS since
         FROM reports r
         ${ATTENTION_JOINS}
         WHERE ${ACTIVE} AND r.updated_at < ? ${project.sql}
         ORDER BY r.updated_at ASC
         LIMIT ?`
      )
      .all(updatedBefore, ...project.params, limit) as AttentionDbRow[];
    return rows.map(mapAttention);
  },

  /** Same rules as the three attention lists, counted without their limits */
  countNeedsAttention(
    projectId: string | undefined,
    reopenedSince: string,
    updatedBefore: string
  ): number {
    const project = projectClause(projectId);
    const row = getDb()
      .query(
        `SELECT COUNT(*) AS count FROM reports r
         WHERE ${ACTIVE} ${project.sql} AND (
           (r.assigned_to IS NULL AND r.priority IN ('highest', 'high'))
           OR r.updated_at < ?
           OR EXISTS (
             SELECT 1 FROM report_history h
             WHERE h.report_id = r.id AND h.action = 'status_changed'
               AND h.old_value IN ('resolved', 'closed')
               AND h.new_value IN ('open', 'in_progress')
               AND h.created_at >= ?
           )
         )`
      )
      .get(...project.params, updatedBefore, reopenedSince) as { count: number };
    return row.count;
  },

  listActivity(projectId: string | undefined, limit: number): ActivityRow[] {
    const project = projectClause(projectId);
    const rows = getDb()
      .query(
        `SELECT h.id, h.report_id, r.title AS report_title, h.user_id, u.name AS user_name,
           h.action, h.old_value, h.new_value, h.created_at
         FROM report_history h
         JOIN reports r ON r.id = h.report_id
         LEFT JOIN users u ON u.id = h.user_id
         WHERE 1 = 1 ${project.sql}
         ORDER BY h.created_at DESC
         LIMIT ?`
      )
      .all(...project.params, limit) as ActivityDbRow[];
    return rows.map((row) => ({
      id: row.id,
      reportId: row.report_id,
      reportTitle: row.report_title,
      userId: row.user_id ?? undefined,
      userName: row.user_name ?? undefined,
      action: row.action,
      oldValue: row.old_value ?? undefined,
      newValue: row.new_value ?? undefined,
      createdAt: row.created_at,
    }));
  },

  /** Reports resolved by anyone since the given time, with when they were assigned to the resolver */
  listResolutions(since: string): ResolutionRow[] {
    return getDb()
      .query(
        `SELECT r.resolved_by AS resolvedBy, r.resolved_at AS resolvedAt, r.priority AS priority,
           ${ASSIGNED_AT('r.resolved_by', 'r.resolved_at')} AS assignedAt
         FROM reports r
         WHERE r.resolved_by IS NOT NULL AND r.resolved_at IS NOT NULL AND r.resolved_at >= ?`
      )
      .all(since) as ResolutionRow[];
  },

  /**
   * Every report the user has ever moved to resolved, counted once at its first resolution.
   * Reopening and resolving a report again does not count twice. Reports resolved before
   * report history was recorded fall back to the report's own resolver and resolution time.
   */
  listUserResolutions(userId: string): UserResolutionRow[] {
    return getDb()
      .query(
        `SELECT first.report_id AS reportId, r.project_id AS projectId, r.priority AS priority,
           r.created_at AS createdAt, first.resolved_at AS resolvedAt,
           ${ASSIGNED_AT('?', 'first.resolved_at')} AS assignedAt,
           (SELECT MIN(o.created_at) FROM report_history o
            WHERE o.report_id = first.report_id AND o.action = 'status_changed'
              AND o.old_value IN ('resolved', 'closed') AND o.new_value IN ('open', 'in_progress')
              AND o.created_at > first.resolved_at) AS reopenedAt
         FROM (
           SELECT h.report_id, MIN(h.created_at) AS resolved_at
           FROM report_history h
           WHERE h.user_id = ? AND h.action = 'status_changed' AND h.new_value = 'resolved'
           GROUP BY h.report_id
           UNION ALL
           SELECT legacy.id, legacy.resolved_at
           FROM reports legacy
           WHERE legacy.resolved_by = ? AND legacy.resolved_at IS NOT NULL
             AND NOT EXISTS (
               SELECT 1 FROM report_history recorded
               WHERE recorded.report_id = legacy.id AND recorded.action = 'status_changed'
                 AND recorded.new_value = 'resolved'
             )
         ) AS first
         JOIN reports r ON r.id = first.report_id
         ORDER BY first.resolved_at ASC`
      )
      .all(userId, userId, userId) as UserResolutionRow[];
  },

  listReporterMessageTimes(userId: string): string[] {
    const rows = getDb()
      .query('SELECT sent_at AS sentAt FROM reporter_messages WHERE user_id = ?')
      .all(userId) as { sentAt: string }[];
    return rows.map((row) => row.sentAt);
  },

  countReporterMessages(userId: string): number {
    const row = getDb()
      .query('SELECT COUNT(*) AS count FROM reporter_messages WHERE user_id = ?')
      .get(userId) as { count: number };
    return row.count;
  },

  /** Times the user first set the priority of a report within an hour of it arriving */
  listQuickTriage(userId: string): string[] {
    const rows = getDb()
      .query(
        `SELECT MIN(h.created_at) AS at
         FROM report_history h
         JOIN reports r ON r.id = h.report_id
         WHERE h.user_id = ? AND h.action = 'priority_changed'
           AND (julianday(h.created_at) - julianday(r.created_at)) * 24 <= 1
         GROUP BY h.report_id
         ORDER BY at ASC`
      )
      .all(userId) as { at: string }[];
    return rows.map((row) => row.at);
  },

  /** Open reports assigned to the user, with the oldest time one of them was handed over */
  summarizeAssigned(userId: string): { count: number; oldestAssignedAt: string | null } {
    return getDb()
      .query(
        `SELECT COUNT(*) AS count, MIN(COALESCE(
           (SELECT MAX(a.created_at) FROM report_history a
            WHERE a.report_id = r.id AND a.action = 'assignee_changed' AND a.new_value = ?),
           r.created_at
         )) AS oldestAssignedAt
         FROM reports r
         WHERE ${ACTIVE} AND r.assigned_to = ?`
      )
      .get(userId, userId) as { count: number; oldestAssignedAt: string | null };
  },
};
