-- Earlier versions stored all four diagnostics values on every project save, even when the
-- admin never changed them. Projects whose values all equal those former built-in defaults
-- drop them, so they follow the instance-wide diagnostics defaults (which start with the
-- same values). Projects with any other value keep their explicit override.
UPDATE projects
SET settings = json_remove(
  settings,
  '$.activityCapture',
  '$.consoleCapture',
  '$.networkCapture',
  '$.storageKeysCapture'
)
WHERE json_valid(settings)
  AND json_type(settings, '$.activityCapture') = 'true'
  AND json_type(settings, '$.consoleCapture') = 'true'
  AND json_type(settings, '$.networkCapture') = 'true'
  AND json_type(settings, '$.storageKeysCapture') = 'false';
