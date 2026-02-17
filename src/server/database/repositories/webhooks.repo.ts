import { getDb } from '../database.js';
import { generateWebhookId } from '../../utils/id.js';
import type { CreateWebhookData } from './interfaces.js';
import type { Webhook, WebhookEvent } from '@shared/types';

// Database Row Type

interface WebhookRow {
  id: string;
  project_id: string;
  name: string;
  url: string;
  secret: string | null;
  events: string;
  is_active: number;
  last_triggered_at: string | null;
  last_status_code: number | null;
  failure_count: number;
  created_at: string;
  updated_at: string;
}

// Row to Entity Mapping

function mapRowToWebhook(row: WebhookRow): Webhook {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    url: row.url,
    secret: row.secret ?? undefined,
    events: JSON.parse(row.events) as WebhookEvent[],
    isActive: row.is_active === 1,
    lastTriggeredAt: row.last_triggered_at ?? undefined,
    lastStatusCode: row.last_status_code ?? undefined,
    failureCount: row.failure_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Repository

export { CreateWebhookData };

export const webhooksRepo = {
  /**
   * Create a new webhook
   */
  async create(data: CreateWebhookData): Promise<Webhook> {
    const db = getDb();
    const id = generateWebhookId();
    const now = new Date().toISOString();

    db.run(
      `INSERT INTO webhooks (id, project_id, name, url, secret, events, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.projectId,
        data.name,
        data.url,
        data.secret ?? null,
        JSON.stringify(data.events ?? ['report.created']),
        1,
        now,
        now,
      ],
    );

    const webhook = await this.findById(id);
    if (!webhook) {
      throw new Error('Failed to create webhook');
    }
    return webhook;
  },

  /**
   * Find a webhook by ID
   */
  async findById(id: string): Promise<Webhook | null> {
    const db = getDb();
    const row = db.query('SELECT * FROM webhooks WHERE id = ?').get(id) as WebhookRow | null;
    return row ? mapRowToWebhook(row) : null;
  },

  /**
   * Find all webhooks
   */
  async findAll(): Promise<Webhook[]> {
    const db = getDb();
    const rows = db.query('SELECT * FROM webhooks ORDER BY created_at DESC').all() as WebhookRow[];
    return rows.map(mapRowToWebhook);
  },

  /**
   * Find all webhooks for a project
   */
  async findByProjectId(projectId: string): Promise<Webhook[]> {
    const db = getDb();
    const rows = db
      .query('SELECT * FROM webhooks WHERE project_id = ? ORDER BY created_at DESC')
      .all(projectId) as WebhookRow[];
    return rows.map(mapRowToWebhook);
  },

  /**
   * Find active webhooks for a project that listen to a specific event
   */
  async findActiveByEvent(projectId: string, event: WebhookEvent): Promise<Webhook[]> {
    const db = getDb();
    // SQLite JSON query to check if event is in the events array
    const rows = db
      .query(
        `
      SELECT webhooks.*
      FROM webhooks, json_each(webhooks.events)
      WHERE project_id = ?
        AND is_active = 1
        AND json_each.value = ?
    `,
      )
      .all(projectId, event) as WebhookRow[];
    return rows.map(mapRowToWebhook);
  },

  /**
   * Find all active webhooks for a project
   */
  async findActiveByProjectId(projectId: string): Promise<Webhook[]> {
    const db = getDb();
    const rows = db
      .query('SELECT * FROM webhooks WHERE project_id = ? AND is_active = 1')
      .all(projectId) as WebhookRow[];
    return rows.map(mapRowToWebhook);
  },

  /**
   * Update a webhook
   */
  async update(
    id: string,
    updates: Partial<Pick<Webhook, 'name' | 'url' | 'secret' | 'events' | 'isActive'>>,
  ): Promise<Webhook | null> {
    const db = getDb();
    const now = new Date().toISOString();
    const sets: string[] = ['updated_at = ?'];
    const params: (string | number)[] = [now];

    if (updates.name !== undefined) {
      sets.push('name = ?');
      params.push(updates.name);
    }

    if (updates.url !== undefined) {
      sets.push('url = ?');
      params.push(updates.url);
    }

    if (updates.secret !== undefined) {
      sets.push('secret = ?');
      params.push(updates.secret ?? '');
    }

    if (updates.events !== undefined) {
      sets.push('events = ?');
      params.push(JSON.stringify(updates.events));
    }

    if (updates.isActive !== undefined) {
      sets.push('is_active = ?');
      params.push(updates.isActive ? 1 : 0);
    }

    params.push(id);

    db.run(`UPDATE webhooks SET ${sets.join(', ')} WHERE id = ?`, params);

    return this.findById(id);
  },

  /**
   * Record webhook trigger result
   */
  async recordTrigger(id: string, statusCode: number, success: boolean): Promise<void> {
    const db = getDb();
    const now = new Date().toISOString();

    if (success) {
      db.run(
        'UPDATE webhooks SET last_triggered_at = ?, last_status_code = ?, failure_count = 0 WHERE id = ?',
        [now, statusCode, id],
      );
    } else {
      db.run(
        'UPDATE webhooks SET last_triggered_at = ?, last_status_code = ?, failure_count = failure_count + 1 WHERE id = ?',
        [now, statusCode, id],
      );
    }
  },

  /**
   * Delete a webhook
   */
  async delete(id: string): Promise<boolean> {
    const db = getDb();
    const result = db.run('DELETE FROM webhooks WHERE id = ?', [id]);
    return result.changes > 0;
  },

  /**
   * Delete all webhooks for a project
   */
  async deleteByProjectId(projectId: string): Promise<number> {
    const db = getDb();
    const result = db.run('DELETE FROM webhooks WHERE project_id = ?', [projectId]);
    return result.changes;
  },
};
