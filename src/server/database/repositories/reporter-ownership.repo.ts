import { getDb } from '../database.js';

const enabledProject = `SELECT id FROM projects WHERE deleted_at IS NULL
  AND json_extract(settings, '$.reporterPortal.enabled') = 1`;

export const reporterOwnershipRepo = {
  attachClaimable(reporterId: string, email: string, now: string): Array<{ id: string }> {
    return getDb()
      .query<{ id: string }, [string, string, string]>(
        `UPDATE reports SET reporter_id = ?, claimable_email = NULL, owner_seen_at = NULL, updated_at = ?
       WHERE reporter_id IS NULL AND claimable_email = ? AND project_id IN (${enabledProject}) RETURNING id`
      )
      .all(reporterId, now, email);
  },

  canAccess(reportId: string, reporterId: string): boolean {
    return (
      getDb()
        .query(
          `SELECT 1 FROM reports WHERE id = ? AND reporter_id = ? AND project_id IN (${enabledProject})`
        )
        .get(reportId, reporterId) !== null
    );
  },
};
