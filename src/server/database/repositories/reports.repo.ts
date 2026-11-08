import { getDb, transaction } from '../database.js';
import { generateReportId } from '../../utils/id.js';
import type { CreateReportData } from './interfaces.js';
import type {
  Report,
  ReportSource,
  ReportAssignee,
  ReportBoardScope,
  ReportFilter,
  ReportStatus,
  ReportPriority,
  ReportMetadata,
  GitHubSyncStatus,
  LocaleCode,
} from '@shared/types';
import { normalizeLocale } from '../../utils/locale.js';
import { UNASSIGNED_FILTER, type ReportSortKey } from '@shared/types';

interface SortTerm {
  expression: string;
  direction: 'ASC' | 'DESC';
  caseInsensitive?: boolean;
}

// Parentheses keep comparisons such as `(name IS NULL) > ?` from parsing as `name IS (NULL > ?)`.
function sortExpression(term: SortTerm): string {
  return term.caseInsensitive ? `(${term.expression}) COLLATE NOCASE` : `(${term.expression})`;
}

// Status follows the workflow, and priority ranks lowest to highest, so descending puts
// the most urgent first. Missing projects and unassigned reports always sort last. Every sort
// ends with the same tie-breakers, so the order is total and cursors can resume it.
function reportSortTerms(key: ReportSortKey, direction: 'ASC' | 'DESC'): SortTerm[] {
  const primary: SortTerm[] = (() => {
    switch (key) {
      case 'createdAt':
        return [{ expression: 'reports.created_at', direction }];
      case 'updatedAt':
        return [{ expression: 'reports.updated_at', direction }];
      case 'title':
        return [{ expression: 'reports.title', direction, caseInsensitive: true }];
      case 'project':
        return [
          { expression: 'projects.name IS NULL', direction: 'ASC' },
          { expression: "COALESCE(projects.name, '')", direction, caseInsensitive: true },
        ];
      case 'status':
        return [
          {
            expression: `CASE reports.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'resolved' THEN 2 ELSE 3 END`,
            direction,
          },
        ];
      case 'priority':
        return [
          {
            expression: `CASE reports.priority WHEN 'lowest' THEN 0 WHEN 'low' THEN 1 WHEN 'medium' THEN 2 WHEN 'high' THEN 3 ELSE 4 END`,
            direction,
          },
        ];
      case 'assignee':
        return [
          { expression: 'users.name IS NULL', direction: 'ASC' },
          { expression: "COALESCE(users.name, '')", direction, caseInsensitive: true },
        ];
      case 'position':
        return [{ expression: 'reports.board_position', direction }];
    }
  })();
  return [
    ...primary,
    { expression: 'reports.created_at', direction: 'DESC' },
    { expression: 'reports.id', direction: 'ASC' },
  ];
}

function orderByClause(terms: SortTerm[]): string {
  return terms.map((term) => `${sortExpression(term)} ${term.direction}`).join(', ');
}

type SortValue = string | number;

// Rows after a cursor: the first term that differs decides, as in a lexicographic comparison.
function afterCursorCondition(
  terms: SortTerm[],
  values: SortValue[]
): { sql: string; params: SortValue[] } {
  const clauses: string[] = [];
  const params: SortValue[] = [];
  terms.forEach((term, index) => {
    const parts = terms.slice(0, index).map((earlier) => `${sortExpression(earlier)} = ?`);
    parts.push(`${sortExpression(term)} ${term.direction === 'ASC' ? '>' : '<'} ?`);
    clauses.push(`(${parts.join(' AND ')})`);
    params.push(...values.slice(0, index + 1));
  });
  return { sql: `(${clauses.join(' OR ')})`, params };
}

interface ReportCursor {
  sortBy: ReportSortKey;
  sortOrder: 'asc' | 'desc';
  values: SortValue[];
}

/** Thrown when a list cursor is malformed or belongs to a different sort */
export class InvalidReportCursorError extends Error {
  constructor() {
    super('Invalid cursor');
    this.name = 'InvalidReportCursorError';
  }
}

