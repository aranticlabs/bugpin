/**
 * SQL for a project's effective Reporter Portal setting: its own value while it has its own
 * settings object, otherwise the instance default stored under `reporter_portal`. Evaluates to 1
 * when the setting is on.
 */
export function portalSetting(projectAlias: string, field: 'enabled' | 'allowNewReports'): string {
  return `(CASE WHEN json_type(${projectAlias}.settings, '$.reporterPortal') = 'object'
    THEN json_extract(${projectAlias}.settings, '$.reporterPortal.${field}')
    ELSE (SELECT json_extract(value, '$.${field}') FROM settings WHERE key = 'reporter_portal') END)`;
}
