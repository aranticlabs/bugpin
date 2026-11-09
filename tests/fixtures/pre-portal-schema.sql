CREATE TABLE api_tokens (
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

CREATE TABLE files (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('screenshot', 'video', 'attachment')),
      filename TEXT NOT NULL,
      path TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      width INTEGER,
      height INTEGER,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL
    );

CREATE TABLE integrations (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('github', 'jira', 'slack', 'linear', 'webhook')),
      name TEXT NOT NULL,
      config JSON NOT NULL,
      is_active INTEGER DEFAULT 1 NOT NULL CHECK(is_active IN (0, 1)),
      last_used_at TEXT,
      usage_count INTEGER DEFAULT 0 NOT NULL,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')) NOT NULL
    );

CREATE TABLE migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      applied_at TEXT DEFAULT (datetime('now')) NOT NULL
    );

CREATE TABLE notification_preferences (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      notify_on_new_report INTEGER DEFAULT 1 NOT NULL,
      notify_on_status_change INTEGER DEFAULT 1 NOT NULL,
      notify_on_priority_change INTEGER DEFAULT 1 NOT NULL,
      notify_on_assignment INTEGER DEFAULT 1 NOT NULL,
      notify_on_deletion INTEGER DEFAULT 1 NOT NULL,
      email_enabled INTEGER DEFAULT 1 NOT NULL,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')) NOT NULL,
      UNIQUE(user_id, project_id)
    );

CREATE TABLE password_reset_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT UNIQUE NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL
    );

CREATE TABLE project_notification_defaults (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
      default_notify_on_new_report INTEGER DEFAULT 1 NOT NULL,
      default_notify_on_status_change INTEGER DEFAULT 1 NOT NULL,
      default_notify_on_priority_change INTEGER DEFAULT 1 NOT NULL,
      default_notify_on_assignment INTEGER DEFAULT 1 NOT NULL,
      default_notify_on_deletion INTEGER DEFAULT 1 NOT NULL,
      default_email_enabled INTEGER DEFAULT 1 NOT NULL,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')) NOT NULL
    );

CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      api_key_hash TEXT UNIQUE NOT NULL,
      api_key_prefix TEXT NOT NULL,
      api_key TEXT NOT NULL DEFAULT '',
      settings JSON DEFAULT '{}',
      reports_count INTEGER DEFAULT 0 NOT NULL,
      is_active INTEGER DEFAULT 1 NOT NULL CHECK(is_active IN (0, 1)),
      position INTEGER DEFAULT 0 NOT NULL,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')) NOT NULL,
      deleted_at TEXT
    );

CREATE TABLE report_history (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL CHECK(action IN ('created', 'status_changed', 'priority_changed', 'assignee_changed')),
      old_value TEXT,
      new_value TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

CREATE TABLE reporter_messages (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  message TEXT NOT NULL,
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE reports (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      source TEXT DEFAULT 'widget' NOT NULL CHECK(source IN ('widget', 'manual')),
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'open' NOT NULL CHECK(status IN ('open', 'in_progress', 'resolved', 'closed')),
      priority TEXT DEFAULT 'medium' NOT NULL CHECK(priority IN ('lowest', 'low', 'medium', 'high', 'highest')),
      annotations JSON,
      metadata JSON NOT NULL,
      reporter_email TEXT,
      reporter_name TEXT,
      assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL,
      custom_fields JSON DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')) NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')) NOT NULL,
      resolved_at TEXT,
      resolved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      closed_at TEXT,
      forwarded_to JSON DEFAULT '[]',
      github_sync_status TEXT NULL CHECK(github_sync_status IN ('pending', 'synced', 'error')),
      github_sync_error TEXT NULL,
      github_issue_number INTEGER NULL,
      github_issue_url TEXT NULL,
      github_synced_at TEXT NULL,
      reporter_locale TEXT NOT NULL DEFAULT 'en',
      submission_id TEXT
    , board_position REAL NOT NULL DEFAULT 0);

CREATE VIRTUAL TABLE reports_fts USING fts5(
      title,
      description,
      content='reports',
      content_rowid='rowid'
    );

CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL,
      expires_at TEXT NOT NULL,
      last_activity_at TEXT DEFAULT (datetime('now')) NOT NULL
    );

CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value JSON NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')) NOT NULL
    );

CREATE TABLE user_passkeys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      credential_id TEXT NOT NULL UNIQUE,
      public_key TEXT NOT NULL,
      counter INTEGER NOT NULL DEFAULT 0,
      transports TEXT,
      device_type TEXT,
      backed_up INTEGER NOT NULL DEFAULT 0 CHECK(backed_up IN (0, 1)),
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_used_at TEXT
    );

