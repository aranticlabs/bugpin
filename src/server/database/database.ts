import { Database } from 'bun:sqlite';
import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

let db: Database | null = null;

export function getDb(): Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

/**
 * Initialize the database connection
 * Creates the data directory and database file if they don't exist
 */
export async function initDatabase(): Promise<void> {
  // Create data directories
  const dataDir = path.dirname(config.dbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    logger.info('Created data directory', { path: dataDir });
  }

  // Create uploads directories
  for (const dir of [
    config.screenshotsDir,
    config.attachmentsDir,
    config.brandingDir,
    config.avatarsDir,
  ]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      logger.info('Created uploads directory', { path: dir });
    }
  }

  // Initialize SQLite database
  db = new Database(config.dbPath);

  // Set pragmas for optimal performance
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA synchronous = NORMAL;
    PRAGMA cache_size = -64000;
    PRAGMA foreign_keys = ON;
    PRAGMA temp_store = MEMORY;
  `);

  logger.info('Database initialized', { path: config.dbPath });
}

/**
 * Initialize database schema
 * Creates all tables if they don't exist
 */
export async function initSchema(): Promise<void> {
  if (!db) {
    throw new Error('Database not initialized');
  }

  logger.info('Initializing database schema');

  // Projects table
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
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
    )
  `);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_projects_api_key_hash ON projects(api_key_hash) WHERE deleted_at IS NULL`,
  );
  db.exec(`CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at DESC)`);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_projects_is_active ON projects(is_active) WHERE deleted_at IS NULL`,
  );
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_projects_position ON projects(position ASC) WHERE deleted_at IS NULL`,
  );

  // Add api_key column to existing databases (stores full key for display in admin)
  try {
    db.exec(`ALTER TABLE projects ADD COLUMN api_key TEXT NOT NULL DEFAULT ''`);
  } catch {
    // Column already exists
  }

  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      avatar_url TEXT,
      role TEXT NOT NULL DEFAULT 'viewer' CHECK(role IN ('admin', 'editor', 'viewer')),
      is_active INTEGER DEFAULT 1 NOT NULL CHECK(is_active IN (0, 1)),
      created_at TEXT DEFAULT (datetime('now')) NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')) NOT NULL,
      last_login_at TEXT,
      invitation_token TEXT UNIQUE,
      invitation_token_expires_at TEXT,
      invitation_sent_at TEXT,
      invitation_accepted_at TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)`);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_users_invitation_token ON users(invitation_token) WHERE invitation_token IS NOT NULL`,
  );

  // Sessions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL,
      expires_at TEXT NOT NULL,
      last_activity_at TEXT DEFAULT (datetime('now')) NOT NULL
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)`);

  // Reports table
  db.exec(`
    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
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
      github_synced_at TEXT NULL
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_reports_project ON reports(project_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_reports_priority ON reports(priority)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_reports_assigned_to ON reports(assigned_to)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_reports_project_status ON reports(project_id, status)`);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_reports_project_created ON reports(project_id, created_at DESC)`,
  );
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_reports_github_sync_status ON reports(github_sync_status) WHERE github_sync_status IS NOT NULL`,
  );

  // Files table
  db.exec(`
    CREATE TABLE IF NOT EXISTS files (
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
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_files_report ON files(report_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_files_type ON files(type)`);

  // Webhooks table
  db.exec(`
    CREATE TABLE IF NOT EXISTS webhooks (
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
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_webhooks_project ON webhooks(project_id)`);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_webhooks_active ON webhooks(is_active) WHERE is_active = 1`,
  );

  // Integrations table
  db.exec(`
    CREATE TABLE IF NOT EXISTS integrations (
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
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_integrations_project ON integrations(project_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_integrations_type ON integrations(type)`);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_integrations_project_type ON integrations(project_id, type)`,
  );
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_integrations_active ON integrations(is_active) WHERE is_active = 1`,
  );

  // Notification preferences table
  db.exec(`
    CREATE TABLE IF NOT EXISTS notification_preferences (
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
    )
  `);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_notification_preferences_user ON notification_preferences(user_id)`,
  );
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_notification_preferences_project ON notification_preferences(project_id)`,
  );
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_notification_preferences_enabled ON notification_preferences(email_enabled) WHERE email_enabled = 1`,
  );

  // Add notify_on_deletion column to existing databases
  try {
    db.exec(`ALTER TABLE notification_preferences ADD COLUMN notify_on_deletion INTEGER DEFAULT 1 NOT NULL`);
  } catch {
    // Column already exists
  }

  // Project notification defaults table
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_notification_defaults (
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
    )
  `);

  // Add default_notify_on_deletion column to existing databases
  try {
    db.exec(`ALTER TABLE project_notification_defaults ADD COLUMN default_notify_on_deletion INTEGER DEFAULT 1 NOT NULL`);
  } catch {
    // Column already exists
  }

  // API Tokens table (for programmatic API access - Enterprise feature)
  db.exec(`
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
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_api_tokens_user ON api_tokens(user_id)`);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_api_tokens_hash ON api_tokens(token_hash) WHERE revoked_at IS NULL`,
  );
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_api_tokens_expires ON api_tokens(expires_at) WHERE revoked_at IS NULL`,
  );

  // Settings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value JSON NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')) NOT NULL
    )
  `);
  db.exec(`
    INSERT OR IGNORE INTO settings (key, value) VALUES
      ('app_name', '"BugPin"'),
      ('app_url', '""'),
      ('smtp_enabled', 'false'),
      ('smtp_config', '{}'),
      ('retention_days', '90'),
      ('max_screenshot_size_mb', '10'),
      ('rate_limit_per_minute', '10')
  `);

  // Initialize full-text search
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS reports_fts USING fts5(
      title,
      description,
      content='reports',
      content_rowid='rowid'
    );

    -- Triggers to keep FTS in sync
    CREATE TRIGGER IF NOT EXISTS reports_ai AFTER INSERT ON reports BEGIN
      INSERT INTO reports_fts(rowid, title, description)
      VALUES (NEW.rowid, NEW.title, NEW.description);
    END;

    CREATE TRIGGER IF NOT EXISTS reports_ad AFTER DELETE ON reports BEGIN
      INSERT INTO reports_fts(reports_fts, rowid, title, description)
      VALUES('delete', OLD.rowid, OLD.title, OLD.description);
    END;

    CREATE TRIGGER IF NOT EXISTS reports_au AFTER UPDATE ON reports BEGIN
      INSERT INTO reports_fts(reports_fts, rowid, title, description)
      VALUES('delete', OLD.rowid, OLD.title, OLD.description);
      INSERT INTO reports_fts(rowid, title, description)
      VALUES (NEW.rowid, NEW.title, NEW.description);
    END;

    -- Triggers to maintain reports_count in projects table
    CREATE TRIGGER IF NOT EXISTS reports_count_insert AFTER INSERT ON reports BEGIN
      UPDATE projects SET reports_count = reports_count + 1 WHERE id = NEW.project_id;
    END;

    CREATE TRIGGER IF NOT EXISTS reports_count_delete AFTER DELETE ON reports BEGIN
      UPDATE projects SET reports_count = reports_count - 1 WHERE id = OLD.project_id;
    END;
  `);

  logger.info('Database schema initialized');
}

/**
 * Run database migrations
 * Applies all pending migrations from the migrations directory
 */
export async function runMigrations(): Promise<void> {
  if (!db) {
    throw new Error('Database not initialized');
  }

  // Create migrations table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      applied_at TEXT DEFAULT (datetime('now')) NOT NULL
    )
  `);

  // Get applied migrations
  const applied = db.query('SELECT name FROM migrations').all() as { name: string }[];
  const appliedNames = new Set(applied.map((m) => m.name));

  // Get migration files
  const migrationsDir = path.join(import.meta.dir, 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    logger.info('No migrations directory found, skipping migrations');
    return;
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    logger.info('No migration files found');
    return;
  }

  // Apply pending migrations
  for (const file of files) {
    if (!appliedNames.has(file)) {
      logger.info('Applying migration', { file });

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

      try {
        db.exec(sql);
        db.run('INSERT INTO migrations (name) VALUES (?)', [file]);
        logger.info('Migration applied successfully', { file });
      } catch (error) {
        logger.error('Migration failed', error, { file });
        throw error;
      }
    }
  }

  logger.info('All migrations applied');
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    logger.info('Database connection closed');
  }
}

/**
 * Run a transaction
 * Automatically rolls back on error
 */
export function transaction<T>(fn: () => T): T {
  const database = getDb();
  database.exec('BEGIN TRANSACTION');

  try {
    const result = fn();
    database.exec('COMMIT');
    return result;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}
