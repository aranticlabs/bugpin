import { getDb, transaction } from '../database.js';
import type { FileType, MessageAuthorKind, ReportStatus, ProjectSettings } from '@shared/types';
import type { PortalReportSort } from '@shared/portal-types';
import type { PortalReportCursor } from '../../utils/portal-schemas.js';
import { portalSetting } from '../reporter-portal-sql.js';

const enabledProject = `p.deleted_at IS NULL AND p.is_active = 1 AND ${portalSetting('p', 'enabled')} = 1`;
const visibleReport = `r.reporter_id = ? AND ${enabledProject}`;
const reportTables = 'reports r JOIN projects p ON p.id = r.project_id';
const unread = `EXISTS (SELECT 1 FROM report_messages m WHERE m.report_id = r.id
  AND m.author_kind = 'staff' AND m.hidden_at IS NULL
  AND (r.owner_seen_at IS NULL OR julianday(m.created_at) > julianday(r.owner_seen_at)))`;

/** Whose reports a portal request may read: one reporter's own, or every reporter-facing report for the read-only team view */
export type PortalScope = { kind: 'reporter'; reporterId: string } | { kind: 'operator' };

function scoped(scope: PortalScope): { where: string; params: string[] } {
  return scope.kind === 'reporter'
    ? { where: visibleReport, params: [scope.reporterId] }
    : {
        where: `(r.reporter_id IS NOT NULL OR r.claimable_email IS NOT NULL) AND ${enabledProject}`,
        params: [],
      };
}

// The team view has no reader of its own, so it never reports or clears unread state.
function summaryColumns(scope: PortalScope): string {
  return `r.id, r.title, r.status, p.id AS projectId, p.name AS projectName,
  r.created_at AS createdAt, r.updated_at AS updatedAt, r.reporter_id AS ownerId,
  ${scope.kind === 'reporter' ? unread : '0'} AS unread`;
}

const visibleMessage = 'm.report_id = r.id AND m.hidden_at IS NULL';
const listColumns = `(SELECT COUNT(*) FROM report_messages m WHERE ${visibleMessage}) AS replyCount,
  lm.author_kind AS latestAuthorKind, lm.author_name AS latestAuthorName,
  lm.reporter_id AS latestReporterId, substr(lm.body, 1, 160) AS latestBody,
  lm.created_at AS latestCreatedAt,
  (SELECT COUNT(*) FROM files f WHERE f.message_id = lm.id AND f.report_id = r.id) AS latestFileCount`;
const latestMessage = `LEFT JOIN report_messages lm ON lm.id = (SELECT m.id FROM report_messages m
  WHERE ${visibleMessage} ORDER BY julianday(m.created_at) DESC, m.id DESC LIMIT 1)`;

// Ownership history stores the previous owner as a reporter id or, for a claim, as an email.
const handedOver = `EXISTS (SELECT 1 FROM report_history h WHERE h.report_id = r.id
  AND h.action IN ('owner_assigned', 'owner_removed', 'claimable_set')
  AND h.old_value IS NOT NULL AND instr(h.old_value, '@') = 0
  AND h.old_value IS NOT r.reporter_id)`;

const sortColumn: Record<PortalReportSort, { column: string; descending: boolean }> = {
  updated: { column: 'r.updated_at', descending: true },
  newest: { column: 'r.created_at', descending: true },
  oldest: { column: 'r.created_at', descending: false },
};

/** Escapes LIKE wildcards so a search term matches literally */
function containsPattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

interface SummaryRow {
  id: string;
  title: string;
  status: ReportStatus;
  projectId: string;
  projectName: string;
  createdAt: string;
  updatedAt: string;
  ownerId: string | null;
  unread: number;
}

export interface ListRow extends SummaryRow {
  replyCount: number;
  latestAuthorKind: MessageAuthorKind | null;
  latestAuthorName: string | null;
  latestReporterId: string | null;
  latestBody: string | null;
  latestCreatedAt: string | null;
  latestFileCount: number;
}

interface DetailRow extends SummaryRow {
  description: string | null;
  metadata: string | null;
  handedOver: number;
  assigneeName: string | null;
  allowNewReports: number | null;
  notifyReporter: number | null;
  messagingEnabled: number | null;
}

