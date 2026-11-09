import { getDb, transaction } from '../database.js';
import type { FileType, MessageAuthorKind, ReportStatus, ProjectSettings } from '@shared/types';
import type { PortalReportCursor } from '../../utils/portal-schemas.js';

const enabledProject = `p.deleted_at IS NULL AND p.is_active = 1 AND json_extract(p.settings, '$.reporterPortal.enabled') = 1`;
const visibleReport = `r.reporter_id = ? AND ${enabledProject}`;
const reportTables = 'reports r JOIN projects p ON p.id = r.project_id';
const unread = `EXISTS (SELECT 1 FROM report_messages m WHERE m.report_id = r.id
  AND m.author_kind = 'staff' AND m.hidden_at IS NULL
  AND (r.owner_seen_at IS NULL OR julianday(m.created_at) > julianday(r.owner_seen_at)))`;
const summaryColumns = `r.id, r.title, r.status, p.id AS projectId, p.name AS projectName,
  r.created_at AS createdAt, r.updated_at AS updatedAt, ${unread} AS unread`;

interface SummaryRow {
  id: string;
  title: string;
  status: ReportStatus;
  projectId: string;
  projectName: string;
  createdAt: string;
  updatedAt: string;
  unread: number;
}

interface DetailRow extends SummaryRow {
  description: string | null;
  assigneeName: string | null;
  allowNewFeedback: number | null;
  notifyReporter: number | null;
  messagingEnabled: number | null;
}

interface ProjectRow {
  id: string;
  name: string;
  allowNewFeedback: number | null;
  maxImageMb: number | null;
  maxVideoMb: number | null;
}

interface MessageRow {
  id: string;
  authorKind: MessageAuthorKind;
  authorName: string;
  reporterId: string | null;
  body: string;
  createdAt: string;
}

export interface PortalFileRow {
  id: string;
  type: FileType;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  messageId: string | null;
}

const fileColumns = `f.id, f.type, f.mime_type AS mimeType, f.size_bytes AS sizeBytes,
  f.width, f.height, f.message_id AS messageId`;

