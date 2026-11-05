ALTER TABLE user_pinned_projects ADD COLUMN position INTEGER NOT NULL DEFAULT 0;

UPDATE user_pinned_projects
SET position = (
  SELECT COUNT(*)
  FROM user_pinned_projects other
  WHERE other.user_id = user_pinned_projects.user_id
    AND (
      other.created_at < user_pinned_projects.created_at
      OR (other.created_at = user_pinned_projects.created_at AND other.project_id < user_pinned_projects.project_id)
    )
);
