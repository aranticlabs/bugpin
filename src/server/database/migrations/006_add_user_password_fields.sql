ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0 CHECK(must_change_password IN (0, 1));
ALTER TABLE users ADD COLUMN password_changed_at TEXT;
