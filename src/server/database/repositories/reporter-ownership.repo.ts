import { getDb } from '../database.js';

const enabledProject = `SELECT id FROM projects WHERE deleted_at IS NULL
  AND json_extract(settings, '$.reporterPortal.enabled') = 1`;

interface OwnershipRecord {
  id: string;
  projectId: string;
  reporterId: string | null;
  claimableEmail: string | null;
  reporterEmail: string | null;
}

const ownershipColumns =
  'id, project_id AS projectId, reporter_id AS reporterId, claimable_email AS claimableEmail, reporter_email AS reporterEmail';

export const reporterOwnershipRepo = {
  findByReportId(id: string): OwnershipRecord | null {
    return getDb()
      .query<OwnershipRecord, [string]>(`SELECT ${ownershipColumns} FROM reports WHERE id = ?`)
      .get(id);
  },

  setOwner(id: string, reporterId: string | null, claimableEmail: string | null): void {
    getDb().run(
      'UPDATE reports SET reporter_id = ?, claimable_email = ?, owner_seen_at = NULL WHERE id = ?',
      [reporterId, claimableEmail, id]
    );
  },

  findForReporter(id: string, email: string): OwnershipRecord[] {
    return getDb()
      .query<OwnershipRecord, [string, string]>(
        `SELECT ${ownershipColumns} FROM reports WHERE reporter_id = ? OR (reporter_id IS NULL AND claimable_email = ?)`
      )
      .all(id, email);
  },

  clearForReporter(id: string, email: string, eraseContactDetails: boolean): void {
    getDb().run(
      `UPDATE reports SET reporter_id = NULL, claimable_email = NULL, owner_seen_at = NULL,
      reporter_name = CASE WHEN ? THEN NULL ELSE reporter_name END,
      reporter_email = CASE WHEN ? THEN NULL ELSE reporter_email END WHERE reporter_id = ?`,
      [eraseContactDetails ? 1 : 0, eraseContactDetails ? 1 : 0, id]
    );
    getDb().run(
      'UPDATE reports SET claimable_email = NULL, owner_seen_at = NULL WHERE reporter_id IS NULL AND claimable_email = ?',
      [email]
    );
  },
  attachClaimable(reporterId: string, email: string): Array<{ id: string; projectId: string }> {
    return getDb()
      .query<{ id: string; projectId: string }, [string, string]>(
        `UPDATE reports SET reporter_id = ?, claimable_email = NULL, owner_seen_at = NULL
       WHERE reporter_id IS NULL AND claimable_email = ? AND project_id IN (${enabledProject}) RETURNING id, project_id AS projectId`
      )
      .all(reporterId, email);
  },

  canAccess(reportId: string, reporterId: string): boolean {
    return (
      getDb()
        .query(
          `SELECT 1 FROM reports WHERE id = ? AND reporter_id = ? AND project_id IN (${enabledProject} AND is_active = 1)`
        )
        .get(reportId, reporterId) !== null
    );
  },
};
