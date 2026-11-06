ALTER TABLE users ADD COLUMN gamification_enabled INTEGER NOT NULL DEFAULT 1 CHECK(gamification_enabled IN (0, 1));
