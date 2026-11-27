DROP TRIGGER IF EXISTS reports_au;

CREATE TRIGGER reports_au AFTER UPDATE OF title, description ON reports BEGIN
  INSERT INTO reports_fts(reports_fts, rowid, title, description)
  VALUES('delete', OLD.rowid, OLD.title, OLD.description);
  INSERT INTO reports_fts(rowid, title, description)
  VALUES (NEW.rowid, NEW.title, NEW.description);
END;
