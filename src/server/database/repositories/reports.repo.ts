import { getDb } from '../database.js';
import { generateReportId } from '../../utils/id.js';
import type { CreateReportData } from './interfaces.js';
import type {
  Report,
  ReportFilter,
  ReportStatus,
  ReportPriority,
  ReportMetadata,
  GitHubSyncStatus,
} from '@shared/types';

// Database Row Type

interface ReportRow {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: ReportStatus;
  priority: ReportPriority;
  annotations: string | null;
  metadata: string;
  reporter_email: string | null;
  reporter_name: string | null;
  assigned_to: string | null;
  custom_fields: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  closed_at: string | null;
  forwarded_to: string | null;
  // GitHub sync fields
  github_sync_status: GitHubSyncStatus | null;
  github_sync_error: string | null;
  github_issue_number: number | null;
  github_issue_url: string | null;
  github_synced_at: string | null;
}

// Row to Entity Mapping

function mapRowToReport(row: ReportRow & { project_name?: string }): Report {
  return {
    id: row.id,
    projectId: row.project_id,
    projectName: row.project_name ?? undefined,
    title: row.title,
    description: row.description ?? undefined,
    status: row.status,
    priority: row.priority,
    annotations: row.annotations ? JSON.parse(row.annotations) : undefined,
    metadata: JSON.parse(row.metadata) as ReportMetadata,
    reporterEmail: row.reporter_email ?? undefined,
    reporterName: row.reporter_name ?? undefined,
    assignedTo: row.assigned_to ?? undefined,
    customFields: row.custom_fields ? JSON.parse(row.custom_fields) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at ?? undefined,
    resolvedBy: row.resolved_by ?? undefined,
    closedAt: row.closed_at ?? undefined,
    forwardedTo: row.forwarded_to ? JSON.parse(row.forwarded_to) : undefined,
    // GitHub sync fields
    githubSyncStatus: row.github_sync_status ?? undefined,
    githubSyncError: row.github_sync_error ?? undefined,
    githubIssueNumber: row.github_issue_number ?? undefined,
    githubIssueUrl: row.github_issue_url ?? undefined,
    githubSyncedAt: row.github_synced_at ?? undefined,
  };
}

// Repository

export { CreateReportData };

