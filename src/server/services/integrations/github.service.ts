import { logger } from '../../utils/logger.js';
import { settingsRepo } from '../../database/repositories/settings.repo.js';
import type { Report, FileRecord } from '@shared/types';

export interface GitHubConfig {
  owner: string;
  repo: string;
  accessToken: string;
  labels?: string[];
  assignees?: string[];
}

export interface GitHubIssueResult {
  success: boolean;
  issueNumber?: number;
  issueUrl?: string;
  error?: string;
}

interface ReportWithFiles extends Report {
  files?: FileRecord[];
}

/**
 * Create a GitHub issue from a BugPin report
 */
export async function createGitHubIssue(
  report: ReportWithFiles,
  githubConfig: GitHubConfig,
  options?: { labels?: string[]; assignees?: string[] },
): Promise<GitHubIssueResult> {
  const { owner, repo, accessToken } = githubConfig;

  if (!owner || !repo || !accessToken) {
    return {
      success: false,
      error: 'GitHub configuration incomplete. Required: owner, repo, accessToken',
    };
  }

  try {
    // Build issue body
    const body = await buildIssueBody(report);

    // Merge labels and assignees
    const labels = [...(githubConfig.labels || []), ...(options?.labels || [])];
    const assignees = [...(githubConfig.assignees || []), ...(options?.assignees || [])];

    // Create issue via GitHub API
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${accessToken}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: report.title,
        body,
        labels: labels.length > 0 ? labels : undefined,
        assignees: assignees.length > 0 ? assignees : undefined,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = (errorData as { message?: string }).message || `HTTP ${response.status}`;
      logger.error(`GitHub API error: ${errorMessage}`);
      return {
        success: false,
        error: `GitHub API error: ${errorMessage}`,
      };
    }

    const issue = (await response.json()) as { number: number; html_url: string };

    logger.info(`Created GitHub issue #${issue.number} for report ${report.id}`);

    return {
      success: true,
      issueNumber: issue.number,
      issueUrl: issue.html_url,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Failed to create GitHub issue: ${message}`);
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Test GitHub connection and permissions
 */
export async function testGitHubConnection(githubConfig: GitHubConfig): Promise<{
  success: boolean;
  error?: string;
  repoName?: string;
}> {
  const { owner, repo, accessToken } = githubConfig;

  if (!owner || !repo || !accessToken) {
    return {
      success: false,
      error: 'Missing required fields: owner, repo, accessToken',
    };
  }

  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${accessToken}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return { success: false, error: 'Repository not found or no access' };
      }
      if (response.status === 401) {
        return { success: false, error: 'Invalid access token' };
      }
      return { success: false, error: `GitHub API error: HTTP ${response.status}` };
    }

    const repoData = (await response.json()) as { full_name: string };

    return {
      success: true,
      repoName: repoData.full_name,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Build the issue body markdown from a report
 */
async function buildIssueBody(report: ReportWithFiles): Promise<string> {
  const metadata = report.metadata as {
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
    userActivity?: Array<{
      type: string;
      text?: string;
      url?: string;
      inputType?: string;
      timestamp: string;
    }>;
    storageKeys?: { cookies?: string[]; localStorage?: string[]; sessionStorage?: string[] };
  };

  const settings = await settingsRepo.getAll();
  const appUrl = settings.appUrl || '';
  const reportUrl = appUrl ? `${appUrl}/admin/reports/${report.id}` : '';

  let body = `## Bug Report

**URL:** ${metadata.url || 'N/A'}
${metadata.title ? `**Page Title:** ${metadata.title}` : ''}
${metadata.referrer ? `**Referrer:** ${metadata.referrer}` : ''}

### Description
${report.description || 'No description provided.'}

### Environment
| Property | Value |
|----------|-------|
| Browser | ${metadata.browser?.name || 'Unknown'} ${metadata.browser?.version || ''} |
| Device | ${metadata.device?.type || 'Unknown'} (${metadata.device?.os || 'Unknown'}${metadata.device?.osVersion ? ' ' + metadata.device.osVersion : ''}) |
| Viewport | ${metadata.viewport?.width || '?'}x${metadata.viewport?.height || '?'} |
| Timezone | ${metadata.timezone || 'Unknown'} |
| Page Load Time | ${metadata.pageLoadTime ? metadata.pageLoadTime + 'ms' : 'N/A'} |
| Timestamp | ${metadata.timestamp || report.createdAt} |
| Priority | ${report.priority} |
`;

  // Add console errors if present
  if (metadata.consoleErrors && metadata.consoleErrors.length > 0) {
    body += `
### Console Output (${metadata.consoleErrors.length})
${metadata.consoleErrors.map((e) => `- \`[${e.type.toUpperCase()}]\` ${e.message}${e.source ? ` _(${e.source}${e.line ? ':' + e.line : ''})_` : ''}`).join('\n')}
`;
  }

  // Add network errors if present
  if (metadata.networkErrors && metadata.networkErrors.length > 0) {
    body += `
### Network Errors (${metadata.networkErrors.length})
| Status | Method | URL |
|--------|--------|-----|
${metadata.networkErrors.map((e) => `| ${e.status === 0 ? 'Failed' : e.status} ${e.statusText} | ${e.method} | ${e.url} |`).join('\n')}
`;
  }

  // Add user activity trail if present
  if (metadata.userActivity && metadata.userActivity.length > 0) {
    body += `
### User Activity Trail (${metadata.userActivity.length} events)
<details>
<summary>Click to expand</summary>

| Time | Type | Details |
|------|------|---------|
${metadata.userActivity
  .map((a) => {
    const time = new Date(a.timestamp).toLocaleTimeString();
    let details = '';
    if (a.type === 'button') details = a.text ? `"${a.text}"` : '';
    else if (a.type === 'link')
      details = `${a.text ? '"' + a.text + '"' : ''} ${a.url ? '→ ' + a.url : ''}`;
    else if (a.type === 'input')
      details = `${a.inputType || 'text'} ${a.text ? '"' + a.text + '"' : ''}`;
    else if (a.type === 'select' || a.type === 'checkbox') details = a.text ? `"${a.text}"` : '';
    else details = a.text ? `"${a.text}"` : '';
    return `| ${time} | ${a.type.toUpperCase()} | ${details} |`;
  })
  .join('\n')}

</details>
`;
  }

  // Add storage keys if present
  const hasStorageKeys =
    metadata.storageKeys &&
    ((metadata.storageKeys.cookies?.length || 0) > 0 ||
      (metadata.storageKeys.localStorage?.length || 0) > 0 ||
      (metadata.storageKeys.sessionStorage?.length || 0) > 0);
  if (hasStorageKeys) {
    const totalKeys =
      (metadata.storageKeys?.cookies?.length || 0) +
      (metadata.storageKeys?.localStorage?.length || 0) +
      (metadata.storageKeys?.sessionStorage?.length || 0);
    body += `
### Storage Keys (${totalKeys})
<details>
<summary>Click to expand</summary>

`;
    if (metadata.storageKeys?.cookies?.length) {
      body += `**Cookies:** \`${metadata.storageKeys.cookies.join('`, `')}\`\n\n`;
    }
    if (metadata.storageKeys?.localStorage?.length) {
      body += `**LocalStorage:** \`${metadata.storageKeys.localStorage.join('`, `')}\`\n\n`;
    }
    if (metadata.storageKeys?.sessionStorage?.length) {
      body += `**SessionStorage:** \`${metadata.storageKeys.sessionStorage.join('`, `')}\`\n\n`;
    }
    body += `</details>
`;
  }

  // Add screenshots if available
  if (report.files && report.files.length > 0) {
    const screenshots = report.files.filter((f) => f.type === 'screenshot');
    if (screenshots.length > 0) {
      body += `
### Screenshots
`;
      for (const screenshot of screenshots) {
        // Generate public URL for the screenshot
        const imageUrl = appUrl
          ? `${appUrl}/api/public/files/${report.id}/${screenshot.filename}`
          : '';
        if (imageUrl) {
          body += `
![${screenshot.filename}](${imageUrl})
`;
        }
      }
    }
  }

  // Add link to BugPin report if available
  if (reportUrl) {
    body += `
> [View full report in BugPin](${reportUrl})
`;
  }

  body += `
---
*Reported via [BugPin](https://github.com/AranticDev/bugpin)*`;

  return body;
}

