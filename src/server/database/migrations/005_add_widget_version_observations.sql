CREATE TABLE widget_version_observations (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  deployment_key TEXT NOT NULL CHECK(length(deployment_key) = 64),
  version TEXT NOT NULL CHECK(length(version) BETWEEN 5 AND 32),
  last_seen_at TEXT NOT NULL,
  PRIMARY KEY (project_id, deployment_key)
);

CREATE INDEX idx_widget_version_observations_last_seen
  ON widget_version_observations(last_seen_at);