function encodeCursor(cursor: ReportCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function decodeCursor(
  value: string,
  sortBy: ReportSortKey,
  sortOrder: 'asc' | 'desc',
  termCount: number
): SortValue[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    throw new InvalidReportCursorError();
  }
  if (typeof parsed !== 'object' || parsed === null) throw new InvalidReportCursorError();
  const cursor = parsed as Partial<ReportCursor>;
  const values = cursor.values;
  if (
    cursor.sortBy !== sortBy ||
    cursor.sortOrder !== sortOrder ||
    !Array.isArray(values) ||
    values.length !== termCount ||
    !values.every((item) => typeof item === 'string' || typeof item === 'number')
  ) {
    throw new InvalidReportCursorError();
  }
  return values;
}

type ReportConditionFilter = Pick<
  ReportFilter,
  | 'projectId'
  | 'source'
  | 'status'
  | 'priority'
  | 'assignedTo'
  | 'search'
  | 'createdAfter'
  | 'createdBefore'
>;

/** WHERE conditions and the full-text join for a report filter */
function reportConditions(filter: ReportConditionFilter): {
  join: string;
  conditions: string[];
  params: SortValue[];
} {
  const conditions: string[] = [];
  const params: SortValue[] = [];

  if (filter.projectId) {
    conditions.push('reports.project_id = ?');
    params.push(filter.projectId);
  }

  if (filter.source) {
    conditions.push('reports.source = ?');
    params.push(filter.source);
  }

  if (filter.status && filter.status.length > 0) {
    conditions.push(`reports.status IN (${filter.status.map(() => '?').join(', ')})`);
    params.push(...filter.status);
  }

  if (filter.priority && filter.priority.length > 0) {
    conditions.push(`reports.priority IN (${filter.priority.map(() => '?').join(', ')})`);
    params.push(...filter.priority);
  }

  if (filter.assignedTo === UNASSIGNED_FILTER) {
    conditions.push('reports.assigned_to IS NULL');
  } else if (filter.assignedTo) {
    conditions.push('reports.assigned_to = ?');
    params.push(filter.assignedTo);
  }

  if (filter.createdAfter) {
    conditions.push('reports.created_at >= ?');
    params.push(filter.createdAfter);
  }

  if (filter.createdBefore) {
    conditions.push('reports.created_at <= ?');
    params.push(filter.createdBefore);
  }

  let join = '';
  if (filter.search) {
    join = 'INNER JOIN reports_fts ON reports.rowid = reports_fts.rowid';
    conditions.push('reports_fts MATCH ?');
    params.push(filter.search);
  }

  return { join, conditions, params };
}

function whereClause(conditions: string[]): string {
  return conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
}

// Reports that were not placed by hand go to the top of their board column.
const TOP_OF_COLUMN = `(SELECT COALESCE(MIN(board_position), 0) - 1 FROM reports WHERE status = ?)`;

// Database Row Type

interface ReportRow {
  id: string;
  project_id: string;
  source: ReportSource;
  title: string;
  description: string | null;
  status: ReportStatus;
  priority: ReportPriority;
  annotations: string | null;
  metadata: string;
  reporter_email: string | null;
  reporter_name: string | null;
  reporter_locale: string;
  reporter_id: string | null;
  claimable_email: string | null;
  original_description: string | null;
  original_description_backfilled: number;
  owner_seen_at: string | null;
  last_reporter_activity_at: string | null;
  reporter_activity_seen_at: string | null;
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
  assignee_id?: string | null;
  assignee_name?: string | null;
  assignee_email?: string | null;
  assignee_avatar_url?: string | null;
}

// Row to Entity Mapping

function mapRowLocale(value: string | null | undefined): LocaleCode {
  return normalizeLocale(value) ?? 'en';
}

