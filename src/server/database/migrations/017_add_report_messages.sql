CREATE TABLE IF NOT EXISTS report_messages (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  author_kind TEXT NOT NULL CHECK(author_kind IN ('staff', 'reporter')),
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  reporter_id TEXT REFERENCES reporters(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL,
  body TEXT NOT NULL,
  hidden_at TEXT,
  hidden_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (
    (author_kind = 'staff' AND reporter_id IS NULL) OR
    (author_kind = 'reporter' AND user_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_report_messages_report ON report_messages(report_id, created_at);
CREATE INDEX IF NOT EXISTS idx_report_messages_staff_user ON report_messages(user_id, created_at) WHERE author_kind = 'staff';
