import { getDb } from '../database.js';
import {
  REPORT_PRIORITIES,
  type DashboardPerson,
  type ReportHistoryAction,
  type ReportHistoryEntry,
  type ReportPriority,
  type ReportSource,
  type ReportStatus,
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
  assignee?: DashboardPerson;
  since: string;
}

export interface ActivityRow extends ReportHistoryEntry {
  reportTitle: string;
  reportSource: ReportSource;
  reportCreatedAt: string;
}

export interface ResolutionRow {
  resolvedBy: string;
  resolvedAt: string;
  createdAt: string;
  /** Latest hand-over of the report to the person who resolved it */
  assignedAt: string | null;
  priority: ReportPriority;
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
  assignee_avatar_url: string | null;
}

interface ActivityDbRow {
  id: string;
  report_id: string;
  report_title: string;
  report_source: ReportSource;
  report_created_at: string;
  user_id: string | null;
  user_name: string | null;
  action: ReportHistoryAction;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

const DONE_AT = `CASE WHEN r.status IN ('resolved', 'closed')
  THEN COALESCE(r.resolved_at, r.closed_at) END`;

const ACTIVE = `r.status IN ('open', 'in_progress')`;

const PRIORITY_RANK = `CASE r.priority ${REPORT_PRIORITIES.map(
  (priority, index) => `WHEN '${priority}' THEN ${index}`
).join(' ')} END`;

const ATTENTION_COLUMNS = `r.id, r.title, p.name AS project_name, r.status, r.priority,
  u.id AS assignee_id, u.name AS assignee_name, u.avatar_url AS assignee_avatar_url`;

const ATTENTION_JOINS = `JOIN projects p ON p.id = r.project_id
  LEFT JOIN users u ON u.id = r.assigned_to`;

// Reports of soft-deleted projects are kept, but the dashboard leaves them out
const LIVE_PROJECT = `EXISTS (
  SELECT 1 FROM projects lp WHERE lp.id = r.project_id AND lp.deleted_at IS NULL
)`;

function scope(projectId: string | undefined): { sql: string; params: string[] } {
  return projectId
    ? { sql: `AND r.project_id = ? AND ${LIVE_PROJECT}`, params: [projectId] }
    : { sql: `AND ${LIVE_PROJECT}`, params: [] };
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
          name: row.assignee_name ?? row.assignee_id,
          avatarUrl: row.assignee_avatar_url ?? undefined,
        }
      : undefined,
  };
}

export const dashboardRepo = {
  /**
   * Reports created or finished since the given time. Split into one branch per timestamp so
   * each can use its own index instead of scanning every report.
   */
  listTimeline(projectId: string | undefined, since: string): ReportTimelineRow[] {
    const project = scope(projectId);
    const select = `SELECT r.id, r.created_at AS createdAt, ${DONE_AT} AS doneAt FROM reports r`;
    const done = `r.status IN ('resolved', 'closed')`;
    const rows = getDb()
      .query(
        `${select} WHERE r.created_at >= ? ${project.sql}
         UNION
         ${select} WHERE ${done} AND r.resolved_at >= ? ${project.sql}
         UNION
         ${select} WHERE ${done} AND r.resolved_at IS NULL AND r.closed_at >= ? ${project.sql}`
      )
      .all(
        since,
        ...project.params,
        since,
        ...project.params,
        since,
        ...project.params
      ) as (ReportTimelineRow & { id: string })[];
    return rows.map(({ createdAt, doneAt }) => ({ createdAt, doneAt }));
  },

  countActive(projectId: string | undefined): number {
    const project = scope(projectId);
    const row = getDb()
      .query(`SELECT COUNT(*) AS count FROM reports r WHERE ${ACTIVE} ${project.sql}`)
      .get(...project.params) as { count: number };
    return row.count;
  },

  countActiveByPriority(
    projectId: string | undefined
  ): { priority: ReportPriority; count: number }[] {
    const project = scope(projectId);
    return getDb()
      .query(
        `SELECT r.priority AS priority, COUNT(*) AS count FROM reports r
         WHERE ${ACTIVE} ${project.sql} GROUP BY r.priority`
      )
      .all(...project.params) as { priority: ReportPriority; count: number }[];
  },

  /** Most urgent first, so a limit never drops a higher priority report for an older one */
  listReopened(projectId: string | undefined, since: string, limit: number): AttentionRow[] {
    const project = scope(projectId);
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
         ORDER BY ${PRIORITY_RANK} ASC, since ASC
         LIMIT ?`
      )
      .all(since, ...project.params, limit) as AttentionDbRow[];
    return rows.map(mapAttention);
  },

  listUnassignedUrgent(projectId: string | undefined, limit: number): AttentionRow[] {
    const project = scope(projectId);
    const rows = getDb()
      .query(
        `SELECT ${ATTENTION_COLUMNS}, r.created_at AS since
         FROM reports r
         ${ATTENTION_JOINS}
         WHERE ${ACTIVE} AND r.assigned_to IS NULL AND r.priority IN ('highest', 'high')
           ${project.sql}
         ORDER BY ${PRIORITY_RANK} ASC, r.created_at ASC
         LIMIT ?`
      )
      .all(...project.params, limit) as AttentionDbRow[];
    return rows.map(mapAttention);
  },

  listStale(projectId: string | undefined, updatedBefore: string, limit: number): AttentionRow[] {
    const project = scope(projectId);
    const rows = getDb()
      .query(
        `SELECT ${ATTENTION_COLUMNS}, r.updated_at AS since
         FROM reports r
         ${ATTENTION_JOINS}
         WHERE ${ACTIVE} AND r.updated_at < ? ${project.sql}
         ORDER BY ${PRIORITY_RANK} ASC, r.updated_at ASC
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
    const project = scope(projectId);
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
    const project = scope(projectId);
    const rows = getDb()
      .query(
        `SELECT h.id, h.report_id, r.title AS report_title, r.source AS report_source,
           r.created_at AS report_created_at, h.user_id, u.name AS user_name,
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
      reportSource: row.report_source,
      reportCreatedAt: row.report_created_at,
      userId: row.user_id ?? undefined,
      userName: row.user_name ?? undefined,
      action: row.action,
      oldValue: row.old_value ?? undefined,
      newValue: row.new_value ?? undefined,
      createdAt: row.created_at,
    }));
  },

  /** Reports resolved by anyone since the given time, with when they were handed to the resolver */
  listResolutions(since: string): ResolutionRow[] {
    return getDb()
      .query(
        `SELECT r.resolved_by AS resolvedBy, r.resolved_at AS resolvedAt,
           r.created_at AS createdAt, r.priority AS priority,
           (SELECT MAX(a.created_at) FROM report_history a
            WHERE a.report_id = r.id AND a.action = 'assignee_changed'
              AND a.new_value = r.resolved_by AND a.created_at <= r.resolved_at) AS assignedAt
         FROM reports r
         WHERE r.resolved_by IS NOT NULL AND r.resolved_at IS NOT NULL AND r.resolved_at >= ?`
      )
      .all(since) as ResolutionRow[];
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
         WHERE ${ACTIVE} AND r.assigned_to = ? ${scope(undefined).sql}`
      )
      .get(userId, userId) as { count: number; oldestAssignedAt: string | null };
  },
};