CREATE TABLE user_pinned_projects (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL, position INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, project_id)
    );

CREATE TABLE user_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  preferences TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE user_recent_reports (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
      viewed_at TEXT NOT NULL,
      PRIMARY KEY (user_id, report_id)
    );

CREATE TABLE user_recovery_codes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code_hash TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

CREATE TABLE user_totp (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      secret_encrypted TEXT NOT NULL,
      confirmed_at TEXT,
      last_used_step INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      avatar_url TEXT,
      role TEXT NOT NULL DEFAULT 'viewer' CHECK(role IN ('admin', 'editor', 'viewer')),
      is_active INTEGER DEFAULT 1 NOT NULL CHECK(is_active IN (0, 1)),
      must_change_password INTEGER DEFAULT 0 NOT NULL CHECK(must_change_password IN (0, 1)),
      api_access_enabled INTEGER DEFAULT 0 NOT NULL CHECK(api_access_enabled IN (0, 1)),
      password_changed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')) NOT NULL,
      last_login_at TEXT,
      invitation_token TEXT UNIQUE,
      invitation_token_expires_at TEXT,
      invitation_sent_at TEXT,
      invitation_accepted_at TEXT
    , gamification_enabled INTEGER NOT NULL DEFAULT 1 CHECK(gamification_enabled IN (0, 1)));

CREATE TABLE webhooks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      secret TEXT,
      events JSON DEFAULT '["report.created"]' NOT NULL,
      is_active INTEGER DEFAULT 1 NOT NULL CHECK(is_active IN (0, 1)),
      last_triggered_at TEXT,
      last_status_code INTEGER,
      failure_count INTEGER DEFAULT 0 NOT NULL,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')) NOT NULL
    );

CREATE TABLE widget_version_observations (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  deployment_key TEXT NOT NULL CHECK(length(deployment_key) = 64),
  version TEXT NOT NULL CHECK(length(version) BETWEEN 5 AND 32),
  last_seen_at TEXT NOT NULL,
  PRIMARY KEY (project_id, deployment_key)
);

CREATE INDEX idx_api_tokens_expires ON api_tokens(expires_at) WHERE revoked_at IS NULL;

CREATE INDEX idx_api_tokens_hash ON api_tokens(token_hash) WHERE revoked_at IS NULL;

CREATE INDEX idx_api_tokens_user ON api_tokens(user_id);

CREATE INDEX idx_files_report ON files(report_id);

CREATE INDEX idx_files_type ON files(type);

CREATE INDEX idx_integrations_active ON integrations(is_active) WHERE is_active = 1;

CREATE INDEX idx_integrations_project ON integrations(project_id);

CREATE INDEX idx_integrations_project_type ON integrations(project_id, type);

CREATE INDEX idx_integrations_type ON integrations(type);

CREATE INDEX idx_notification_preferences_enabled ON notification_preferences(email_enabled) WHERE email_enabled = 1;

CREATE INDEX idx_notification_preferences_project ON notification_preferences(project_id);

CREATE INDEX idx_notification_preferences_user ON notification_preferences(user_id);

CREATE INDEX idx_password_reset_tokens_user ON password_reset_tokens(user_id);

CREATE INDEX idx_projects_api_key_hash ON projects(api_key_hash) WHERE deleted_at IS NULL;

CREATE INDEX idx_projects_created_at ON projects(created_at DESC);

CREATE INDEX idx_projects_is_active ON projects(is_active) WHERE deleted_at IS NULL;

CREATE INDEX idx_projects_position ON projects(position ASC) WHERE deleted_at IS NULL;

CREATE INDEX idx_report_history_created_at ON report_history(report_id, created_at DESC);

CREATE INDEX idx_report_history_recent ON report_history(created_at DESC);

CREATE INDEX idx_report_history_report_action ON report_history(report_id, action, created_at);

CREATE INDEX idx_report_history_report_id ON report_history(report_id);

CREATE INDEX idx_report_history_user_action ON report_history(user_id, action);

CREATE INDEX idx_reporter_messages_report_id ON reporter_messages(report_id);

CREATE INDEX idx_reporter_messages_user_sent ON reporter_messages(user_id, sent_at);

CREATE INDEX idx_reports_assigned_to ON reports(assigned_to);

CREATE INDEX idx_reports_closed_at ON reports(closed_at) WHERE closed_at IS NOT NULL;

