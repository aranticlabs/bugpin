-- Local files live at uploads/<type directory>/<report id>/<stored filename> under the data
-- directory. Rows whose stored path ends with that layout are rewritten to the relative form;
-- object storage URLs and paths outside the layout keep their value.
UPDATE files
SET path = rewritten.relative_path
FROM (
  SELECT
    id,
    'uploads/'
      || CASE WHEN type IN ('screenshot', 'video') THEN 'screenshots' ELSE 'attachments' END
      || '/' || report_id || '/' || filename AS relative_path
  FROM files
) AS rewritten
WHERE rewritten.id = files.id
  AND files.path != rewritten.relative_path
  AND files.path NOT LIKE 's3://%'
  AND files.path NOT LIKE 'http://%'
  AND files.path NOT LIKE 'https://%'
  AND substr(files.path, -length(rewritten.relative_path)) = rewritten.relative_path
  AND substr(files.path, -length(rewritten.relative_path) - 1, 1) = '/';
