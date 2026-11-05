ALTER TABLE users ADD COLUMN api_access_enabled INTEGER NOT NULL DEFAULT 0 CHECK(api_access_enabled IN (0, 1));

CREATE TABLE IF NOT EXISTS api_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT UNIQUE NOT NULL,
  token_prefix TEXT NOT NULL,
  scopes JSON DEFAULT '["read"]' NOT NULL,
  last_used_at TEXT,
  expires_at TEXT,
  created_at TEXT DEFAULT (datetime('now')) NOT NULL,
  revoked_at TEXT
);

-- Users who already hold a usable token keep API access after the upgrade.
UPDATE users SET api_access_enabled = 1
WHERE id IN (
  SELECT user_id FROM api_tokens
  WHERE revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
