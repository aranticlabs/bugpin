ALTER TABLE notification_preferences ADD COLUMN notify_on_reporter_reply INTEGER NOT NULL DEFAULT 1;
ALTER TABLE project_notification_defaults ADD COLUMN default_notify_on_reporter_reply INTEGER NOT NULL DEFAULT 1;
INSERT OR IGNORE INTO settings (key, value) VALUES ('default_notify_on_reporter_reply', 'true');
