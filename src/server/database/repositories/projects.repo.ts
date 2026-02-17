import { getDb } from '../database.js';
import { generateId, generateApiKey } from '../../utils/id.js';
import { hashApiKey, extractApiKeyPrefix } from '../../utils/crypto.js';
import type { CreateProjectData } from './interfaces.js';
import type { Project, ProjectSettings } from '@shared/types';

// Database Row Type

interface ProjectRow {
  id: string;
  name: string;
  api_key_hash: string;
  api_key_prefix: string;
  settings: string;
  reports_count: number;
  is_active: number;
  position: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// Row to Entity Mapping

function mapRowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    apiKey: row.api_key_prefix, // Only return the prefix, not the full key
    settings: JSON.parse(row.settings) as ProjectSettings,
    reportsCount: row.reports_count,
    isActive: row.is_active === 1,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? undefined,
  };
}

// Repository

export { CreateProjectData };

export const projectsRepo = {
  /**
   * Create a new project
   * New projects are inserted at position 0 (top of the list)
   * Returns the project with the full API key (only time it's available)
   */
  async create(data: CreateProjectData): Promise<{ project: Project; apiKey: string }> {
    const db = getDb();
    const id = generateId('proj');
    const apiKey = generateApiKey();
    const apiKeyHash = hashApiKey(apiKey);
    const apiKeyPrefix = extractApiKeyPrefix(apiKey);
    const now = new Date().toISOString();

    // Shift all existing projects down by 1 position
    db.run('UPDATE projects SET position = position + 1, updated_at = ? WHERE deleted_at IS NULL', [
      now,
    ]);

    // Insert new project at position 0 with hashed API key
    db.run(
      `INSERT INTO projects (id, name, api_key_hash, api_key_prefix, settings, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
      [id, data.name, apiKeyHash, apiKeyPrefix, JSON.stringify(data.settings ?? {}), now, now],
    );

    const project = await this.findById(id);
    if (!project) {
      throw new Error('Failed to create project');
    }
    // Return both project and the full API key (only time it's available)
    return { project, apiKey };
  },

  /**
   * Find a project by ID
   */
  async findById(id: string): Promise<Project | null> {
    const db = getDb();
    const row = db
      .query('SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL')
      .get(id) as ProjectRow | null;
    return row ? mapRowToProject(row) : null;
  },

  /**
   * Find a project by API key
   * The incoming key is hashed and compared against stored hashes
   */
  async findByApiKey(apiKey: string): Promise<Project | null> {
    const db = getDb();
    const apiKeyHash = hashApiKey(apiKey);
    const row = db
      .query('SELECT * FROM projects WHERE api_key_hash = ? AND deleted_at IS NULL')
      .get(apiKeyHash) as ProjectRow | null;
    return row ? mapRowToProject(row) : null;
  },

  /**
   * Find all projects
   */
  async findAll(includeDeleted = false): Promise<Project[]> {
    const db = getDb();
    const whereClause = includeDeleted ? '' : 'WHERE deleted_at IS NULL';
    const rows = db
      .query(`SELECT * FROM projects ${whereClause} ORDER BY position ASC`)
      .all() as ProjectRow[];
    return rows.map(mapRowToProject);
  },

  /**
   * Update a project
   */
  async update(
    id: string,
    updates: Partial<Pick<Project, 'name' | 'settings' | 'isActive'>>,
  ): Promise<Project | null> {
    const db = getDb();
    const now = new Date().toISOString();
    const sets: string[] = ['updated_at = ?'];
    const params: (string | number | null)[] = [now];

    if (updates.name !== undefined) {
      sets.push('name = ?');
      params.push(updates.name);
    }

    if (updates.settings !== undefined) {
      sets.push('settings = ?');
      params.push(JSON.stringify(updates.settings));
    }

    if (updates.isActive !== undefined) {
      sets.push('is_active = ?');
      params.push(updates.isActive ? 1 : 0);
    }

    params.push(id);

    db.run(`UPDATE projects SET ${sets.join(', ')} WHERE id = ? AND deleted_at IS NULL`, params);

    return this.findById(id);
  },

  /**
   * Soft delete a project
   */
  async delete(id: string): Promise<boolean> {
    const db = getDb();
    const now = new Date().toISOString();
    const result = db.run(
      'UPDATE projects SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL',
      [now, id],
    );
    return result.changes > 0;
  },

  /**
   * Regenerate API key for a project
   * Returns the full new API key (only time it's available)
   */
  async regenerateApiKey(id: string): Promise<string | null> {
    const db = getDb();
    const newApiKey = generateApiKey();
    const apiKeyHash = hashApiKey(newApiKey);
    const apiKeyPrefix = extractApiKeyPrefix(newApiKey);
    const now = new Date().toISOString();

    const result = db.run(
      'UPDATE projects SET api_key_hash = ?, api_key_prefix = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
      [apiKeyHash, apiKeyPrefix, now, id],
    );

    if (result.changes > 0) {
      return newApiKey;
    }
    return null;
  },

  /**
   * Count all projects
   */
  async count(): Promise<number> {
    const db = getDb();
    const result = db
      .query('SELECT COUNT(*) as count FROM projects WHERE deleted_at IS NULL')
      .get() as { count: number };
    return result.count;
  },

  /**
   * Reorder projects based on array of IDs
   * Position is assigned based on index in the array (0, 1, 2, ...)
   */
  async reorder(projectIds: string[]): Promise<void> {
    const db = getDb();
    const now = new Date().toISOString();

    // Update positions in a transaction-like manner using a prepared statement
    const stmt = db.prepare(
      'UPDATE projects SET position = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
    );

    for (let i = 0; i < projectIds.length; i++) {
      stmt.run(i, now, projectIds[i]);
    }
  },

  /**
   * Check if all project IDs exist
   */
  async existsAll(projectIds: string[]): Promise<boolean> {
    const db = getDb();
    const placeholders = projectIds.map(() => '?').join(', ');
    const result = db
      .query(
        `SELECT COUNT(*) as count FROM projects WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
      )
      .get(...projectIds) as { count: number };
    return result.count === projectIds.length;
  },
};
