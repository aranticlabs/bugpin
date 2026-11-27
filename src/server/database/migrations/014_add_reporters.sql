CREATE TABLE IF NOT EXISTS reporters (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'en',
  suspended_at TEXT,
  suspended_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  sessions_revoked_at TEXT,
  sessions_revoked_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reporter_sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  reporter_id TEXT NOT NULL REFERENCES reporters(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  absolute_expires_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS reporter_auth_tokens (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK(purpose IN ('login')),
  source TEXT NOT NULL CHECK(source IN ('request', 'confirmation', 'invitation')),
  report_id TEXT REFERENCES reports(id) ON DELETE SET NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reporter_email_suppressions (
  email TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK(source IN ('portal', 'unsubscribe')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reporter_sessions_reporter ON reporter_sessions(reporter_id);
CREATE INDEX IF NOT EXISTS idx_reporter_sessions_expiry ON reporter_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_reporter_auth_tokens_email ON reporter_auth_tokens(email, created_at);
CREATE INDEX IF NOT EXISTS idx_reporter_auth_tokens_expiry ON reporter_auth_tokens(expires_at);
