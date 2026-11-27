import { randomUUID } from 'crypto';
import { getDb } from '../database.js';
import type {
  NotificationDefaultSettings,
  NotificationPreferences,
  ProjectNotificationDefaults,
} from '@shared/types';

const toFlag = (value: boolean): number => (value ? 1 : 0);

// Database Row Types

interface NotificationPreferencesRow {
  id: string;
  user_id: string;
  project_id: string;
  notify_on_new_report: number;
  notify_on_status_change: number;
  notify_on_priority_change: number;
  notify_on_assignment: number;
  notify_on_deletion: number;
  notify_on_reporter_reply: number;
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
  default_notify_on_deletion: number;
  default_notify_on_reporter_reply: number;
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
    notifyOnDeletion: Boolean(row.notify_on_deletion),
    notifyOnReporterReply: Boolean(row.notify_on_reporter_reply),
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
    defaultNotifyOnDeletion: Boolean(row.default_notify_on_deletion),
    defaultNotifyOnReporterReply: Boolean(row.default_notify_on_reporter_reply),
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
    projectId: string
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
   * Get all users who should be notified for a project.
   * Users without a preferences row inherit project defaults, then global defaults.
   */
  async findByProjectWithEmailEnabled(
    projectId: string,
    globalDefaults: NotificationDefaultSettings
  ): Promise<NotificationPreferences[]> {
    const db = getDb();

    // LEFT JOIN users with their notification preferences and the project defaults.
    // Precedence per flag: user preferences row -> project defaults -> global defaults.
    const rows = db
      .query(
        `SELECT
          COALESCE(np.id, 'default-' || u.id) as id,
          u.id as user_id,
          ? as project_id,
          COALESCE(np.notify_on_new_report, pnd.default_notify_on_new_report, ?) as notify_on_new_report,
          COALESCE(np.notify_on_status_change, pnd.default_notify_on_status_change, ?) as notify_on_status_change,
          COALESCE(np.notify_on_priority_change, pnd.default_notify_on_priority_change, ?) as notify_on_priority_change,
          COALESCE(np.notify_on_assignment, pnd.default_notify_on_assignment, ?) as notify_on_assignment,
          COALESCE(np.notify_on_deletion, pnd.default_notify_on_deletion, ?) as notify_on_deletion,
          COALESCE(np.notify_on_reporter_reply, pnd.default_notify_on_reporter_reply, ?) as notify_on_reporter_reply,
          COALESCE(np.email_enabled, pnd.default_email_enabled, ?) as email_enabled,
          COALESCE(np.created_at, u.created_at) as created_at,
          COALESCE(np.updated_at, u.updated_at) as updated_at
        FROM users u
        LEFT JOIN notification_preferences np ON np.user_id = u.id AND np.project_id = ?
        LEFT JOIN project_notification_defaults pnd ON pnd.project_id = ?
        WHERE u.is_active = 1
          AND COALESCE(np.email_enabled, pnd.default_email_enabled, ?) = 1`
      )
      .all(
        projectId,
        toFlag(globalDefaults.notifyOnNewReport),
        toFlag(globalDefaults.notifyOnStatusChange),
        toFlag(globalDefaults.notifyOnPriorityChange),
        toFlag(globalDefaults.notifyOnAssignment),
        toFlag(globalDefaults.notifyOnDeletion),
        toFlag(globalDefaults.notifyOnReporterReply),
        toFlag(globalDefaults.emailEnabled),
        projectId,
        projectId,
        toFlag(globalDefaults.emailEnabled)
      ) as NotificationPreferencesRow[];

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
    globalDefaults: NotificationDefaultSettings
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
      if (preferences.notifyOnDeletion !== undefined) {
        sets.push('notify_on_deletion = ?');
        params.push(preferences.notifyOnDeletion ? 1 : 0);
      }
      if (preferences.notifyOnReporterReply !== undefined) {
        sets.push('notify_on_reporter_reply = ?');
        params.push(preferences.notifyOnReporterReply ? 1 : 0);
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
      // Create with defaults from project, then global defaults
      const defaults = await projectNotificationDefaultsRepo.findByProject(projectId);

      const id = randomUUID();
      db.run(
        `INSERT INTO notification_preferences (
          id, user_id, project_id,
          notify_on_new_report, notify_on_status_change, notify_on_priority_change, notify_on_assignment,
          notify_on_deletion, notify_on_reporter_reply, email_enabled, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          userId,
          projectId,
          toFlag(
            preferences.notifyOnNewReport ??
              defaults?.defaultNotifyOnNewReport ??
              globalDefaults.notifyOnNewReport
          ),
          toFlag(
            preferences.notifyOnStatusChange ??
              defaults?.defaultNotifyOnStatusChange ??
              globalDefaults.notifyOnStatusChange
          ),
          toFlag(
            preferences.notifyOnPriorityChange ??
              defaults?.defaultNotifyOnPriorityChange ??
              globalDefaults.notifyOnPriorityChange
          ),
          toFlag(
            preferences.notifyOnAssignment ??
              defaults?.defaultNotifyOnAssignment ??
              globalDefaults.notifyOnAssignment
          ),
          toFlag(
            preferences.notifyOnDeletion ??
              defaults?.defaultNotifyOnDeletion ??
              globalDefaults.notifyOnDeletion
          ),
          toFlag(
            preferences.notifyOnReporterReply ??
              defaults?.defaultNotifyOnReporterReply ??
              globalDefaults.notifyOnReporterReply
          ),
          toFlag(
            preferences.emailEnabled ?? defaults?.defaultEmailEnabled ?? globalDefaults.emailEnabled
          ),
          now,
          now,
        ]
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
      [userId, projectId]
    );
    return result.changes > 0;
  },

  /**
   * Get or create preferences with defaults
   */
  async getOrCreate(
    userId: string,
    projectId: string,
    globalDefaults: NotificationDefaultSettings
  ): Promise<NotificationPreferences> {
    const existing = await this.findByUserAndProject(userId, projectId);
    if (existing) {
      return existing;
    }

    return this.upsert(userId, projectId, {}, globalDefaults);
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
    >
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
      if (defaults.defaultNotifyOnDeletion !== undefined) {
        sets.push('default_notify_on_deletion = ?');
        params.push(defaults.defaultNotifyOnDeletion ? 1 : 0);
      }
      if (defaults.defaultNotifyOnReporterReply !== undefined) {
        sets.push('default_notify_on_reporter_reply = ?');
        params.push(defaults.defaultNotifyOnReporterReply ? 1 : 0);
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
          default_notify_on_deletion, default_notify_on_reporter_reply, default_email_enabled, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          projectId,
          (defaults.defaultNotifyOnNewReport ?? true) ? 1 : 0,
          (defaults.defaultNotifyOnStatusChange ?? true) ? 1 : 0,
          (defaults.defaultNotifyOnPriorityChange ?? true) ? 1 : 0,
          (defaults.defaultNotifyOnAssignment ?? true) ? 1 : 0,
          (defaults.defaultNotifyOnDeletion ?? true) ? 1 : 0,
          (defaults.defaultNotifyOnReporterReply ?? true) ? 1 : 0,
          (defaults.defaultEmailEnabled ?? true) ? 1 : 0,
          now,
          now,
        ]
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