export const portalReportsRepo = {
  visibleIds(reporterId: string): string[] {
    return getDb()
      .query<{ id: string }, [string]>(`SELECT r.id FROM ${reportTables} WHERE ${visibleReport}`)
      .all(reporterId)
      .map((row) => row.id);
  },

  eventOwner(reportId: string): { reporterId: string; projectId: string } | null {
    return getDb()
      .query<{ reporterId: string; projectId: string }, [string]>(
        `SELECT r.reporter_id AS reporterId, p.id AS projectId FROM ${reportTables}
       WHERE r.id = ? AND r.reporter_id IS NOT NULL AND ${enabledProject}`
      )
      .get(reportId);
  },

  submissionContext(projectId: string, reporterId: string) {
    const row = getDb()
      .query<
        {
          settings: string;
          email: string;
          displayName: string;
          locale: string;
          assignedTo: string | null;
        },
        [string, string]
      >(
        `SELECT p.settings, a.email, a.display_name AS displayName, a.locale, u.id AS assignedTo
      FROM projects p JOIN reporters a ON a.id = ? AND a.suspended_at IS NULL
      LEFT JOIN users u ON u.id = json_extract(p.settings, '$.defaultAssigneeUserId') AND u.is_active = 1
        AND (u.invitation_sent_at IS NULL OR u.invitation_accepted_at IS NOT NULL)
      WHERE p.id = ? AND ${enabledProject} AND json_extract(p.settings, '$.reporterPortal.allowNewFeedback') = 1
      AND EXISTS (SELECT 1 FROM reports r WHERE r.project_id = p.id AND r.reporter_id = a.id)`
      )
      .get(reporterId, projectId);
    return row ? { ...row, settings: JSON.parse(row.settings) as ProjectSettings } : null;
  },

  insertSubmission(input: {
    id: string;
    projectId: string;
    reporterId: string;
    title: string;
    description?: string;
    email: string;
    displayName: string;
    locale: string;
    assignedTo: string | null;
    now: string;
  }): void {
    getDb().run(
      `INSERT INTO reports (id, project_id, source, title, description, original_description,
      reporter_id, reporter_email, reporter_name, reporter_locale, assigned_to,
      metadata, created_at, updated_at, last_reporter_activity_at, board_position)
      VALUES (?, ?, 'portal', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        (SELECT COALESCE(MIN(board_position), 0) - 1 FROM reports WHERE status = 'open'))`,
      [
        input.id,
        input.projectId,
        input.title,
        input.description ?? null,
        input.description ?? null,
        input.reporterId,
        input.email,
        input.displayName,
        input.locale,
        input.assignedTo,
        JSON.stringify({ timestamp: input.now, portal: true }),
        input.now,
        input.now,
        input.now,
      ]
    );
  },

  projects(reporterId: string): ProjectRow[] {
    return getDb()
      .query<ProjectRow, [string]>(
        `SELECT DISTINCT p.id, p.name,
      json_extract(p.settings, '$.reporterPortal.allowNewFeedback') AS allowNewFeedback,
      json_extract(p.settings, '$.screenshot.maxImageUploadSizeMb') AS maxImageMb,
      json_extract(p.settings, '$.screenshot.maxVideoUploadSizeMb') AS maxVideoMb
      FROM ${reportTables} WHERE ${visibleReport} ORDER BY p.name, p.id`
      )
      .all(reporterId);
  },

  list(
    reporterId: string,
    input: {
      projectId?: string;
      status?: ReportStatus;
      cursor?: PortalReportCursor;
      limit: number;
    }
  ): { rows: SummaryRow[]; total: number; unreadCount: number } {
    const where = [visibleReport];
    const params: (string | number)[] = [reporterId];
    if (input.projectId) {
      where.push('p.id = ?');
      params.push(input.projectId);
    }
    if (input.status) {
      where.push('r.status = ?');
      params.push(input.status);
    }
    const counts = getDb()
      .query<{ total: number; unreadCount: number }, (string | number)[]>(
        `SELECT COUNT(*) AS total, COALESCE(SUM(${unread}), 0) AS unreadCount
      FROM ${reportTables} WHERE ${where.join(' AND ')}`
      )
      .get(...params)!;
    if (input.cursor) {
      where.push(
        '(julianday(r.updated_at) < julianday(?) OR (julianday(r.updated_at) = julianday(?) AND r.id > ?))'
      );
      params.push(input.cursor.updatedAt, input.cursor.updatedAt, input.cursor.id);
    }
    const rows = getDb()
      .query<SummaryRow, (string | number)[]>(
        `SELECT ${summaryColumns} FROM ${reportTables} WHERE ${where.join(' AND ')}
      ORDER BY julianday(r.updated_at) DESC, r.id ASC LIMIT ?`
      )
      .all(...params, input.limit + 1);
    return { rows, ...counts };
  },

  detail(reportId: string, reporterId: string): DetailRow | null {
    return getDb()
      .query<DetailRow, [string, string]>(
        `SELECT ${summaryColumns}, r.original_description AS description, u.name AS assigneeName,
      json_extract(p.settings, '$.reporterPortal.allowNewFeedback') AS allowNewFeedback,
      json_extract(p.settings, '$.notifyReporter') AS notifyReporter,
      json_extract(p.settings, '$.reporterNotifications.messagingEnabled') AS messagingEnabled
      FROM ${reportTables} LEFT JOIN users u ON u.id = r.assigned_to
      WHERE ${visibleReport} AND r.id = ?`
      )
      .get(reporterId, reportId);
  },

  messages(reportId: string): MessageRow[] {
    return getDb()
      .query<MessageRow, [string]>(
        `SELECT id, author_kind AS authorKind, author_name AS authorName,
      reporter_id AS reporterId, body, created_at AS createdAt FROM report_messages
      WHERE report_id = ? AND hidden_at IS NULL ORDER BY julianday(created_at), id`
      )
      .all(reportId);
  },

  files(reportId: string): PortalFileRow[] {
    return getDb()
      .query<PortalFileRow, [string]>(
        `SELECT ${fileColumns} FROM files f
      LEFT JOIN report_messages m ON m.id = f.message_id AND m.report_id = f.report_id
      WHERE f.report_id = ? AND (f.message_id IS NULL OR (m.id IS NOT NULL AND m.hidden_at IS NULL))
      ORDER BY julianday(f.created_at), f.id`
      )
      .all(reportId);
  },

  file(
    reportId: string,
    fileId: string,
    reporterId: string
  ): (PortalFileRow & { path: string; filename: string }) | null {
    return getDb()
      .query<PortalFileRow & { path: string; filename: string }, [string, string, string]>(
        `SELECT ${fileColumns}, f.path, f.filename FROM ${reportTables}
      JOIN files f ON f.report_id = r.id
      LEFT JOIN report_messages m ON m.id = f.message_id AND m.report_id = r.id
      WHERE ${visibleReport} AND r.id = ? AND f.id = ?
      AND (f.message_id IS NULL OR (m.id IS NOT NULL AND m.hidden_at IS NULL))`
      )
      .get(reporterId, reportId, fileId);
  },

  markSeen(reportId: string, now: string): void {
    getDb().run('UPDATE reports SET owner_seen_at = ? WHERE id = ?', [now, reportId]);
  },

  transaction<T>(work: () => T): T {
    return transaction(work);
  },
};