function mapRowToReport(row: ReportRow & { project_name?: string }): Report {
  const assignee: ReportAssignee | undefined = row.assignee_id
    ? {
        id: row.assignee_id,
        name: row.assignee_name ?? row.assignee_email ?? row.assignee_id,
        email: row.assignee_email ?? '',
        avatarUrl: row.assignee_avatar_url ?? undefined,
      }
    : undefined;

  return {
    id: row.id,
    projectId: row.project_id,
    projectName: row.project_name ?? undefined,
    source: row.source ?? 'widget',
    title: row.title,
    description: row.description ?? undefined,
    status: row.status,
    priority: row.priority,
    annotations: row.annotations ? JSON.parse(row.annotations) : undefined,
    metadata: JSON.parse(row.metadata) as ReportMetadata,
    reporterEmail: row.reporter_email ?? undefined,
    reporterName: row.reporter_name ?? undefined,
    reporterLocale: mapRowLocale(row.reporter_locale),
    reporterId: row.reporter_id ?? undefined,
    claimableEmail: row.claimable_email ?? undefined,
    originalDescription: row.original_description ?? undefined,
    originalDescriptionBackfilled: row.original_description_backfilled === 1,
    ownerSeenAt: row.owner_seen_at ?? undefined,
    lastReporterActivityAt: row.last_reporter_activity_at ?? undefined,
    reporterActivitySeenAt: row.reporter_activity_seen_at ?? undefined,
    assignedTo: row.assigned_to ?? undefined,
    assignee,
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
    const status: ReportStatus = 'open';

    db.run(
      `INSERT INTO reports (
        id, project_id, source, title, description, status, priority,
        annotations, metadata, reporter_email, reporter_name, reporter_locale, assigned_to,
        submission_id, created_at, updated_at, original_description, claimable_email, board_position
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${TOP_OF_COLUMN})`,
      [
        id,
        data.projectId,
        data.source ?? 'widget',
        data.title,
        data.description ?? null,
        status,
        data.priority ?? 'medium',
        data.annotations ? JSON.stringify(data.annotations) : null,
        JSON.stringify(data.metadata),
        data.reporterEmail ?? null,
        data.reporterName ?? null,
        data.reporterLocale ?? 'en',
        data.assignedTo ?? null,
        data.submissionId ?? null,
        now,
        now,
        data.description ?? null,
        data.claimableEmail ?? null,
        status,
      ]
    );

    const report = await this.findById(id);
    if (!report) {
      throw new Error('Failed to create report');
    }
    return report;
  },

  /** The report a widget submission created, used to answer retries of the same submission */
  findIdBySubmission(projectId: string, submissionId: string): string | null {
    const row = getDb()
      .query('SELECT id FROM reports WHERE project_id = ? AND submission_id = ?')
      .get(projectId, submissionId) as { id: string } | null;
    return row?.id ?? null;
  },

  /**
   * Find a report by ID
   */
  async findById(id: string): Promise<Report | null> {
    const db = getDb();
    const row = db
      .query(
        `SELECT reports.*,
                users.id as assignee_id,
                users.name as assignee_name,
                users.email as assignee_email,
                users.avatar_url as assignee_avatar_url
         FROM reports
         LEFT JOIN users ON users.id = reports.assigned_to
         WHERE reports.id = ?`
      )
      .get(id) as ReportRow | null;
    return row ? mapRowToReport(row) : null;
  },

  /**
   * Find reports with filtering and pagination. A cursor (`after`) resumes after the last report
   * of an earlier page, so pages stay consistent while reports move between requests.
   */
  async find(
    filter: ReportFilter
  ): Promise<{ data: Report[]; total: number; nextCursor: string | null }> {
    const db = getDb();
    const { join, conditions, params } = reportConditions(filter);

    const countQuery = `SELECT COUNT(*) as count FROM reports ${join} ${whereClause(conditions)}`;
    const countResult = db.query(countQuery).get(...params) as { count: number };
    const total = countResult.count;

    const sortBy = filter.sortBy ?? 'createdAt';
    const sortOrder = filter.sortOrder === 'asc' ? 'asc' : 'desc';
    const terms = reportSortTerms(sortBy, sortOrder === 'asc' ? 'ASC' : 'DESC');

    const pageConditions = [...conditions];
    const pageParams = [...params];
    if (filter.after) {
      const after = afterCursorCondition(
        terms,
        decodeCursor(filter.after, sortBy, sortOrder, terms.length)
      );
      pageConditions.push(after.sql);
      pageParams.push(...after.params);
    }

    const limit = Math.min(100, Math.max(1, filter.limit ?? 20));
    const offset = filter.after ? 0 : (Math.max(1, filter.page ?? 1) - 1) * limit;
    const sortKeyColumns = terms
      .map((term, index) => `${term.expression} AS sort_key_${index}`)
      .join(', ');

    // One extra row tells whether another page follows.
    const dataQuery = `
      SELECT reports.*,
             projects.name as project_name,
             users.id as assignee_id,
             users.name as assignee_name,
             users.email as assignee_email,
             users.avatar_url as assignee_avatar_url,
             ${sortKeyColumns}
      FROM reports
      LEFT JOIN projects ON reports.project_id = projects.id
      LEFT JOIN users ON users.id = reports.assigned_to
      ${join}
      ${whereClause(pageConditions)}
      ORDER BY ${orderByClause(terms)}
      LIMIT ? OFFSET ?
    `;
    const rows = db.query(dataQuery).all(...pageParams, limit + 1, offset) as (ReportRow & {
      project_name: string;
      [sortKey: `sort_key_${number}`]: SortValue;
    })[];

    const pageRows = rows.slice(0, limit);
    const last = pageRows.at(-1);
    const nextCursor =
      rows.length > limit && last
        ? encodeCursor({
            sortBy,
            sortOrder,
            values: terms.map((_, index) => last[`sort_key_${index}`]),
          })
        : null;

    return {
      data: pageRows.map(mapRowToReport),
      total,
      nextCursor,
    };
  },

  /**
   * Update a report
   */
  async update(id: string, updates: Partial<Report>): Promise<Report | null> {
    this.applyUpdate(id, updates);
    return this.findById(id);
  },

  /** Writes report changes without reading the report back, so it can run inside a transaction */
  applyUpdate(id: string, updates: Partial<Report>): void {
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
      // SET expressions read the row as it was, so `status` here is the previous status.
      sets.push(
        `board_position = CASE WHEN status = ? THEN board_position ELSE ${TOP_OF_COLUMN} END`
      );
      params.push(updates.status, updates.status);
      sets.push('status = ?');
      params.push(updates.status);

      // Status timestamps and the resolver change only on an actual transition, so saving an
      // already resolved or closed report again keeps who resolved it and when.
      if (updates.status === 'resolved') {
        sets.push(`resolved_at = CASE WHEN status = 'resolved' THEN resolved_at ELSE ? END`);
        params.push(now);
        if (updates.resolvedBy) {
          sets.push(`resolved_by = CASE WHEN status = 'resolved' THEN resolved_by ELSE ? END`);
          params.push(updates.resolvedBy);
        }
      } else if (updates.status === 'closed') {
        sets.push(`closed_at = CASE WHEN status = 'closed' THEN closed_at ELSE ? END`);
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

    if (Object.prototype.hasOwnProperty.call(updates, 'assignedTo')) {
      sets.push('assigned_to = ?');
      params.push((updates as { assignedTo?: string | null }).assignedTo ?? null);
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
  },

  /** Board column and position of each given report that exists */
  boardPlacements(ids: string[]): Map<string, { status: ReportStatus; position: number }> {
    if (ids.length === 0) return new Map();
    const rows = getDb()
      .query(
        `SELECT id, status, board_position FROM reports WHERE id IN (${ids.map(() => '?').join(', ')})`
      )
      .all(...ids) as { id: string; status: ReportStatus; board_position: number }[];
    return new Map(
      rows.map((row) => [row.id, { status: row.status, position: row.board_position }])
    );
  },

  /**
   * Position of the nearest other report in a column after or before a position, or of the
   * column's first or last report
   */
  adjacentBoardPosition(
    status: ReportStatus,
    excludeId: string,
    bound: { after: number } | { before: number } | 'first' | 'last'
  ): number | undefined {
    const [condition, order, params]: [string, 'ASC' | 'DESC', number[]] =
      bound === 'first'
        ? ['', 'ASC', []]
        : bound === 'last'
          ? ['', 'DESC', []]
          : 'after' in bound
            ? ['AND board_position > ?', 'ASC', [bound.after]]
            : ['AND board_position < ?', 'DESC', [bound.before]];
    const row = getDb()
      .query(
        `SELECT board_position FROM reports WHERE status = ? AND id != ? ${condition}
         ORDER BY board_position ${order} LIMIT 1`
      )
      .get(status, excludeId, ...params) as { board_position: number } | null;
    return row?.board_position;
  },

  setBoardPosition(id: string, position: number): void {
    getDb().run('UPDATE reports SET board_position = ? WHERE id = ?', [position, id]);
  },

  /** Rewrites a column's positions as 0, 1, 2, ... in their current order */
  renumberBoardColumn(status: ReportStatus): void {
    getDb().run(
      `UPDATE reports
       SET board_position = ranked.position
       FROM (
         SELECT id, ROW_NUMBER() OVER (ORDER BY board_position, created_at DESC, id) - 1 AS position
         FROM reports
         WHERE status = ?
       ) AS ranked
       WHERE reports.id = ranked.id AND reports.board_position <> ranked.position`,
      [status]
    );
  },

  /**
   * Makes the given sort the hand-made order of the reports in a scope. The scoped reports of
   * each column trade places among the positions they already hold, so reports outside the
   * scope keep their positions and their order relative to each other.
   */
  adoptBoardOrder(sortBy: ReportSortKey, sortOrder: 'asc' | 'desc', scope: ReportBoardScope): void {
    const { join, conditions, params } = reportConditions(scope);
    const orderBy = orderByClause(reportSortTerms(sortBy, sortOrder === 'asc' ? 'ASC' : 'DESC'));
    getDb().run(
      `WITH scoped AS (
         SELECT reports.id AS id,
                reports.status AS status,
                reports.board_position AS board_position,
                ROW_NUMBER() OVER (PARTITION BY reports.status ORDER BY ${orderBy}) AS sorted_rank,
                ROW_NUMBER() OVER (
                  PARTITION BY reports.status
                  ORDER BY reports.board_position, reports.created_at DESC, reports.id
                ) AS slot_rank
         FROM reports
         LEFT JOIN projects ON reports.project_id = projects.id
         LEFT JOIN users ON users.id = reports.assigned_to
         ${join}
         ${whereClause(conditions)}
       ),
       placed AS (
         SELECT sorted.id AS id, slot.board_position AS position
         FROM scoped AS sorted
         JOIN scoped AS slot ON slot.status = sorted.status AND slot.slot_rank = sorted.sorted_rank
       )
       UPDATE reports
       SET board_position = placed.position
       FROM placed
       WHERE reports.id = placed.id AND reports.board_position <> placed.position`,
      params
    );
  },

  /** Runs synchronous repository writes as one transaction that rolls back when `work` throws */
  transaction<T>(work: () => T): T {
    return transaction(work);
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

  async countPerProject(statuses: ReportStatus[]): Promise<Record<string, number>> {
    const placeholders = statuses.map(() => '?').join(', ');
    const rows = getDb()
      .query(
        `SELECT project_id, COUNT(*) as count FROM reports WHERE status IN (${placeholders}) GROUP BY project_id`
      )
      .all(...statuses) as { project_id: string; count: number }[];
    return Object.fromEntries(rows.map((row) => [row.project_id, row.count]));
  },

  async latestCreatedAtPerProject(): Promise<Record<string, string>> {
    const rows = getDb()
      .query('SELECT project_id, MAX(created_at) as latest FROM reports GROUP BY project_id')
      .all() as { project_id: string; latest: string }[];
    return Object.fromEntries(rows.map((row) => [row.project_id, row.latest]));
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
    `
      )
      .all(...params) as { status: ReportStatus; count: number }[];

    const priorityRows = db
      .query(
        `
      SELECT priority, COUNT(*) as count FROM reports ${whereClause} GROUP BY priority
    `
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
   * Find the IDs of every report
   */
  async findAllIds(): Promise<string[]> {
    const db = getDb();
    const rows = db.query('SELECT id FROM reports').all() as { id: string }[];
    return rows.map((row) => row.id);
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
    }
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
      ]
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
        'SELECT * FROM reports WHERE project_id = ? AND github_issue_number IS NOT NULL ORDER BY created_at DESC'
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

  markPendingSyncBatch(ids: string[]): void {
    const db = getDb();
    const update = db.query(
      'UPDATE reports SET github_sync_status = ?, updated_at = ? WHERE id = ? RETURNING id'
    );
    const now = new Date().toISOString();
    db.transaction(() => {
      for (const id of ids) {
        if (!update.get('pending', now, id)) {
          throw new Error('Report no longer exists');
        }
      }
    })();
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
      [new Date().toISOString(), id]
    );
  },
};
