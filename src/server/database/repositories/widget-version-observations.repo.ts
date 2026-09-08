import { getDb, transaction } from '../database.js';

export interface WidgetVersionObservation {
  projectId: string;
  deploymentKey: string;
  version: string;
  lastSeenAt: string;
}

export interface RecentWidgetVersionObservation extends WidgetVersionObservation {
  projectName: string;
}

interface ObservationRow {
  project_id: string;
  project_name: string;
  deployment_key: string;
  version: string;
  last_seen_at: string;
}

export const widgetVersionObservationsRepo = {
  async upsert(
    observation: WidgetVersionObservation,
    staleBefore: string,
    maxPerProject: number
  ): Promise<void> {
    transaction(() => {
      const db = getDb();
      db.run('DELETE FROM widget_version_observations WHERE last_seen_at < ?', [staleBefore]);
      db.run(
        `INSERT INTO widget_version_observations
           (project_id, deployment_key, version, last_seen_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(project_id, deployment_key) DO UPDATE SET
           version = excluded.version,
           last_seen_at = excluded.last_seen_at`,
        [
          observation.projectId,
          observation.deploymentKey,
          observation.version,
          observation.lastSeenAt,
        ]
      );
      db.run(
        `DELETE FROM widget_version_observations
         WHERE project_id = ?
           AND deployment_key NOT IN (
             SELECT deployment_key
             FROM widget_version_observations
             WHERE project_id = ?
             ORDER BY last_seen_at DESC, deployment_key DESC
             LIMIT ?
           )`,
        [observation.projectId, observation.projectId, maxPerProject]
      );
    });
  },

  async listRecent(staleBefore: string): Promise<RecentWidgetVersionObservation[]> {
    return transaction(() => {
      const db = getDb();
      db.run('DELETE FROM widget_version_observations WHERE last_seen_at < ?', [staleBefore]);
      const rows = db
        .query(
          `SELECT
             observations.project_id,
             projects.name AS project_name,
             observations.deployment_key,
             observations.version,
             observations.last_seen_at
           FROM widget_version_observations AS observations
           JOIN projects ON projects.id = observations.project_id
           WHERE observations.last_seen_at >= ?
             AND projects.is_active = 1
             AND projects.deleted_at IS NULL
           ORDER BY projects.name ASC, projects.id ASC, observations.deployment_key ASC`
        )
        .all(staleBefore) as ObservationRow[];

      return rows.map((row) => ({
        projectId: row.project_id,
        projectName: row.project_name,
        deploymentKey: row.deployment_key,
        version: row.version,
        lastSeenAt: row.last_seen_at,
      }));
    });
  },
};
