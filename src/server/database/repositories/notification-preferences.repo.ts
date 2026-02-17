import { randomUUID } from 'crypto';
import { getDb } from '../database.js';
import type { NotificationPreferences, ProjectNotificationDefaults } from '@shared/types';

// Database Row Types

interface NotificationPreferencesRow {
  id: string;
  user_id: string;
  project_id: string;
  notify_on_new_report: number;
  notify_on_status_change: number;
  notify_on_priority_change: number;
  notify_on_assignment: number;
  email_enabled: number;
  created_at: string;
  updated_at: string;
}

interface ProjectNotificationDefaultsRow {
  id: string;
  project_id: string;
  default_notify_on_new_report: number;
  default_notify_on_status_change: number;
  default_notify_on_priority_change: number;
  default_notify_on_assignment: number;
  default_email_enabled: number;
  created_at: string;
  updated_at: string;
}

// Row Mapping

function mapRowToPreferences(row: NotificationPreferencesRow): NotificationPreferences {
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    notifyOnNewReport: Boolean(row.notify_on_new_report),
    notifyOnStatusChange: Boolean(row.notify_on_status_change),
    notifyOnPriorityChange: Boolean(row.notify_on_priority_change),
    notifyOnAssignment: Boolean(row.notify_on_assignment),
    emailEnabled: Boolean(row.email_enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRowToDefaults(row: ProjectNotificationDefaultsRow): ProjectNotificationDefaults {
  return {
    id: row.id,
    projectId: row.project_id,
    defaultNotifyOnNewReport: Boolean(row.default_notify_on_new_report),
    defaultNotifyOnStatusChange: Boolean(row.default_notify_on_status_change),
    defaultNotifyOnPriorityChange: Boolean(row.default_notify_on_priority_change),
    defaultNotifyOnAssignment: Boolean(row.default_notify_on_assignment),
    defaultEmailEnabled: Boolean(row.default_email_enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Repository

export const notificationPreferencesRepo = {
  /**
   * Get user's preferences for a specific project
   */
  async findByUserAndProject(
    userId: string,
    projectId: string,
  ): Promise<NotificationPreferences | null> {
    const db = getDb();
    const row = db
      .query('SELECT * FROM notification_preferences WHERE user_id = ? AND project_id = ?')
      .get(userId, projectId) as NotificationPreferencesRow | null;

    return row ? mapRowToPreferences(row) : null;
  },

  /**
   * Get all preferences for a user (across all projects)
   */
  async findByUser(userId: string): Promise<NotificationPreferences[]> {
    const db = getDb();
    const rows = db
      .query('SELECT * FROM notification_preferences WHERE user_id = ? ORDER BY created_at DESC')
      .all(userId) as NotificationPreferencesRow[];

    return rows.map(mapRowToPreferences);
  },

  /**
   * Get all users who should be notified for a project
   */
  async findByProjectWithEmailEnabled(projectId: string): Promise<NotificationPreferences[]> {
    const db = getDb();
    const rows = db
      .query('SELECT * FROM notification_preferences WHERE project_id = ? AND email_enabled = 1')
      .all(projectId) as NotificationPreferencesRow[];

    return rows.map(mapRowToPreferences);
  },

  /**
   * Create or update notification preferences
   */
  async upsert(
    userId: string,
    projectId: string,
    preferences: Partial<
      Omit<NotificationPreferences, 'id' | 'userId' | 'projectId' | 'createdAt' | 'updatedAt'>
    >,
  ): Promise<NotificationPreferences> {
    const db = getDb();
    const now = new Date().toISOString();

    // Check if exists
    const existing = await this.findByUserAndProject(userId, projectId);

    if (existing) {
      // Update
      const sets: string[] = ['updated_at = ?'];
      const params: (string | number)[] = [now];

      if (preferences.notifyOnNewReport !== undefined) {
        sets.push('notify_on_new_report = ?');
        params.push(preferences.notifyOnNewReport ? 1 : 0);
      }
      if (preferences.notifyOnStatusChange !== undefined) {
        sets.push('notify_on_status_change = ?');
        params.push(preferences.notifyOnStatusChange ? 1 : 0);
      }
      if (preferences.notifyOnPriorityChange !== undefined) {
        sets.push('notify_on_priority_change = ?');
        params.push(preferences.notifyOnPriorityChange ? 1 : 0);
      }
      if (preferences.notifyOnAssignment !== undefined) {
        sets.push('notify_on_assignment = ?');
        params.push(preferences.notifyOnAssignment ? 1 : 0);
      }
      if (preferences.emailEnabled !== undefined) {
        sets.push('email_enabled = ?');
        params.push(preferences.emailEnabled ? 1 : 0);
      }

      db.run(`UPDATE notification_preferences SET ${sets.join(', ')} WHERE id = ?`, [
        ...params,
        existing.id,
      ]);

      return (await this.findByUserAndProject(userId, projectId))!;
    } else {
      // Create with defaults from project or system defaults
      const defaults = await projectNotificationDefaultsRepo.findByProject(projectId);

      const id = randomUUID();
      db.run(
        `INSERT INTO notification_preferences (
          id, user_id, project_id,
          notify_on_new_report, notify_on_status_change, notify_on_priority_change, notify_on_assignment,
          email_enabled, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          userId,
          projectId,
          (preferences.notifyOnNewReport ?? defaults?.defaultNotifyOnNewReport ?? true) ? 1 : 0,
          (preferences.notifyOnStatusChange ?? defaults?.defaultNotifyOnStatusChange ?? true)
            ? 1
            : 0,
          (preferences.notifyOnPriorityChange ?? defaults?.defaultNotifyOnPriorityChange ?? true)
            ? 1
            : 0,
          (preferences.notifyOnAssignment ?? defaults?.defaultNotifyOnAssignment ?? true) ? 1 : 0,
          (preferences.emailEnabled ?? defaults?.defaultEmailEnabled ?? true) ? 1 : 0,
          now,
          now,
        ],
      );

      return (await this.findByUserAndProject(userId, projectId))!;
    }
  },

  /**
   * Delete user's preferences for a project
   */
  async delete(userId: string, projectId: string): Promise<boolean> {
    const db = getDb();
    const result = db.run(
      'DELETE FROM notification_preferences WHERE user_id = ? AND project_id = ?',
      [userId, projectId],
    );
    return result.changes > 0;
  },

  /**
   * Get or create preferences with defaults
   */
  async getOrCreate(userId: string, projectId: string): Promise<NotificationPreferences> {
    const existing = await this.findByUserAndProject(userId, projectId);
    if (existing) {
      return existing;
    }

    return this.upsert(userId, projectId, {});
  },
};

// Project Notification Defaults Repository

export const projectNotificationDefaultsRepo = {
  /**
   * Get default notification settings for a project
   */
  async findByProject(projectId: string): Promise<ProjectNotificationDefaults | null> {
    const db = getDb();
    const row = db
      .query('SELECT * FROM project_notification_defaults WHERE project_id = ?')
      .get(projectId) as ProjectNotificationDefaultsRow | null;

    return row ? mapRowToDefaults(row) : null;
  },

  /**
   * Create or update project defaults
   */
  async upsert(
    projectId: string,
    defaults: Partial<
      Omit<ProjectNotificationDefaults, 'id' | 'projectId' | 'createdAt' | 'updatedAt'>
    >,
  ): Promise<ProjectNotificationDefaults> {
    const db = getDb();
    const now = new Date().toISOString();

    const existing = await this.findByProject(projectId);

    if (existing) {
      // Update
      const sets: string[] = ['updated_at = ?'];
      const params: (string | number)[] = [now];

      if (defaults.defaultNotifyOnNewReport !== undefined) {
        sets.push('default_notify_on_new_report = ?');
        params.push(defaults.defaultNotifyOnNewReport ? 1 : 0);
      }
      if (defaults.defaultNotifyOnStatusChange !== undefined) {
        sets.push('default_notify_on_status_change = ?');
        params.push(defaults.defaultNotifyOnStatusChange ? 1 : 0);
      }
      if (defaults.defaultNotifyOnPriorityChange !== undefined) {
        sets.push('default_notify_on_priority_change = ?');
        params.push(defaults.defaultNotifyOnPriorityChange ? 1 : 0);
      }
      if (defaults.defaultNotifyOnAssignment !== undefined) {
        sets.push('default_notify_on_assignment = ?');
        params.push(defaults.defaultNotifyOnAssignment ? 1 : 0);
      }
      if (defaults.defaultEmailEnabled !== undefined) {
        sets.push('default_email_enabled = ?');
        params.push(defaults.defaultEmailEnabled ? 1 : 0);
      }

      db.run(`UPDATE project_notification_defaults SET ${sets.join(', ')} WHERE id = ?`, [
        ...params,
        existing.id,
      ]);

      return (await this.findByProject(projectId))!;
    } else {
      // Create
      const id = randomUUID();
      db.run(
        `INSERT INTO project_notification_defaults (
          id, project_id,
          default_notify_on_new_report, default_notify_on_status_change,
          default_notify_on_priority_change, default_notify_on_assignment,
          default_email_enabled, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          projectId,
          (defaults.defaultNotifyOnNewReport ?? true) ? 1 : 0,
          (defaults.defaultNotifyOnStatusChange ?? true) ? 1 : 0,
          (defaults.defaultNotifyOnPriorityChange ?? true) ? 1 : 0,
          (defaults.defaultNotifyOnAssignment ?? true) ? 1 : 0,
          (defaults.defaultEmailEnabled ?? true) ? 1 : 0,
          now,
          now,
        ],
      );

      return (await this.findByProject(projectId))!;
    }
  },

  /**
   * Delete project defaults
   */
  async delete(projectId: string): Promise<boolean> {
    const db = getDb();
    const result = db.run('DELETE FROM project_notification_defaults WHERE project_id = ?', [
      projectId,
    ]);
    return result.changes > 0;
  },
};