CREATE INDEX idx_reports_created_at ON reports(created_at DESC);

CREATE INDEX idx_reports_github_sync_status ON reports(github_sync_status) WHERE github_sync_status IS NOT NULL;

CREATE INDEX idx_reports_priority ON reports(priority);

CREATE INDEX idx_reports_project ON reports(project_id);

CREATE INDEX idx_reports_project_created ON reports(project_id, created_at DESC);

CREATE INDEX idx_reports_project_status ON reports(project_id, status);

CREATE UNIQUE INDEX idx_reports_project_submission ON reports(project_id, submission_id) WHERE submission_id IS NOT NULL;

CREATE INDEX idx_reports_resolved_at ON reports(resolved_at) WHERE resolved_at IS NOT NULL;

CREATE INDEX idx_reports_resolved_by ON reports(resolved_by, resolved_at);

CREATE INDEX idx_reports_source ON reports(source);

CREATE INDEX idx_reports_status ON reports(status);

CREATE INDEX idx_reports_status_board_position ON reports(status, board_position);

CREATE INDEX idx_sessions_expires ON sessions(expires_at);

CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE INDEX idx_user_passkeys_user ON user_passkeys(user_id);

CREATE INDEX idx_user_recent_reports_viewed ON user_recent_reports(user_id, viewed_at DESC);

CREATE INDEX idx_user_recovery_codes_user ON user_recovery_codes(user_id);

CREATE INDEX idx_users_email ON users(email);

CREATE INDEX idx_users_invitation_token ON users(invitation_token) WHERE invitation_token IS NOT NULL;

CREATE INDEX idx_users_role ON users(role);

CREATE INDEX idx_webhooks_active ON webhooks(is_active) WHERE is_active = 1;

CREATE INDEX idx_webhooks_project ON webhooks(project_id);

CREATE INDEX idx_widget_version_observations_last_seen
  ON widget_version_observations(last_seen_at);

CREATE TRIGGER reports_ad AFTER DELETE ON reports BEGIN
      INSERT INTO reports_fts(reports_fts, rowid, title, description)
      VALUES('delete', OLD.rowid, OLD.title, OLD.description);
    END;

CREATE TRIGGER reports_ai AFTER INSERT ON reports BEGIN
      INSERT INTO reports_fts(rowid, title, description)
      VALUES (NEW.rowid, NEW.title, NEW.description);
    END;

CREATE TRIGGER reports_au AFTER UPDATE OF title, description ON reports BEGIN
  INSERT INTO reports_fts(reports_fts, rowid, title, description)
  VALUES('delete', OLD.rowid, OLD.title, OLD.description);
  INSERT INTO reports_fts(rowid, title, description)
  VALUES (NEW.rowid, NEW.title, NEW.description);
END;

CREATE TRIGGER reports_count_delete AFTER DELETE ON reports BEGIN
      UPDATE projects SET reports_count = reports_count - 1 WHERE id = OLD.project_id;
    END;

CREATE TRIGGER reports_count_insert AFTER INSERT ON reports BEGIN
      UPDATE projects SET reports_count = reports_count + 1 WHERE id = NEW.project_id;
    END;

INSERT INTO migrations(name) VALUES ('001_add_reporter_messages.sql');
INSERT INTO migrations(name) VALUES ('002_add_report_source.sql');
INSERT INTO migrations(name) VALUES ('003_add_reporter_locale.sql');
INSERT INTO migrations(name) VALUES ('004_add_report_history.sql');
INSERT INTO migrations(name) VALUES ('005_add_widget_version_observations.sql');
INSERT INTO migrations(name) VALUES ('006_add_user_password_fields.sql');
INSERT INTO migrations(name) VALUES ('007_add_two_factor.sql');
INSERT INTO migrations(name) VALUES ('008_add_user_api_access.sql');
INSERT INTO migrations(name) VALUES ('009_add_password_reset_tokens.sql');
INSERT INTO migrations(name) VALUES ('010_add_workspace_views.sql');
INSERT INTO migrations(name) VALUES ('011_inherit_default_diagnostics.sql');
INSERT INTO migrations(name) VALUES ('012_add_pinned_project_position.sql');
INSERT INTO migrations(name) VALUES ('013_add_user_preferences.sql');
INSERT INTO migrations(name) VALUES ('014_add_report_board_position.sql');
INSERT INTO migrations(name) VALUES ('015_add_gamification.sql');
INSERT INTO migrations(name) VALUES ('016_limit_report_search_trigger.sql');
INSERT INTO migrations(name) VALUES ('017_add_dashboard_indexes.sql');
