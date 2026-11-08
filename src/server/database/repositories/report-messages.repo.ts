import { getDb } from '../database.js';
import { generateId } from '../../utils/id.js';
import { filesRepo } from './files.repo.js';
import type { ReportMessage } from '@shared/types';
import type { IReportMessagesRepository } from './interfaces.js';

interface ReportMessageRow {
  id: string;
  report_id: string;
  author_kind: ReportMessage['authorKind'];
  user_id: string | null;
  reporter_id: string | null;
  author_name: string;
  body: string;
  hidden_at: string | null;
  hidden_by_user_id: string | null;
  created_at: string;
}

async function mapRowToMessage(row: ReportMessageRow): Promise<ReportMessage> {
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
    files: await filesRepo.findByMessageId(row.id),
    createdAt: row.created_at,
  };
}

export const reportMessagesRepo: IReportMessagesRepository = {
  async create(reportId: string, userId: string, message: string): Promise<ReportMessage> {
    const db = getDb();
    const id = generateId('msg');
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO report_messages (id, report_id, author_kind, user_id, author_name, body, created_at)
       SELECT ?, ?, 'staff', id, name, ?, ? FROM users WHERE id = ?`,
      [id, reportId, message, now, userId]
    );

    const row = db
      .query<ReportMessageRow, [string]>('SELECT * FROM report_messages WHERE id = ?')
      .get(id);
    if (!row) throw new Error('Failed to create report message');
    return mapRowToMessage(row);
  },

  async findByReportId(reportId: string): Promise<ReportMessage[]> {
    const rows = getDb()
      .query<ReportMessageRow, [string]>(
        'SELECT * FROM report_messages WHERE report_id = ? ORDER BY created_at, id'
      )
      .all(reportId);
    return Promise.all(rows.map(mapRowToMessage));
  },
};
