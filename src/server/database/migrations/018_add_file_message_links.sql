ALTER TABLE files ADD COLUMN message_id TEXT REFERENCES report_messages(id) ON DELETE CASCADE;
ALTER TABLE files ADD COLUMN uploaded_by_reporter_id TEXT REFERENCES reporters(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_files_message ON files(message_id) WHERE message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_files_reporter_upload ON files(uploaded_by_reporter_id, created_at) WHERE uploaded_by_reporter_id IS NOT NULL;