export const reportsRepo = {
  /**
   * Create a new report
   * Note: reports_count is automatically updated via database trigger
   */
  async create(data: CreateReportData): Promise<Report> {
    const db = getDb();
    const id = generateReportId();
    const now = new Date().toISOString();

    db.run(
      `INSERT INTO reports (
        id, project_id, title, description, status, priority,
        annotations, metadata, reporter_email, reporter_name,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.projectId,
        data.title,
        data.description ?? null,
        'open',
        data.priority ?? 'medium',
        data.annotations ? JSON.stringify(data.annotations) : null,
        JSON.stringify(data.metadata),
        data.reporterEmail ?? null,
        data.reporterName ?? null,
        now,
        now,
      ],
    );

    const report = await this.findById(id);
    if (!report) {
      throw new Error('Failed to create report');
    }
    return report;
  },

  /**
   * Find a report by ID
   */
  async findById(id: string): Promise<Report | null> {
    const db = getDb();
    const row = db.query('SELECT * FROM reports WHERE id = ?').get(id) as ReportRow | null;
    return row ? mapRowToReport(row) : null;
  },

  /**
   * Find reports with filtering and pagination
   */
  async find(filter: ReportFilter): Promise<{ data: Report[]; total: number }> {
    const db = getDb();
    const params: (string | number)[] = [];
    const conditions: string[] = [];

    // Build WHERE clause
    if (filter.projectId) {
      conditions.push('project_id = ?');
      params.push(filter.projectId);
    }

    if (filter.status && filter.status.length > 0) {
      const placeholders = filter.status.map(() => '?').join(', ');
      conditions.push(`status IN (${placeholders})`);
      params.push(...filter.status);
    }

    if (filter.priority && filter.priority.length > 0) {
      const placeholders = filter.priority.map(() => '?').join(', ');
      conditions.push(`priority IN (${placeholders})`);
      params.push(...filter.priority);
    }

    if (filter.assignedTo) {
      conditions.push('assigned_to = ?');
      params.push(filter.assignedTo);
    }

    if (filter.createdAfter) {
      conditions.push('created_at >= ?');
      params.push(filter.createdAfter);
    }

    if (filter.createdBefore) {
      conditions.push('created_at <= ?');
      params.push(filter.createdBefore);
    }

    // Full-text search
    let searchJoin = '';
    if (filter.search) {
      searchJoin = 'INNER JOIN reports_fts ON reports.rowid = reports_fts.rowid';
      conditions.push('reports_fts MATCH ?');
      params.push(filter.search);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countQuery = `SELECT COUNT(*) as count FROM reports ${searchJoin} ${whereClause}`;
    const countResult = db.query(countQuery).get(...params) as { count: number };
    const total = countResult.count;

    // Sorting
    const sortBy = filter.sortBy || 'created_at';
    const sortOrder = filter.sortOrder === 'asc' ? 'ASC' : 'DESC';
    const validSortColumns = ['created_at', 'updated_at', 'title', 'status', 'priority'];
    const orderBy = validSortColumns.includes(sortBy) ? sortBy : 'created_at';

    // Pagination
    const page = Math.max(1, filter.page ?? 1);
    const limit = Math.min(100, Math.max(1, filter.limit ?? 20));
    const offset = (page - 1) * limit;

    // Get data
    const dataQuery = `
      SELECT reports.*, projects.name as project_name
      FROM reports
      LEFT JOIN projects ON reports.project_id = projects.id
      ${searchJoin}
      ${whereClause}
      ORDER BY ${orderBy} ${sortOrder}
      LIMIT ? OFFSET ?
    `;
    const rows = db.query(dataQuery).all(...params, limit, offset) as (ReportRow & {
      project_name: string;
    })[];

    return {
      data: rows.map(mapRowToReport),
      total,
    };
  },

  /**
   * Update a report
   */
  async update(id: string, updates: Partial<Report>): Promise<Report | null> {
    const db = getDb();
    const now = new Date().toISOString();
    const sets: string[] = ['updated_at = ?'];
    const params: (string | null)[] = [now];

    if (updates.title !== undefined) {
      sets.push('title = ?');
      params.push(updates.title);
    }

    if (updates.description !== undefined) {
      sets.push('description = ?');
      params.push(updates.description ?? null);
    }

    if (updates.status !== undefined) {
      sets.push('status = ?');
      params.push(updates.status);

      // Track status change timestamps
      if (updates.status === 'resolved') {
        sets.push('resolved_at = ?');
        params.push(now);
        if (updates.resolvedBy) {
          sets.push('resolved_by = ?');
          params.push(updates.resolvedBy);
        }
      } else if (updates.status === 'closed') {
        sets.push('closed_at = ?');
        params.push(now);
      } else if (updates.status === 'open' || updates.status === 'in_progress') {
        // Reopen - clear resolved/closed timestamps
        sets.push('resolved_at = NULL, resolved_by = NULL, closed_at = NULL');
      }
    }

    if (updates.priority !== undefined) {
      sets.push('priority = ?');
      params.push(updates.priority);
    }

    if (updates.assignedTo !== undefined) {
      sets.push('assigned_to = ?');
      params.push(updates.assignedTo ?? null);
    }

    if (updates.annotations !== undefined) {
      sets.push('annotations = ?');
      params.push(updates.annotations ? JSON.stringify(updates.annotations) : null);
    }

    if (updates.forwardedTo !== undefined) {
      sets.push('forwarded_to = ?');
      params.push(updates.forwardedTo ? JSON.stringify(updates.forwardedTo) : null);
    }

    params.push(id);

    db.run(`UPDATE reports SET ${sets.join(', ')} WHERE id = ?`, params);

    return this.findById(id);
  },

  /**
   * Delete a report
   * Note: reports_count is automatically updated via database trigger
   */
  async delete(id: string): Promise<boolean> {
    const db = getDb();
    const result = db.run('DELETE FROM reports WHERE id = ?', [id]);
    return result.changes > 0;
  },

  /**
   * Bulk update reports
   */
  async bulkUpdate(ids: string[], updates: Partial<Report>): Promise<number> {
    let count = 0;

    for (const id of ids) {
      const result = await this.update(id, updates);
      if (result) {
        count++;
      }
    }

    return count;
  },

  /**
   * Count reports for a project
   */
  async countByProject(projectId: string): Promise<number> {
    const db = getDb();
    const result = db
      .query('SELECT COUNT(*) as count FROM reports WHERE project_id = ?')
      .get(projectId) as { count: number };
    return result.count;
  },

  /**
   * Get report statistics
   */
  async getStats(projectId?: string): Promise<{
    total: number;
    byStatus: Record<ReportStatus, number>;
    byPriority: Record<ReportPriority, number>;
  }> {
    const db = getDb();
    const whereClause = projectId ? 'WHERE project_id = ?' : '';
    const params = projectId ? [projectId] : [];

    const total = (
      db.query(`SELECT COUNT(*) as count FROM reports ${whereClause}`).get(...params) as {
        count: number;
      }
    ).count;

    const statusRows = db
      .query(
        `
      SELECT status, COUNT(*) as count FROM reports ${whereClause} GROUP BY status
    `,
      )
      .all(...params) as { status: ReportStatus; count: number }[];

    const priorityRows = db
      .query(
        `
      SELECT priority, COUNT(*) as count FROM reports ${whereClause} GROUP BY priority
    `,
      )
      .all(...params) as { priority: ReportPriority; count: number }[];

    const byStatus: Record<ReportStatus, number> = {
      open: 0,
      in_progress: 0,
      resolved: 0,
      closed: 0,
    };
    for (const row of statusRows) {
      byStatus[row.status] = row.count;
    }

    const byPriority: Record<ReportPriority, number> = {
      lowest: 0,
      low: 0,
      medium: 0,
      high: 0,
      highest: 0,
    };
    for (const row of priorityRows) {
      byPriority[row.priority] = row.count;
    }

    return { total, byStatus, byPriority };
  },

  /**
   * Find report IDs older than a specified number of days
   */
  async findIdsOlderThan(days: number): Promise<string[]> {
    const db = getDb();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffIso = cutoffDate.toISOString();

    const rows = db.query('SELECT id FROM reports WHERE created_at < ?').all(cutoffIso) as {
      id: string;
    }[];

    return rows.map((row) => row.id);
  },

  /**
   * Update GitHub sync status for a report
   */
  async updateGitHubSyncStatus(
    id: string,
    data: {
      status: GitHubSyncStatus;
      error?: string | null;
      issueNumber?: number | null;
      issueUrl?: string | null;
    },
  ): Promise<Report | null> {
    const db = getDb();
    const now = new Date().toISOString();

    db.run(
      `UPDATE reports SET
        github_sync_status = ?,
        github_sync_error = ?,
        github_issue_number = COALESCE(?, github_issue_number),
        github_issue_url = COALESCE(?, github_issue_url),
        github_synced_at = CASE WHEN ? = 'synced' THEN ? ELSE github_synced_at END,
        updated_at = ?
      WHERE id = ?`,
      [
        data.status,
        data.error ?? null,
        data.issueNumber ?? null,
        data.issueUrl ?? null,
        data.status,
        now,
        now,
        id,
      ],
    );

    return this.findById(id);
  },

  /**
   * Find reports by GitHub sync status
   */
  async findByGitHubSyncStatus(status: GitHubSyncStatus, projectId?: string): Promise<Report[]> {
    const db = getDb();

    let query = 'SELECT * FROM reports WHERE github_sync_status = ?';
    const params: (string | GitHubSyncStatus)[] = [status];

    if (projectId) {
      query += ' AND project_id = ?';
      params.push(projectId);
    }

    const rows = db.query(query).all(...params) as ReportRow[];
    return rows.map(mapRowToReport);
  },

  /**
   * Find reports that need GitHub sync (no sync status yet)
   */
  async findUnsyncedByProject(projectId: string): Promise<Report[]> {
    const db = getDb();

    const rows = db
      .query('SELECT * FROM reports WHERE project_id = ? AND github_sync_status IS NULL')
      .all(projectId) as ReportRow[];

    return rows.map(mapRowToReport);
  },

  /**
   * Find reports with GitHub issue numbers for a project
   */
  async findSyncedByProject(projectId: string): Promise<Report[]> {
    const db = getDb();

    const rows = db
      .query(
        'SELECT * FROM reports WHERE project_id = ? AND github_issue_number IS NOT NULL ORDER BY created_at DESC',
      )
      .all(projectId) as ReportRow[];

    return rows.map(mapRowToReport);
  },

  /**
   * Find report by GitHub issue number
   */
  async findByGitHubIssueNumber(projectId: string, issueNumber: number): Promise<Report | null> {
    const db = getDb();

    const row = db
      .query('SELECT * FROM reports WHERE project_id = ? AND github_issue_number = ?')
      .get(projectId, issueNumber) as ReportRow | null;

    return row ? mapRowToReport(row) : null;
  },

  /**
   * Mark report as pending sync
   */
  async markPendingSync(id: string): Promise<void> {
    const db = getDb();
    db.run('UPDATE reports SET github_sync_status = ?, updated_at = ? WHERE id = ?', [
      'pending',
      new Date().toISOString(),
      id,
    ]);
  },

  /**
   * Clear GitHub sync status (for manual mode)
   */
  async clearGitHubSyncStatus(id: string): Promise<void> {
    const db = getDb();
    db.run(
      `UPDATE reports SET
        github_sync_status = NULL,
        github_sync_error = NULL,
        github_issue_number = NULL,
        github_issue_url = NULL,
        github_synced_at = NULL,
        updated_at = ?
      WHERE id = ?`,
      [new Date().toISOString(), id],
    );
  },
};
