import { getDb } from '../database.js';
import { generateId } from '../../utils/id.js';
import type { CreateIntegrationData } from './interfaces.js';
import type { Integration, IntegrationType, IntegrationConfig } from '@shared/types';

// Database Row Type

interface IntegrationRow {
  id: string;
  project_id: string;
  type: IntegrationType;
  name: string;
  config: string; // JSON
  is_active: number;
  last_used_at: string | null;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

// Row to Entity Mapping

function mapRowToIntegration(row: IntegrationRow): Integration {
  return {
    id: row.id,
    projectId: row.project_id,
    type: row.type,
    name: row.name,
    config: JSON.parse(row.config) as IntegrationConfig,
    isActive: row.is_active === 1,
    lastUsedAt: row.last_used_at ?? undefined,
    usageCount: row.usage_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Repository

export { CreateIntegrationData };

export const integrationsRepo = {
  /**
   * Create a new integration
   */
  async create(data: CreateIntegrationData): Promise<Integration> {
    const db = getDb();
    const id = generateId('int');
    const now = new Date().toISOString();

    db.run(
      `INSERT INTO integrations (id, project_id, type, name, config, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.projectId,
        data.type,
        data.name,
        JSON.stringify(data.config),
        data.isActive !== false ? 1 : 0,
        now,
        now,
      ],
    );

    const integration = await this.findById(id);
    if (!integration) {
      throw new Error('Failed to create integration');
    }
    return integration;
  },

  /**
   * Find an integration by ID
   */
  async findById(id: string): Promise<Integration | null> {
    const db = getDb();
    const row = db
      .query('SELECT * FROM integrations WHERE id = ?')
      .get(id) as IntegrationRow | null;
    return row ? mapRowToIntegration(row) : null;
  },

  /**
   * Find all integrations for a project
   */
  async findByProjectId(projectId: string): Promise<Integration[]> {
    const db = getDb();
    const rows = db
      .query('SELECT * FROM integrations WHERE project_id = ? ORDER BY created_at DESC')
      .all(projectId) as IntegrationRow[];
    return rows.map(mapRowToIntegration);
  },

  /**
   * Find integrations by project and type
   */
  async findByProjectAndType(projectId: string, type: IntegrationType): Promise<Integration[]> {
    const db = getDb();
    const rows = db
      .query(
        'SELECT * FROM integrations WHERE project_id = ? AND type = ? ORDER BY created_at DESC',
      )
      .all(projectId, type) as IntegrationRow[];
    return rows.map(mapRowToIntegration);
  },

  /**
   * Find active integrations for a project
   */
  async findActiveByProjectId(projectId: string): Promise<Integration[]> {
    const db = getDb();
    const rows = db
      .query(
        'SELECT * FROM integrations WHERE project_id = ? AND is_active = 1 ORDER BY created_at DESC',
      )
      .all(projectId) as IntegrationRow[];
    return rows.map(mapRowToIntegration);
  },

  /**
   * Update an integration
   */
  async update(
    id: string,
    updates: Partial<Pick<Integration, 'name' | 'config' | 'isActive'>>,
  ): Promise<Integration | null> {
    const db = getDb();
    const now = new Date().toISOString();
    const sets: string[] = ['updated_at = ?'];
    const params: (string | number)[] = [now];

    if (updates.name !== undefined) {
      sets.push('name = ?');
      params.push(updates.name);
    }

    if (updates.config !== undefined) {
      sets.push('config = ?');
      params.push(JSON.stringify(updates.config));
    }

    if (updates.isActive !== undefined) {
      sets.push('is_active = ?');
      params.push(updates.isActive ? 1 : 0);
    }

    params.push(id);

    db.run(`UPDATE integrations SET ${sets.join(', ')} WHERE id = ?`, params);

    return this.findById(id);
  },

  /**
   * Delete an integration
   */
  async delete(id: string): Promise<boolean> {
    const db = getDb();
    const result = db.run('DELETE FROM integrations WHERE id = ?', [id]);
    return result.changes > 0;
  },

  /**
   * Update last used timestamp and increment usage count
   */
  async updateLastUsed(id: string): Promise<void> {
    const db = getDb();
    const now = new Date().toISOString();

    db.run(
      'UPDATE integrations SET last_used_at = ?, usage_count = usage_count + 1, updated_at = ? WHERE id = ?',
      [now, now, id],
    );
  },

  /**
   * Count integrations for a project
   */
  async countByProject(projectId: string): Promise<number> {
    const db = getDb();
    const result = db
      .query('SELECT COUNT(*) as count FROM integrations WHERE project_id = ?')
      .get(projectId) as { count: number };
    return result.count;
  },
};
