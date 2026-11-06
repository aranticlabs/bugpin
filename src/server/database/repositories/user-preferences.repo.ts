import { getDb } from '../database.js';
import type { IUserPreferencesRepository } from './interfaces.js';
import type { UserPreferences } from '@shared/types';

export const userPreferencesRepo: IUserPreferencesRepository = {
  async get(userId) {
    const row = getDb()
      .query('SELECT preferences FROM user_preferences WHERE user_id = ?')
      .get(userId) as { preferences: string } | null;
    if (!row) return {};
    try {
      return JSON.parse(row.preferences) as UserPreferences;
    } catch {
      return {};
    }
  },

  async save(userId, preferences) {
    getDb().run(
      `INSERT INTO user_preferences (user_id, preferences, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         preferences = excluded.preferences,
         updated_at = excluded.updated_at`,
      [userId, JSON.stringify(preferences), new Date().toISOString()]
    );
  },

  async listGamificationOptOuts() {
    const rows = getDb()
      .query(
        `SELECT user_id FROM user_preferences
         WHERE json_valid(preferences) AND json_extract(preferences, '$.gamificationOptedOut') = 1`
      )
      .all() as { user_id: string }[];
    return new Set(rows.map((row) => row.user_id));
  },
};