interface ProjectRow {
  id: string;
  name: string;
  allowNewReports: number | null;
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

function listFilter(
  scope: PortalScope,
  input: { projectId?: string; q?: string }
): { where: string[]; params: (string | number)[] } {
  const visible = scoped(scope);
  const where = [visible.where];
  const params: (string | number)[] = [...visible.params];
  if (input.projectId) {
    where.push('p.id = ?');
    params.push(input.projectId);
  }
  if (input.q) {
    const pattern = containsPattern(input.q);
    where.push(
      "(r.title LIKE ? ESCAPE '\\' OR COALESCE(r.original_description, '') LIKE ? ESCAPE '\\')"
    );
    params.push(pattern, pattern);
  }
  return { where, params };
}

export const portalReportsRepo = {
  visibleScope(reporterId: string): { id: string; projectId: string }[] {
    return getDb()
      .query<{ id: string; projectId: string }, [string]>(
        `SELECT r.id, r.project_id AS projectId FROM ${reportTables} WHERE ${visibleReport}`
      )
      .all(reporterId);
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
      WHERE p.id = ? AND ${enabledProject} AND ${portalSetting('p', 'allowNewReports')} = 1
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

  projects(scope: PortalScope): ProjectRow[] {
    const { where, params } = scoped(scope);
    return getDb()
      .query<ProjectRow, string[]>(
        `SELECT DISTINCT p.id, p.name,
      ${portalSetting('p', 'allowNewReports')} AS allowNewReports,
      json_extract(p.settings, '$.screenshot.maxImageUploadSizeMb') AS maxImageMb,
      json_extract(p.settings, '$.screenshot.maxVideoUploadSizeMb') AS maxVideoMb
      FROM ${reportTables} WHERE ${where} ORDER BY p.name, p.id`
      )
      .all(...params);
  },

  list(
    scope: PortalScope,
    input: {
      projectId?: string;
      status?: ReportStatus;
      q?: string;
      sort: PortalReportSort;
      cursor?: PortalReportCursor;
      limit: number;
    }
  ): { rows: ListRow[]; total: number; unreadCount: number } {
    const { where, params } = listFilter(scope, input);
    if (input.status) {
      where.push('r.status = ?');
      params.push(input.status);
    }
    const counts = getDb()
      .query<{ total: number; unreadCount: number }, (string | number)[]>(
        `SELECT COUNT(*) AS total,
      ${scope.kind === 'reporter' ? `COALESCE(SUM(${unread}), 0)` : '0'} AS unreadCount
      FROM ${reportTables} WHERE ${where.join(' AND ')}`
      )
      .get(...params)!;
    const { column, descending } = sortColumn[input.sort];
    if (input.cursor) {
      where.push(
        `(julianday(${column}) ${descending ? '<' : '>'} julianday(?) OR (julianday(${column}) = julianday(?) AND r.id > ?))`
      );
      params.push(input.cursor.at, input.cursor.at, input.cursor.id);
    }
    const rows = getDb()
      .query<ListRow, (string | number)[]>(
        `SELECT ${summaryColumns(scope)}, ${listColumns} FROM ${reportTables} ${latestMessage}
      WHERE ${where.join(' AND ')}
      ORDER BY julianday(${column}) ${descending ? 'DESC' : 'ASC'}, r.id ASC LIMIT ?`
      )
      .all(...params, input.limit + 1);
    return { rows, ...counts };
  },

  statusCounts(
    scope: PortalScope,
    input: { projectId?: string; q?: string }
  ): { status: ReportStatus; count: number }[] {
    const { where, params } = listFilter(scope, input);
    return getDb()
      .query<{ status: ReportStatus; count: number }, (string | number)[]>(
        `SELECT r.status, COUNT(*) AS count FROM ${reportTables}
      WHERE ${where.join(' AND ')} GROUP BY r.status`
      )
      .all(...params);
  },

  detail(reportId: string, scope: PortalScope): DetailRow | null {
    const { where, params } = scoped(scope);
    return getDb()
      .query<DetailRow, string[]>(
        `SELECT ${summaryColumns(scope)},
      r.original_description AS description, r.metadata, ${handedOver} AS handedOver,
      u.name AS assigneeName,
      ${portalSetting('p', 'allowNewReports')} AS allowNewReports,
      json_extract(p.settings, '$.notifyReporter') AS notifyReporter,
      json_extract(p.settings, '$.reporterNotifications.messagingEnabled') AS messagingEnabled
      FROM ${reportTables} LEFT JOIN users u ON u.id = r.assigned_to
      WHERE ${where} AND r.id = ?`
      )
      .get(...params, reportId);
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
    scope: PortalScope
  ): (PortalFileRow & { path: string; filename: string }) | null {
    const { where, params } = scoped(scope);
    return getDb()
      .query<PortalFileRow & { path: string; filename: string }, string[]>(
        `SELECT ${fileColumns}, f.path, f.filename FROM ${reportTables}
      JOIN files f ON f.report_id = r.id
      LEFT JOIN report_messages m ON m.id = f.message_id AND m.report_id = r.id
      WHERE ${where} AND r.id = ? AND f.id = ?
      AND (f.message_id IS NULL OR (m.id IS NOT NULL AND m.hidden_at IS NULL))`
      )
      .get(...params, reportId, fileId);
  },

  markSeen(reportId: string, now: string): void {
    getDb().run('UPDATE reports SET owner_seen_at = ? WHERE id = ?', [now, reportId]);
  },

  transaction<T>(work: () => T): T {
    return transaction(work);
  },
};
