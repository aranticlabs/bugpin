import { getDb } from '../database.js';
import { generateFileId } from '../../utils/id.js';
import type { CreateFileData } from './interfaces.js';
import type { FileRecord, FileType } from '@shared/types';

// Database Row Type

interface FileRow {
  id: string;
  report_id: string;
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
    const db = getDb();
    const id = generateFileId();
    const now = new Date().toISOString();

    db.run(
      `INSERT INTO files (id, report_id, type, filename, path, mime_type, size_bytes, width, height, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      ],
    );

    const file = await this.findById(id);
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
    const rows = db.query('SELECT path FROM files').all() as { path: string }[];

    let local = 0;
    let s3 = 0;

    for (const row of rows) {
      if (row.path.startsWith('s3://') || row.path.startsWith('https://')) {
        s3++;
      } else {
        local++;
      }
    }

    return { local, s3 };
  },
};
