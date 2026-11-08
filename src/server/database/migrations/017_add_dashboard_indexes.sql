CREATE INDEX IF NOT EXISTS idx_reporter_messages_user_sent ON reporter_messages(user_id, sent_at);
