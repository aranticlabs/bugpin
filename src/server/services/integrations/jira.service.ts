import { logger } from '../../utils/logger.js';
import { settingsRepo } from '../../database/repositories/settings.repo.js';
import { readFile } from '../../storage/files.js';
import type { Report, FileRecord } from '@shared/types';

const MAX_JIRA_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * 'cloud'  — Atlassian-hosted (*.atlassian.net). Basic auth (email + API token),
 *            REST API v3, ADF description.
 * 'server' — self-hosted Jira Server / Data Center. Bearer auth (personal access
 *            token), REST API v2, wiki-markup description.
 */
export type JiraDeployment = 'cloud' | 'server';

export interface JiraConfig {
  deployment?: JiraDeployment; // defaults to 'cloud'
  domain: string;
  email?: string; // required for cloud (Basic auth); unused for server (Bearer/PAT)
  apiToken: string; // Cloud API token or Server/DC personal access token
  projectKey: string;
  issueType: string;
  labels?: string[];
  customFields?: Record<string, string>;
}

export interface JiraIssueResult {
  success: boolean;
  issueKey?: string;
  issueUrl?: string;
  error?: string;
}

/** Credentials needed to talk to Jira, without a specific issue/project context. */
export interface JiraCredentials {
  deployment?: JiraDeployment;
  domain: string;
  email?: string;
  apiToken: string;
}

interface ReportWithFiles extends Report {
  files?: FileRecord[];
}

// Atlassian Document Format (ADF) node types — Jira Cloud REST API v3 requires
// the issue description as a structured ADF document rather than plain markdown.
interface AdfNode {
  type: string;
  version?: number; // Only present on the top-level "doc" node.
  attrs?: Record<string, unknown>;
  content?: AdfNode[];
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
}

// Helpers

function isCloud(deployment?: JiraDeployment): boolean {
  return deployment !== 'server';
}

/**
 * Build the base URL for a Jira instance.
 * Cloud domains are bare hosts (company.atlassian.net) and default to https.
 * Self-hosted instances may include a scheme, port, or context path
 * (e.g. http://jira.local:8080/jira) — those are preserved.
 */
