ALTER TABLE users ADD COLUMN portal_verified_email TEXT;

CREATE TABLE IF NOT EXISTS portal_operator_sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS portal_operator_tokens (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_portal_operator_sessions_user ON portal_operator_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_portal_operator_sessions_expiry ON portal_operator_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_portal_operator_tokens_user ON portal_operator_tokens(user_id);
