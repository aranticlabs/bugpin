import { getDb } from '../database.js';
import { generateId } from '../../utils/id.js';
import type { ProjectSettings, ReportStatus } from '@shared/types';
import type {
  IReportMessagesRepository,
  MessageAuthor,
  MessageWriteContext,
  StoredReportMessage,
} from './interfaces.js';

interface ReportMessageRow {
  id: string;
  report_id: string;
  author_kind: StoredReportMessage['authorKind'];
  user_id: string | null;
  reporter_id: string | null;
  author_name: string;
  body: string;
  hidden_at: string | null;
  hidden_by_user_id: string | null;
  created_at: string;
}

function mapRowToMessage(row: ReportMessageRow): StoredReportMessage {
  return {
    id: row.id,
    reportId: row.report_id,
    authorKind: row.author_kind,
    userId: row.user_id,
    reporterId: row.reporter_id,
    authorName: row.author_name,
    body: row.body,
    hiddenAt: row.hidden_at,
    hiddenByUserId: row.hidden_by_user_id,
    createdAt: row.created_at,
  };
}

export const reportMessagesRepo = {
  insert(reportId: string, author: MessageAuthor, body: string): StoredReportMessage | null {
    const db = getDb();
    const id = generateId('msg');
    const now = new Date().toISOString();
    const source =
      author.kind === 'staff'
        ? "SELECT id, name FROM users WHERE id = ? AND is_active = 1 AND role IN ('admin', 'editor')"
        : 'SELECT id, display_name AS name FROM reporters WHERE id = ? AND suspended_at IS NULL';
    const result = db.run(
      `INSERT INTO report_messages (id, report_id, author_kind, user_id, reporter_id, author_name, body, created_at)
       SELECT ?, ?, ?, ${author.kind === 'staff' ? 'id, NULL' : 'NULL, id'}, name, ?, ? FROM (${source})`,
      [
        id,
        reportId,
        author.kind,
        body,
        now,
        author.kind === 'staff' ? author.userId : author.reporterId,
      ]
    );
    if (result.changes === 0) return null;
    return this.findById(reportId, id);
  },

  findById(reportId: string, messageId: string): StoredReportMessage | null {
    const row = getDb()
      .query<ReportMessageRow, [string, string]>(
        'SELECT * FROM report_messages WHERE report_id = ? AND id = ?'
      )
      .get(reportId, messageId);
    return row ? mapRowToMessage(row) : null;
  },

  async findByReportId(reportId: string, visibleOnly = false): Promise<StoredReportMessage[]> {
    const rows = getDb()
      .query<ReportMessageRow, [string]>(
        `SELECT * FROM report_messages WHERE report_id = ? ${visibleOnly ? 'AND hidden_at IS NULL' : ''} ORDER BY julianday(created_at), id`
      )
      .all(reportId);
    return rows.map(mapRowToMessage);
  },

  writeContext(reportId: string): MessageWriteContext | null {
    const row = getDb()
      .query<
        {
          project_id: string;
          status: ReportStatus;
          reporter_id: string | null;
          reporter_email: string | null;
          settings: string;
        },
        [string]
      >(
        `SELECT r.project_id, r.status, r.reporter_id, r.reporter_email, p.settings
       FROM reports r JOIN projects p ON p.id = r.project_id
       WHERE r.id = ? AND p.deleted_at IS NULL AND p.is_active = 1`
      )
      .get(reportId);
    return row
      ? {
          projectId: row.project_id,
          status: row.status,
          reporterId: row.reporter_id,
          reporterEmail: row.reporter_email,
          settings: JSON.parse(row.settings) as ProjectSettings,
        }
      : null;
  },

  hasAuthor(author: MessageAuthor): boolean {
    return author.kind === 'staff'
      ? getDb()
          .query(
            "SELECT 1 FROM users WHERE id = ? AND is_active = 1 AND role IN ('admin', 'editor')"
          )
          .get(author.userId) !== null
      : getDb()
          .query('SELECT 1 FROM reporters WHERE id = ? AND suspended_at IS NULL')
          .get(author.reporterId) !== null;
  },

  recordActivity(reportId: string, author: MessageAuthor, now: string): void {
    getDb().run(
      `UPDATE reports SET updated_at = ? ${author.kind === 'reporter' ? ', last_reporter_activity_at = ?' : ''} WHERE id = ?`,
      author.kind === 'reporter' ? [now, now, reportId] : [now, reportId]
    );
  },

  setHidden(
    reportId: string,
    messageId: string,
    userId: string,
    hidden: boolean
  ): StoredReportMessage | null {
    getDb().run(
      'UPDATE report_messages SET hidden_at = ?, hidden_by_user_id = ? WHERE report_id = ? AND id = ?',
      [hidden ? new Date().toISOString() : null, hidden ? userId : null, reportId, messageId]
    );
    return this.findById(reportId, messageId);
  },
} satisfies IReportMessagesRepository;
