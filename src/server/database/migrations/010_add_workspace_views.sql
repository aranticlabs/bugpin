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
