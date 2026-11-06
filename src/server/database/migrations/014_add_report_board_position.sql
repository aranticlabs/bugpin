ALTER TABLE reports ADD COLUMN board_position REAL NOT NULL DEFAULT 0;

UPDATE reports
SET board_position = ranked.position
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY status ORDER BY created_at DESC, id) - 1 AS position
  FROM reports
) AS ranked
WHERE reports.id = ranked.id;

CREATE INDEX IF NOT EXISTS idx_reports_status_board_position ON reports(status, board_position);