function baseUrl(domain: string): string {
  const trimmed = domain.trim().replace(/\/+$/, '');
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/** Root of the REST API, version selected by deployment type. */
function apiBase(domain: string, deployment?: JiraDeployment): string {
  return `${baseUrl(domain)}/rest/api/${isCloud(deployment) ? '3' : '2'}`;
}

function authHeader(creds: Pick<JiraCredentials, 'deployment' | 'email' | 'apiToken'>): string {
  if (isCloud(creds.deployment)) {
    const encoded = Buffer.from(`${creds.email ?? ''}:${creds.apiToken}`).toString('base64');
    return `Basic ${encoded}`;
  }
  // Server / Data Center personal access tokens use bearer auth.
  return `Bearer ${creds.apiToken}`;
}

function jsonHeaders(
  creds: Pick<JiraCredentials, 'deployment' | 'email' | 'apiToken'>
): Record<string, string> {
  return {
    Authorization: authHeader(creds),
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

/**
 * Extract a human-readable error message from a Jira API error response.
 */
async function parseJiraError(response: Response): Promise<string> {
  const data = (await response.json().catch(() => null)) as {
    errorMessages?: string[];
    errors?: Record<string, string>;
    message?: string;
  } | null;

  if (data) {
    if (Array.isArray(data.errorMessages) && data.errorMessages.length > 0) {
      return data.errorMessages.join('; ');
    }
    if (data.errors && Object.keys(data.errors).length > 0) {
      return Object.entries(data.errors)
        .map(([field, msg]) => `${field}: ${msg}`)
        .join('; ');
    }
    if (data.message) {
      return data.message;
    }
  }

  return `HTTP ${response.status}`;
}

// Shared report metadata extraction

interface ReportMeta {
  url?: string;
  title?: string;
  referrer?: string;
  timezone?: string;
  pageLoadTime?: number;
  browser?: { name?: string; version?: string };
  device?: { type?: string; os?: string; osVersion?: string };
  viewport?: { width?: number; height?: number };
  timestamp?: string;
  consoleErrors?: Array<{ type: string; message: string; source?: string; line?: number }>;
  networkErrors?: Array<{ url: string; method: string; status: number; statusText: string }>;
}

function extractMeta(report: ReportWithFiles): ReportMeta {
  return (report.metadata ?? {}) as ReportMeta;
}

function reporterLine(report: ReportWithFiles): string | null {
  return report.reporterName
    ? `${report.reporterName}${report.reporterEmail ? ` (${report.reporterEmail})` : ''}`
    : report.reporterEmail || null;
}

// ADF builders (Jira Cloud)

function adfText(text: string, marks?: AdfNode['marks']): AdfNode {
  return marks ? { type: 'text', text, marks } : { type: 'text', text };
}

function adfParagraph(content: AdfNode[]): AdfNode {
  return { type: 'paragraph', content };
}

function adfHeading(level: number, text: string): AdfNode {
  return { type: 'heading', attrs: { level }, content: [adfText(text)] };
}

function adfBulletList(items: AdfNode[][]): AdfNode {
  return {
    type: 'bulletList',
    content: items.map((content) => ({
      type: 'listItem',
      content: [adfParagraph(content)],
    })),
  };
}

/**
 * Build the issue description in Atlassian Document Format (Jira Cloud / v3).
 */
async function buildAdfDescription(report: ReportWithFiles): Promise<AdfNode> {
  const metadata = extractMeta(report);

  const settings = await settingsRepo.getAll();
  const appName = settings.appName || 'BugPin';
  const appUrl = settings.appUrl || '';
  const reportUrl = appUrl ? `${appUrl}/admin/reports/${report.id}` : '';

  const reporterInfo = reporterLine(report);

  const content: AdfNode[] = [];

  // Summary block
  const summaryItems: AdfNode[][] = [];
  summaryItems.push([adfText('URL: ', [{ type: 'strong' }]), adfText(metadata.url || 'N/A')]);
  if (metadata.title) {
    summaryItems.push([adfText('Page Title: ', [{ type: 'strong' }]), adfText(metadata.title)]);
  }
  if (metadata.referrer) {
    summaryItems.push([adfText('Referrer: ', [{ type: 'strong' }]), adfText(metadata.referrer)]);
  }
  if (reporterInfo) {
    summaryItems.push([adfText('Reporter: ', [{ type: 'strong' }]), adfText(reporterInfo)]);
  }
  content.push(adfBulletList(summaryItems));

  // Description
  content.push(adfHeading(3, 'Description'));
  content.push(adfParagraph([adfText(report.description || 'No description provided.')]));

  // Environment
  content.push(adfHeading(3, 'Environment'));
  const envItems: AdfNode[][] = [
    [
      adfText('Browser: ', [{ type: 'strong' }]),
      adfText(`${metadata.browser?.name || 'Unknown'} ${metadata.browser?.version || ''}`.trim()),
    ],
    [
      adfText('Device: ', [{ type: 'strong' }]),
      adfText(
        `${metadata.device?.type || 'Unknown'} (${metadata.device?.os || 'Unknown'}${
          metadata.device?.osVersion ? ' ' + metadata.device.osVersion : ''
        })`
      ),
    ],
    [
      adfText('Viewport: ', [{ type: 'strong' }]),
      adfText(`${metadata.viewport?.width || '?'}x${metadata.viewport?.height || '?'}`),
    ],
    [adfText('Timezone: ', [{ type: 'strong' }]), adfText(metadata.timezone || 'Unknown')],
    [
      adfText('Page Load Time: ', [{ type: 'strong' }]),
      adfText(metadata.pageLoadTime ? `${metadata.pageLoadTime}ms` : 'N/A'),
    ],
    [adfText('Timestamp: ', [{ type: 'strong' }]), adfText(metadata.timestamp || report.createdAt)],
    [adfText('Priority: ', [{ type: 'strong' }]), adfText(String(report.priority))],
  ];
  content.push(adfBulletList(envItems));

  // Console errors
  if (metadata.consoleErrors && metadata.consoleErrors.length > 0) {
    content.push(adfHeading(3, `Console Output (${metadata.consoleErrors.length})`));
    content.push(
      adfBulletList(
        metadata.consoleErrors.map((e) => [
          adfText(`[${e.type.toUpperCase()}] `, [{ type: 'strong' }]),
          adfText(`${e.message}${e.source ? ` (${e.source}${e.line ? ':' + e.line : ''})` : ''}`),
        ])
      )
    );
  }

  // Network errors
  if (metadata.networkErrors && metadata.networkErrors.length > 0) {
    content.push(adfHeading(3, `Network Errors (${metadata.networkErrors.length})`));
    content.push(
      adfBulletList(
        metadata.networkErrors.map((e) => [
          adfText(`${e.status === 0 ? 'Failed' : e.status} ${e.statusText} `, [{ type: 'strong' }]),
          adfText(`${e.method} ${e.url}`),
        ])
      )
    );
  }

  // Link back to the report
  if (reportUrl) {
    content.push(
      adfParagraph([
        adfText(`View full report in ${appName}`, [{ type: 'link', attrs: { href: reportUrl } }]),
      ])
    );
  }

  content.push(adfParagraph([adfText(`Reported via ${appName}`, [{ type: 'em' }])]));

  return { type: 'doc', version: 1, content };
}

/**
 * Build the issue description in Jira wiki markup (Server / Data Center / v2).
 */
async function buildWikiDescription(report: ReportWithFiles): Promise<string> {
  const metadata = extractMeta(report);

  const settings = await settingsRepo.getAll();
  const appName = settings.appName || 'BugPin';
  const appUrl = settings.appUrl || '';
  const reportUrl = appUrl ? `${appUrl}/admin/reports/${report.id}` : '';

  const reporterInfo = reporterLine(report);

  let body = `*URL:* ${metadata.url || 'N/A'}\n`;
  if (metadata.title) body += `*Page Title:* ${metadata.title}\n`;
  if (metadata.referrer) body += `*Referrer:* ${metadata.referrer}\n`;
  if (reporterInfo) body += `*Reporter:* ${reporterInfo}\n`;

  body += `\nh3. Description\n${report.description || 'No description provided.'}\n`;

  body += `\nh3. Environment\n`;
  body += `* *Browser:* ${`${metadata.browser?.name || 'Unknown'} ${metadata.browser?.version || ''}`.trim()}\n`;
  body += `* *Device:* ${metadata.device?.type || 'Unknown'} (${metadata.device?.os || 'Unknown'}${
    metadata.device?.osVersion ? ' ' + metadata.device.osVersion : ''
  })\n`;
  body += `* *Viewport:* ${metadata.viewport?.width || '?'}x${metadata.viewport?.height || '?'}\n`;
  body += `* *Timezone:* ${metadata.timezone || 'Unknown'}\n`;
  body += `* *Page Load Time:* ${metadata.pageLoadTime ? `${metadata.pageLoadTime}ms` : 'N/A'}\n`;
  body += `* *Timestamp:* ${metadata.timestamp || report.createdAt}\n`;
  body += `* *Priority:* ${report.priority}\n`;

  if (metadata.consoleErrors && metadata.consoleErrors.length > 0) {
    body += `\nh3. Console Output (${metadata.consoleErrors.length})\n`;
    for (const e of metadata.consoleErrors) {
      body += `* *[${e.type.toUpperCase()}]* ${e.message}${
        e.source ? ` (${e.source}${e.line ? ':' + e.line : ''})` : ''
      }\n`;
    }
  }

  if (metadata.networkErrors && metadata.networkErrors.length > 0) {
    body += `\nh3. Network Errors (${metadata.networkErrors.length})\n`;
    for (const e of metadata.networkErrors) {
      body += `* *${e.status === 0 ? 'Failed' : e.status} ${e.statusText}* ${e.method} ${e.url}\n`;
    }
  }

  if (reportUrl) {
    body += `\n[View full report in ${appName}|${reportUrl}]\n`;
  }

  body += `\n----\n_Reported via ${appName}_`;

  return body;
}

/**
 * Read a file buffer from local storage or a remote URL (S3).
 */
async function readFileBuffer(filePath: string): Promise<Buffer | null> {
  if (filePath.startsWith('https://') || filePath.startsWith('http://')) {
    try {
      const response = await fetch(filePath);
      if (!response.ok) {
        logger.warn(`Failed to fetch remote file: HTTP ${response.status}`, { path: filePath });
        return null;
      }
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      logger.warn('Error fetching remote file', { path: filePath, error });
      return null;
    }
  }

  return readFile(filePath);
}

/**
 * Upload a report's files to a Jira issue as attachments.
 */
async function uploadAttachments(
  issueKey: string,
  files: FileRecord[],
  config: JiraConfig
): Promise<void> {
  const url = `${apiBase(config.domain, config.deployment)}/issue/${issueKey}/attachments`;

  for (const file of files) {
    if (file.sizeBytes > MAX_JIRA_UPLOAD_BYTES) {
      logger.warn(
        `Skipping Jira attachment ${file.filename} (${file.sizeBytes} bytes) — exceeds 10 MB limit`
      );
      continue;
    }

    const buffer = await readFileBuffer(file.path);
    if (!buffer) {
      logger.warn(`Could not read file ${file.filename} at ${file.path}`);
      continue;
    }

    try {
      const form = new FormData();
      form.append('file', new Blob([buffer], { type: file.mimeType }), file.filename);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: authHeader(config),
          Accept: 'application/json',
          // Required by Jira to accept multipart attachment uploads.
          'X-Atlassian-Token': 'no-check',
        },
        body: form,
      });

      if (!response.ok) {
        const message = await parseJiraError(response);
        logger.warn(`Jira attachment upload failed for ${file.filename}: ${message}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.warn(`Failed to upload attachment ${file.filename} to Jira: ${message}`);
    }
  }
}

// Public API

/**
 * Create a Jira issue from a BugPin report.
 */
export async function createJiraIssue(
  report: ReportWithFiles,
  jiraConfig: JiraConfig,
  options?: { labels?: string[] }
): Promise<JiraIssueResult> {
  const { domain, email, apiToken, projectKey, issueType, deployment } = jiraConfig;

  if (!domain || !apiToken || !projectKey || !issueType) {
    return {
      success: false,
      error: 'Jira configuration incomplete. Required: domain, apiToken, projectKey, issueType',
    };
  }
  if (isCloud(deployment) && !email) {
    return { success: false, error: 'Jira Cloud requires an account email' };
  }

  try {
    // v3 (cloud) wants ADF; v2 (server/DC) wants a wiki-markup string.
    const description = isCloud(deployment)
      ? await buildAdfDescription(report)
      : await buildWikiDescription(report);

    const labels = [...(jiraConfig.labels || []), ...(options?.labels || [])]
      // Jira labels cannot contain spaces.
      .map((label) => label.trim().replace(/\s+/g, '-'))
      .filter(Boolean);

    const fields: Record<string, unknown> = {
      project: { key: projectKey },
      summary: report.title,
      issuetype: { name: issueType },
      description,
    };

    if (labels.length > 0) {
      fields.labels = labels;
    }

    // Merge any configured custom fields (e.g. { customfield_10010: "value" }).
    if (jiraConfig.customFields) {
      for (const [key, value] of Object.entries(jiraConfig.customFields)) {
        fields[key] = value;
      }
    }

    const response = await fetch(`${apiBase(domain, deployment)}/issue`, {
      method: 'POST',
      headers: jsonHeaders(jiraConfig),
      body: JSON.stringify({ fields }),
    });

    if (!response.ok) {
      const message = await parseJiraError(response);
      logger.error(`Jira API error: ${message}`);
      return { success: false, error: `Jira API error: ${message}` };
    }

    const issue = (await response.json()) as { key: string };
    const issueUrl = `${baseUrl(domain)}/browse/${issue.key}`;

    // Upload attachments after the issue is created (best-effort).
    if (report.files && report.files.length > 0) {
      await uploadAttachments(issue.key, report.files, jiraConfig);
    }

    logger.info(`Created Jira issue ${issue.key} for report ${report.id}`);

    return { success: true, issueKey: issue.key, issueUrl };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Failed to create Jira issue: ${message}`);
    return { success: false, error: message };
  }
}

/**
 * Test a Jira connection and verify the configured project is accessible.
 */
export async function testJiraConnection(jiraConfig: JiraConfig): Promise<{
  success: boolean;
  error?: string;
  projectName?: string;
}> {
  const { domain, email, apiToken, projectKey, deployment } = jiraConfig;

  if (!domain || !apiToken || !projectKey) {
    return { success: false, error: 'Missing required fields: domain, apiToken, projectKey' };
  }
  if (isCloud(deployment) && !email) {
    return { success: false, error: 'Jira Cloud requires an account email' };
  }

  try {
    // Verify credentials.
    const meResponse = await fetch(`${apiBase(domain, deployment)}/myself`, {
      headers: jsonHeaders(jiraConfig),
    });

    if (!meResponse.ok) {
      if (meResponse.status === 401 || meResponse.status === 403) {
        return {
          success: false,
          error: isCloud(deployment)
            ? 'Invalid email or API token'
            : 'Invalid personal access token',
        };
      }
      return { success: false, error: `Jira API error: HTTP ${meResponse.status}` };
    }

    // Verify the project exists and is accessible.
    const projectResponse = await fetch(
      `${apiBase(domain, deployment)}/project/${encodeURIComponent(projectKey)}`,
      { headers: jsonHeaders(jiraConfig) }
    );

    if (!projectResponse.ok) {
      if (projectResponse.status === 404) {
        return { success: false, error: 'Project not found or no access' };
      }
      return { success: false, error: `Jira API error: HTTP ${projectResponse.status}` };
    }

    const project = (await projectResponse.json()) as { name: string; key: string };

    return { success: true, projectName: `${project.name} (${project.key})` };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

/**
 * Fetch projects accessible by the given credentials.
 */
export async function fetchJiraProjects(creds: JiraCredentials): Promise<{
  success: boolean;
  projects?: Array<{ key: string; name: string }>;
  error?: string;
}> {
  const { domain, email, apiToken, deployment } = creds;

  if (!domain || !apiToken) {
    return { success: false, error: 'Domain and API token are required' };
  }
  if (isCloud(deployment) && !email) {
    return { success: false, error: 'Jira Cloud requires an account email' };
  }

  try {
    const projects: Array<{ key: string; name: string }> = [];

    if (isCloud(deployment)) {
      // Cloud exposes a paginated project search endpoint.
      let startAt = 0;
      const maxResults = 50;

      while (startAt < 500) {
        const response = await fetch(
          `${apiBase(domain, deployment)}/project/search?startAt=${startAt}&maxResults=${maxResults}`,
          { headers: jsonHeaders(creds) }
        );

        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            return { success: false, error: 'Invalid email or API token' };
          }
          return { success: false, error: `Jira API error: HTTP ${response.status}` };
        }

        const data = (await response.json()) as {
          values: Array<{ key: string; name: string }>;
          isLast: boolean;
        };

        projects.push(...data.values.map((p) => ({ key: p.key, name: p.name })));

        if (data.isLast || data.values.length === 0) break;
        startAt += maxResults;
      }
    } else {
      // Server / Data Center returns all visible projects as a flat array.
      const response = await fetch(`${apiBase(domain, deployment)}/project`, {
        headers: jsonHeaders(creds),
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          return { success: false, error: 'Invalid personal access token' };
        }
        return { success: false, error: `Jira API error: HTTP ${response.status}` };
      }

      const data = (await response.json()) as Array<{ key: string; name: string }>;
      projects.push(...data.map((p) => ({ key: p.key, name: p.name })));
    }

    return { success: true, projects };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

/**
 * Fetch the issue types available for a given project.
 */
export async function fetchJiraIssueTypes(
  creds: JiraCredentials & { projectKey: string }
): Promise<{
  success: boolean;
  issueTypes?: Array<{ id: string; name: string }>;
  error?: string;
}> {
  const { domain, email, apiToken, projectKey, deployment } = creds;

  if (!domain || !apiToken || !projectKey) {
    return { success: false, error: 'Domain, API token, and project key are required' };
  }
  if (isCloud(deployment) && !email) {
    return { success: false, error: 'Jira Cloud requires an account email' };
  }

  try {
    const response = await fetch(
      `${apiBase(domain, deployment)}/project/${encodeURIComponent(projectKey)}`,
      { headers: jsonHeaders(creds) }
    );

    if (!response.ok) {
      if (response.status === 404) {
        return { success: false, error: 'Project not found or no access' };
      }
      return { success: false, error: `Jira API error: HTTP ${response.status}` };
    }

    const project = (await response.json()) as {
      issueTypes?: Array<{ id: string; name: string; subtask?: boolean }>;
    };

    const issueTypes = (project.issueTypes || [])
      // Subtask types can't be created standalone; exclude them.
      .filter((t) => !t.subtask)
      .map((t) => ({ id: t.id, name: t.name }));

    return { success: true, issueTypes };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

export const jiraService = {
  createIssue: createJiraIssue,
  testConnection: testJiraConnection,
  fetchProjects: fetchJiraProjects,
  fetchIssueTypes: fetchJiraIssueTypes,
};
