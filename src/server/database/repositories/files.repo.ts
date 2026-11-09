import { getDb } from '../database.js';
import { generateFileId } from '../../utils/id.js';
import type { CreateFileData, IFilesRepository } from './interfaces.js';
import type { FileRecord, FileType } from '@shared/types';

// Database Row Type

interface FileRow {
  id: string;
  report_id: string;
  message_id: string | null;
  uploaded_by_reporter_id: string | null;
  type: FileType;
  filename: string;
  path: string;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  created_at: string;
}

// Row to Entity Mapping

function mapRowToFile(row: FileRow): FileRecord {
  return {
    id: row.id,
    reportId: row.report_id,
    messageId: row.message_id,
    uploadedByReporterId: row.uploaded_by_reporter_id,
    type: row.type,
    filename: row.filename,
    path: row.path,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    width: row.width ?? undefined,
    height: row.height ?? undefined,
    createdAt: row.created_at,
  };
}

// Repository

export { CreateFileData };

export const filesRepo = {
  /**
   * Create a new file record
   */
  async create(data: CreateFileData): Promise<FileRecord> {
    return this.insert(data);
  },

  insert(data: CreateFileData): FileRecord {
    const db = getDb();
    const id = generateFileId();
    const now = new Date().toISOString();
    if (
      data.messageId &&
      !db
        .query('SELECT 1 FROM report_messages WHERE id = ? AND report_id = ?')
        .get(data.messageId, data.reportId)
    ) {
      throw new Error('Message does not belong to this report');
    }

    db.run(
      `INSERT INTO files (id, report_id, type, filename, path, mime_type, size_bytes, width, height, created_at, message_id, uploaded_by_reporter_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.reportId,
        data.type,
        data.filename,
        data.path,
        data.mimeType,
        data.sizeBytes,
        data.width ?? null,
        data.height ?? null,
        now,
        data.messageId ?? null,
        data.uploadedByReporterId ?? null,
      ]
    );

    const row = db.query<FileRow, [string]>('SELECT * FROM files WHERE id = ?').get(id);
    const file = row ? mapRowToFile(row) : null;
    if (!file) {
      throw new Error('Failed to create file record');
    }
    return file;
  },

  /**
   * Find a file by ID
   */
  async findById(id: string): Promise<FileRecord | null> {
    const db = getDb();
    const row = db.query('SELECT * FROM files WHERE id = ?').get(id) as FileRow | null;
    return row ? mapRowToFile(row) : null;
  },

  /**
   * Find all files for a report
   */
  async findByReportId(reportId: string): Promise<FileRecord[]> {
    const db = getDb();
    const rows = db
      .query('SELECT * FROM files WHERE report_id = ? ORDER BY created_at ASC')
      .all(reportId) as FileRow[];
    return rows.map(mapRowToFile);
  },

  async findOriginalByReportId(reportId: string): Promise<FileRecord[]> {
    return getDb()
      .query<FileRow, [string]>(
        'SELECT * FROM files WHERE report_id = ? AND message_id IS NULL ORDER BY created_at, id'
      )
      .all(reportId)
      .map(mapRowToFile);
  },

  async findByReportMessages(reportId: string, visibleOnly = false): Promise<FileRecord[]> {
    return getDb()
      .query<FileRow, [string]>(
        `SELECT f.* FROM files f JOIN report_messages m ON m.id = f.message_id AND m.report_id = f.report_id
       WHERE f.report_id = ? ${visibleOnly ? 'AND m.hidden_at IS NULL' : ''} ORDER BY f.created_at, f.id`
      )
      .all(reportId)
      .map(mapRowToFile);
  },

  getSizeByReporterSince(reporterId: string, since: string): number {
    return (
      getDb()
        .query<{ total: number }, [string, string]>(
          'SELECT COALESCE(SUM(size_bytes), 0) AS total FROM files WHERE uploaded_by_reporter_id = ? AND julianday(created_at) >= julianday(?)'
        )
        .get(reporterId, since)?.total ?? 0
    );
  },

  async findByMessageId(messageId: string): Promise<FileRecord[]> {
    const rows = getDb()
      .query<FileRow, [string]>('SELECT * FROM files WHERE message_id = ? ORDER BY created_at, id')
      .all(messageId);
    return rows.map(mapRowToFile);
  },

  /**
   * Find files by type for a report
   */
  async findByReportIdAndType(reportId: string, type: FileType): Promise<FileRecord[]> {
    const db = getDb();
    const rows = db
      .query('SELECT * FROM files WHERE report_id = ? AND type = ? ORDER BY created_at ASC')
      .all(reportId, type) as FileRow[];
    return rows.map(mapRowToFile);
  },

  /**
   * Delete a file record
   */
  async delete(id: string): Promise<boolean> {
    const db = getDb();
    const result = db.run('DELETE FROM files WHERE id = ?', [id]);
    return result.changes > 0;
  },

  /**
   * Delete all files for a report
   */
  async deleteByReportId(reportId: string): Promise<number> {
    const db = getDb();
    const result = db.run('DELETE FROM files WHERE report_id = ?', [reportId]);
    return result.changes;
  },

  /**
   * Get total storage used (in bytes)
   */
  async getTotalSize(): Promise<number> {
    const db = getDb();
    const result = db.query('SELECT SUM(size_bytes) as total FROM files').get() as {
      total: number | null;
    };
    return result.total ?? 0;
  },

  /**
   * Get storage used by report
   */
  async getSizeByReportId(reportId: string): Promise<number> {
    const db = getDb();
    const result = db
      .query('SELECT SUM(size_bytes) as total FROM files WHERE report_id = ?')
      .get(reportId) as { total: number | null };
    return result.total ?? 0;
  },

  getVideoSizeByProjectSince(projectId: string, since: string): number {
    const result = getDb()
      .query(
        `SELECT SUM(files.size_bytes) AS total
         FROM files
         JOIN reports ON reports.id = files.report_id
         WHERE reports.project_id = ? AND files.type = 'video' AND julianday(files.created_at) >= julianday(?)`
      )
      .get(projectId, since) as { total: number | null };
    return result.total ?? 0;
  },

  /**
   * Get all files
   */
  async findAll(): Promise<FileRecord[]> {
    const db = getDb();
    const rows = db.query('SELECT * FROM files ORDER BY created_at DESC').all() as FileRow[];
    return rows.map(mapRowToFile);
  },

  /**
   * Update file path (for migration to S3)
   */
  async updatePath(id: string, newPath: string): Promise<boolean> {
    const db = getDb();
    const result = db.run('UPDATE files SET path = ? WHERE id = ?', [newPath, id]);
    return result.changes > 0;
  },

  /**
   * Count files by storage type
   */
  async countByStorageType(): Promise<{ local: number; s3: number }> {
    const db = getDb();
    const counts = db
      .query(
        `SELECT
      COALESCE(SUM(CASE WHEN path LIKE 's3://%' OR path LIKE 'https://%' OR path LIKE 'http://%' THEN 1 ELSE 0 END), 0) AS s3,
      COUNT(*) AS total FROM files`
      )
      .get() as { s3: number; total: number };
    const { s3 } = counts;
    const local = counts.total - s3;

    return { local, s3 };
  },
} satisfies IFilesRepository;