/**
 * Fetch repositories accessible by the given token
 * Handles pagination to fetch all repos (up to 500)
 */
export async function fetchGitHubRepositories(accessToken: string): Promise<{
  success: boolean;
  repositories?: Array<{ owner: string; name: string; fullName: string; private: boolean }>;
  error?: string;
}> {
  if (!accessToken || !accessToken.trim()) {
    return { success: false, error: 'Access token is required' };
  }

  try {
    const allRepos: Array<{
      name: string;
      full_name: string;
      owner: { login: string };
      private: boolean;
    }> = [];

    let page = 1;
    const maxPages = 5; // Limit to 500 repos (5 pages * 100 per page)

    while (page <= maxPages) {
      // Fetch repos with all affiliations (owner, collaborator, org member)
      const url = `https://api.github.com/user/repos?per_page=100&page=${page}&sort=full_name&affiliation=owner,collaborator,organization_member`;

      const response = await fetch(url, {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${accessToken}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          return { success: false, error: 'Invalid access token' };
        }
        if (response.status === 403) {
          return { success: false, error: 'Token does not have permission to list repositories' };
        }
        return { success: false, error: `GitHub API error: HTTP ${response.status}` };
      }

      const repos = (await response.json()) as Array<{
        name: string;
        full_name: string;
        owner: { login: string };
        private: boolean;
      }>;

      if (repos.length === 0) {
        break; // No more repos
      }

      allRepos.push(...repos);

      // Check if there are more pages
      const linkHeader = response.headers.get('Link');
      if (!linkHeader || !linkHeader.includes('rel="next"')) {
        break; // No more pages
      }

      page++;
    }

    const repositories = allRepos.map((repo) => ({
      owner: repo.owner.login,
      name: repo.name,
      fullName: repo.full_name,
      private: repo.private,
    }));

    return { success: true, repositories };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

/**
 * Fetch labels from a GitHub repository
 */
export async function fetchGitHubLabels(
  accessToken: string,
  owner: string,
  repo: string,
): Promise<{
  success: boolean;
  labels?: Array<{ name: string; color: string; description: string | null }>;
  error?: string;
}> {
  if (!accessToken || !owner || !repo) {
    return { success: false, error: 'Access token, owner, and repo are required' };
  }

  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/labels?per_page=100`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${accessToken}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    );

    if (!response.ok) {
      if (response.status === 404) {
        return { success: false, error: 'Repository not found or no access' };
      }
      return { success: false, error: `GitHub API error: HTTP ${response.status}` };
    }

    const data = (await response.json()) as Array<{
      name: string;
      color: string;
      description: string | null;
    }>;

    return {
      success: true,
      labels: data.map((label) => ({
        name: label.name,
        color: label.color,
        description: label.description,
      })),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

/**
 * Fetch assignees (collaborators) from a GitHub repository
 */
export async function fetchGitHubAssignees(
  accessToken: string,
  owner: string,
  repo: string,
): Promise<{
  success: boolean;
  assignees?: Array<{ login: string; avatarUrl: string }>;
  error?: string;
}> {
  if (!accessToken || !owner || !repo) {
    return { success: false, error: 'Access token, owner, and repo are required' };
  }

  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/assignees?per_page=100`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${accessToken}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    );

    if (!response.ok) {
      if (response.status === 404) {
        return { success: false, error: 'Repository not found or no access' };
      }
      return { success: false, error: `GitHub API error: HTTP ${response.status}` };
    }

    const data = (await response.json()) as Array<{
      login: string;
      avatar_url: string;
    }>;

    return {
      success: true,
      assignees: data.map((user) => ({
        login: user.login,
        avatarUrl: user.avatar_url,
      })),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

/**
 * Update an existing GitHub issue
 */
export async function updateGitHubIssue(
  issueNumber: number,
  report: ReportWithFiles,
  githubConfig: GitHubConfig,
): Promise<GitHubIssueResult> {
  const { owner, repo, accessToken } = githubConfig;

  if (!owner || !repo || !accessToken) {
    return {
      success: false,
      error: 'GitHub configuration incomplete. Required: owner, repo, accessToken',
    };
  }

  try {
    // Build updated issue body
    const body = buildIssueBody(report);

    // Map report status to GitHub issue state
    const state = report.status === 'resolved' || report.status === 'closed' ? 'closed' : 'open';

    // Update issue via GitHub API
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`,
      {
        method: 'PATCH',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${accessToken}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: report.title,
          body,
          state,
        }),
      },
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = (errorData as { message?: string }).message || `HTTP ${response.status}`;
      logger.error(`GitHub API error updating issue: ${errorMessage}`);
      return {
        success: false,
        error: `GitHub API error: ${errorMessage}`,
      };
    }

    const issue = (await response.json()) as { number: number; html_url: string };

    logger.info(`Updated GitHub issue #${issue.number} for report ${report.id}`);

    return {
      success: true,
      issueNumber: issue.number,
      issueUrl: issue.html_url,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Failed to update GitHub issue: ${message}`);
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Get a GitHub issue by number
 */
export async function getGitHubIssue(
  issueNumber: number,
  githubConfig: GitHubConfig,
): Promise<{
  success: boolean;
  issue?: {
    number: number;
    state: 'open' | 'closed';
    title: string;
    body: string | null;
    html_url: string;
  };
  error?: string;
}> {
  const { owner, repo, accessToken } = githubConfig;

  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${accessToken}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    );

    if (!response.ok) {
      if (response.status === 404) {
        return { success: false, error: 'Issue not found' };
      }
      return { success: false, error: `GitHub API error: HTTP ${response.status}` };
    }

    const issue = (await response.json()) as {
      number: number;
      state: 'open' | 'closed';
      title: string;
      body: string | null;
      html_url: string;
    };

    return { success: true, issue };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

/**
 * Create a webhook for repository events
 */
export async function createGitHubWebhook(
  githubConfig: GitHubConfig,
  webhookUrl: string,
  webhookSecret: string,
): Promise<{
  success: boolean;
  webhookId?: string;
  error?: string;
}> {
  const { owner, repo, accessToken } = githubConfig;

  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/hooks`, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${accessToken}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'web',
        active: true,
        events: ['issues'],
        config: {
          url: webhookUrl,
          content_type: 'json',
          secret: webhookSecret,
          insecure_ssl: '0',
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = (errorData as { message?: string }).message || `HTTP ${response.status}`;

      // Check for common permission errors
      if (response.status === 404) {
        return {
          success: false,
          error: 'Repository not found or token lacks admin:repo_hook permission',
        };
      }
      if (response.status === 422) {
        // Webhook might already exist
        return { success: false, error: 'Webhook already exists or validation failed' };
      }

      return { success: false, error: `GitHub API error: ${errorMessage}` };
    }

    const webhook = (await response.json()) as { id: number };

    logger.info(`Created GitHub webhook ${webhook.id} for ${owner}/${repo}`);

    return { success: true, webhookId: String(webhook.id) };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Failed to create GitHub webhook: ${message}`);
    return { success: false, error: message };
  }
}

/**
 * Delete a GitHub webhook
 */
export async function deleteGitHubWebhook(
  githubConfig: GitHubConfig,
  webhookId: string,
): Promise<{ success: boolean; error?: string }> {
  const { owner, repo, accessToken } = githubConfig;

  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/hooks/${webhookId}`,
      {
        method: 'DELETE',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${accessToken}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    );

    if (!response.ok && response.status !== 404) {
      return { success: false, error: `GitHub API error: HTTP ${response.status}` };
    }

    logger.info(`Deleted GitHub webhook ${webhookId} from ${owner}/${repo}`);

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Failed to delete GitHub webhook: ${message}`);
    return { success: false, error: message };
  }
}

export const githubService = {
  createIssue: createGitHubIssue,
  updateIssue: updateGitHubIssue,
  getIssue: getGitHubIssue,
  testConnection: testGitHubConnection,
  fetchRepositories: fetchGitHubRepositories,
  fetchLabels: fetchGitHubLabels,
  fetchAssignees: fetchGitHubAssignees,
  createWebhook: createGitHubWebhook,
  deleteWebhook: deleteGitHubWebhook,
};
