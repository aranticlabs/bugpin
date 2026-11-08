import * as fs from 'node:fs';
import * as path from 'node:path';
import { config } from '../config.js';

export const REPORTERS_SCHEMA = fs.readFileSync(
  path.join(config.migrationsDir, '018_add_reporters.sql'),
  'utf8'
);
export const REPORTS_SCHEMA = fs.readFileSync(
  path.join(config.migrationsDir, '019_rebuild_reports_for_portal.sql'),
  'utf8'
);
export const REPORT_HISTORY_SCHEMA = fs.readFileSync(
  path.join(config.migrationsDir, '020_rebuild_report_history_actions.sql'),
  'utf8'
);

export const REPORT_PORTAL_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_reports_reporter ON reports(reporter_id, project_id, updated_at DESC) WHERE reporter_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reports_claimable ON reports(claimable_email) WHERE reporter_id IS NULL AND claimable_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reports_reporter_activity ON reports(project_id, last_reporter_activity_at) WHERE last_reporter_activity_at IS NOT NULL;
`;
