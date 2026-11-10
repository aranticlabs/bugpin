CREATE TABLE IF NOT EXISTS user_pinned_projects (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, project_id)
);

CREATE TABLE IF NOT EXISTS user_recent_reports (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  viewed_at TEXT NOT NULL,
  PRIMARY KEY (user_id, report_id)
);

CREATE INDEX IF NOT EXISTS idx_user_recent_reports_viewed ON user_recent_reports(user_id, viewed_at DESC);

ALTER TABLE user_pinned_projects ADD COLUMN position INTEGER NOT NULL DEFAULT 0;

UPDATE user_pinned_projects
SET position = (
  SELECT COUNT(*)
  FROM user_pinned_projects other
  WHERE other.user_id = user_pinned_projects.user_id
    AND (
      other.created_at < user_pinned_projects.created_at
      OR (other.created_at = user_pinned_projects.created_at AND other.project_id < user_pinned_projects.project_id)
    )
);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  preferences TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE users ADD COLUMN gamification_enabled INTEGER NOT NULL DEFAULT 1 CHECK(gamification_enabled IN (0, 1));
