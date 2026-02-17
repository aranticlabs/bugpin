/**
 * Generate a prefixed unique ID
 * @param prefix - Entity type prefix (e.g., 'rpt' for reports, 'proj' for projects)
 * @returns Prefixed UUID like 'rpt_abc123...'
 */
export function generateId(prefix: string): string {
  const uuid = crypto.randomUUID().replace(/-/g, '');
  return `${prefix}_${uuid}`;
}

/**
 * Generate a project API key
 * @returns API key like 'proj_xxxxxxxxxxxxx'
 */
export function generateApiKey(): string {
  return generateId('proj');
}

/**
 * Generate a session ID
 * @returns Session ID like 'sess_xxxxxxxxxxxxx'
 */
export function generateSessionId(): string {
  return generateId('sess');
}

/**
 * Generate a file ID
 * @returns File ID like 'file_xxxxxxxxxxxxx'
 */
export function generateFileId(): string {
  return generateId('file');
}

/**
 * Generate a user ID
 * @returns User ID like 'usr_xxxxxxxxxxxxx'
 */
export function generateUserId(): string {
  return generateId('usr');
}

/**
 * Generate a report ID
 * @returns Report ID like 'rpt_xxxxxxxxxxxxx'
 */
export function generateReportId(): string {
  return generateId('rpt');
}

/**
 * Generate a webhook ID
 * @returns Webhook ID like 'whk_xxxxxxxxxxxxx'
 */
export function generateWebhookId(): string {
  return generateId('whk');
}

/**
 * Generate an API token ID
 * @returns API token ID like 'tok_xxxxxxxxxxxxx'
 */
export function generateApiTokenId(): string {
  return generateId('tok');
}

/**
 * Generate an API token value
 * @returns API token like 'bpat_xxxxxxxxxxxxx' (BugPin API Token)
 */
export function generateApiToken(): string {
  return generateId('bpat');
}
