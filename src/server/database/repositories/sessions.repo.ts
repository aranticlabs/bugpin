import { getDb } from '../database.js';
import { generateSessionId } from '../../utils/id.js';
import type { CreateSessionData } from './interfaces.js';
import type { Session } from '@shared/types';

// Database Row Type

interface SessionRow {
  id: string;
  user_id: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  expires_at: string;
  last_activity_at: string;
}

// Row to Entity Mapping

function mapRowToSession(row: SessionRow): Session {
  return {
    id: row.id,
    userId: row.user_id,
    ipAddress: row.ip_address ?? undefined,
    userAgent: row.user_agent ?? undefined,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    lastActivityAt: row.last_activity_at,
  };
}

// Repository

export { CreateSessionData };

export const sessionsRepo = {
  /**
   * Create a new session
   */
  async create(data: CreateSessionData): Promise<Session> {
    const db = getDb();
    const id = generateSessionId();
    const now = new Date().toISOString();

    db.run(
      `INSERT INTO sessions (id, user_id, ip_address, user_agent, created_at, expires_at, last_activity_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, data.userId, data.ipAddress ?? null, data.userAgent ?? null, now, data.expiresAt, now],
    );

    const session = await this.findById(id);
    if (!session) {
      throw new Error('Failed to create session');
    }
    return session;
  },

  /**
   * Find a session by ID
   */
  async findById(id: string): Promise<Session | null> {
    const db = getDb();
    const row = db.query('SELECT * FROM sessions WHERE id = ?').get(id) as SessionRow | null;
    return row ? mapRowToSession(row) : null;
  },

  /**
   * Find valid (non-expired) session by ID
   */
  async findValidById(id: string): Promise<Session | null> {
    const db = getDb();
    const now = new Date().toISOString();
    const row = db
      .query('SELECT * FROM sessions WHERE id = ? AND expires_at > ?')
      .get(id, now) as SessionRow | null;
    return row ? mapRowToSession(row) : null;
  },

  /**
   * Find all sessions for a user
   */
  async findByUserId(userId: string): Promise<Session[]> {
    const db = getDb();
    const rows = db
      .query('SELECT * FROM sessions WHERE user_id = ? ORDER BY created_at DESC')
      .all(userId) as SessionRow[];
    return rows.map(mapRowToSession);
  },

  /**
   * Update last activity timestamp
   */
  async updateActivity(id: string): Promise<void> {
    const db = getDb();
    const now = new Date().toISOString();
    db.run('UPDATE sessions SET last_activity_at = ? WHERE id = ?', [now, id]);
  },

  /**
   * Delete a session
   */
  async delete(id: string): Promise<boolean> {
    const db = getDb();
    const result = db.run('DELETE FROM sessions WHERE id = ?', [id]);
    return result.changes > 0;
  },

  /**
   * Delete all sessions for a user
   */
  async deleteByUserId(userId: string): Promise<number> {
    const db = getDb();
    const result = db.run('DELETE FROM sessions WHERE user_id = ?', [userId]);
    return result.changes;
  },

  /**
   * Delete expired sessions
   */
  async deleteExpired(): Promise<number> {
    const db = getDb();
    const now = new Date().toISOString();
    const result = db.run('DELETE FROM sessions WHERE expires_at < ?', [now]);
    return result.changes;
  },

  /**
   * Extend session expiration
   */
  async extend(id: string, newExpiresAt: string): Promise<boolean> {
    const db = getDb();
    const result = db.run('UPDATE sessions SET expires_at = ? WHERE id = ?', [newExpiresAt, id]);
    return result.changes > 0;
  },
};
