CREATE TABLE IF NOT EXISTS report_history (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK(action IN ('created', 'status_changed', 'priority_changed', 'assignee_changed', 'owner_assigned', 'owner_removed', 'claimable_set', 'message_hidden', 'message_unhidden')),
  old_value TEXT,
  new_value TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
