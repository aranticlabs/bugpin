ALTER TABLE files ADD COLUMN captured_at TEXT;
ALTER TABLE files ADD COLUMN duration_ms INTEGER;
ALTER TABLE files ADD COLUMN recording_quality TEXT CHECK(recording_quality IN ('low', 'standard', 'high'));
