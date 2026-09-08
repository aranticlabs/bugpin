import { randomUUID } from 'crypto';
import { getDb } from '../database.js';
import type { ReportHistoryAction, ReportHistoryEntry } from '@shared/types';

interface ReportHistoryRow {
  id: string;
  report_id: string;
  user_id: string | null;
  user_name: string | null;
  action: ReportHistoryAction;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

function mapRowToEntry(row: ReportHistoryRow): ReportHistoryEntry {
  return {
    id: row.id,
    reportId: row.report_id,
    userId: row.user_id ?? undefined,
    userName: row.user_name ?? undefined,
    action: row.action,
    oldValue: row.old_value ?? undefined,
    newValue: row.new_value ?? undefined,
    createdAt: row.created_at,
  };
}

export interface CreateReportHistoryData {
  reportId: string;
  userId?: string | null;
  action: ReportHistoryAction;
  oldValue?: string | null;
  newValue?: string | null;
}

export const reportHistoryRepo = {
  async create(data: CreateReportHistoryData): Promise<ReportHistoryEntry> {
    const db = getDb();
    const id = randomUUID();
    const now = new Date().toISOString();

    db.run(
      `INSERT INTO report_history (id, report_id, user_id, action, old_value, new_value, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.reportId,
        data.userId ?? null,
        data.action,
        data.oldValue ?? null,
        data.newValue ?? null,
        now,
      ]
    );

    const row = db
      .query(
        `SELECT rh.*, u.name as user_name
         FROM report_history rh
         LEFT JOIN users u ON u.id = rh.user_id
         WHERE rh.id = ?`
      )
      .get(id) as ReportHistoryRow;

    return mapRowToEntry(row);
  },

  async findByReportId(reportId: string): Promise<ReportHistoryEntry[]> {
    const db = getDb();
    const rows = db
      .query(
        `SELECT rh.*, u.name as user_name
         FROM report_history rh
         LEFT JOIN users u ON u.id = rh.user_id
         WHERE rh.report_id = ?
         ORDER BY rh.created_at ASC`
      )
      .all(reportId) as ReportHistoryRow[];

    return rows.map(mapRowToEntry);
  },

  async findUserNameById(userId: string): Promise<string | undefined> {
    const db = getDb();
    const row = db.query('SELECT name FROM users WHERE id = ?').get(userId) as {
      name: string;
    } | null;
    return row?.name;
  },
};
