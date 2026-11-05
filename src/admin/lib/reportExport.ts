import type {
  ConsoleError,
  ExportFormat,
  NetworkError,
  Report,
  StorageKeys,
  UserActivity,
} from '@shared/types';

export type { ExportFormat };

export type ExportSection =
  | 'summary'
  | 'environment'
  | 'page'
  | 'console'
  | 'network'
  | 'userActivity'
  | 'storageKeys'
  | 'reporter';

export interface ExportSectionToggles {
  summary: boolean;
  environment: boolean;
  page: boolean;
  console: boolean;
  network: boolean;
  userActivity: boolean;
  storageKeys: boolean;
  reporter: boolean;
}

export interface ExportRedactionToggles {
  stripQueryStrings: boolean;
  truncateConsole: boolean;
  stripInputValues: boolean;
}

export interface ExportOptions {
  sections: ExportSectionToggles;
  redactions: ExportRedactionToggles;
  permalink: string;
}

export const CONSOLE_TRUNCATE_LIMIT = 100;

export function defaultSectionToggles(): ExportSectionToggles {
  return {
    summary: true,
    environment: true,
    page: true,
    console: true,
    network: true,
    userActivity: true,
    storageKeys: true,
    reporter: true,
  };
}

export function defaultRedactionToggles(): ExportRedactionToggles {
  return {
    stripQueryStrings: false,
    truncateConsole: false,
    stripInputValues: false,
  };
}

export function defaultExportOptions(permalink: string): ExportOptions {
  return {
    sections: defaultSectionToggles(),
    redactions: defaultRedactionToggles(),
    permalink,
  };
}

export function buildPermalink(reportId: string, origin?: string): string {
  const base = origin ?? (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base}/admin/reports/${reportId}`;
}

interface NormalizedReport {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  source: string;
  createdAt: string;
  url?: string;
  pageTitle?: string;
  referrer?: string;
  pageLoadTime?: number;
  timezone?: string;
  browser?: { name: string; version: string };
  os?: { name: string; version?: string };
  device?: string;
  viewport?: { width: number; height: number };
  reporterName?: string;
  reporterEmail?: string;
  consoleErrors: ConsoleError[];
  networkErrors: NetworkError[];
  userActivity: UserActivity[];
  storageKeys: StorageKeys;
}

function normalizeReport(report: Report, opts: ExportOptions): NormalizedReport {
  const metadata = report.metadata ?? ({} as Report['metadata']);
  const stripQs = opts.redactions.stripQueryStrings;

  const consoleErrors = (metadata.consoleErrors ?? []).slice();
  const truncatedConsole = opts.redactions.truncateConsole
    ? consoleErrors.slice(-CONSOLE_TRUNCATE_LIMIT)
    : consoleErrors;

  const networkErrors = (metadata.networkErrors ?? []).map((err) => ({
    ...err,
    url: stripQs ? stripQueryString(err.url) : err.url,
  }));

  const userActivity = (metadata.userActivity ?? []).map((event) => {
    let next: UserActivity = { ...event };
    if (stripQs && next.url) {
      next.url = stripQueryString(next.url);
    }
    if (opts.redactions.stripInputValues && next.type === 'input' && next.text) {
      next = { ...next, text: '[redacted]' };
    }
    return next;
  });

  const storageKeys: StorageKeys = {
    cookies: metadata.storageKeys?.cookies ?? [],
    localStorage: metadata.storageKeys?.localStorage ?? [],
    sessionStorage: metadata.storageKeys?.sessionStorage ?? [],
  };

  return {
    id: report.id,
    title: report.title,
    description: report.description ?? '',
    status: report.status,
    priority: report.priority,
    source: report.source ?? 'widget',
    createdAt: report.createdAt,
    url: metadata.url ? (stripQs ? stripQueryString(metadata.url) : metadata.url) : undefined,
    pageTitle: metadata.title,
    referrer: metadata.referrer
      ? stripQs
        ? stripQueryString(metadata.referrer)
        : metadata.referrer
      : undefined,
    pageLoadTime: metadata.pageLoadTime,
    timezone: metadata.timezone,
    browser: metadata.browser
      ? { name: metadata.browser.name, version: metadata.browser.version }
      : undefined,
    os: metadata.device?.os
      ? { name: metadata.device.os, version: metadata.device.osVersion }
      : undefined,
    device: metadata.device?.type,
    viewport: metadata.viewport
      ? { width: metadata.viewport.width, height: metadata.viewport.height }
      : undefined,
    reporterName: report.reporterName,
    reporterEmail: report.reporterEmail,
    consoleErrors: truncatedConsole,
    networkErrors,
    userActivity,
    storageKeys,
  };
}

function stripQueryString(value: string): string {
  if (!value) return value;
  const queryIndex = value.indexOf('?');
  const hashIndex = value.indexOf('#');
  const cuts = [queryIndex, hashIndex].filter((i) => i >= 0);
  if (cuts.length === 0) return value;
  return value.slice(0, Math.min(...cuts));
}

function formatStorageCount(keys: StorageKeys): number {
  return (
    (keys.cookies?.length ?? 0) +
    (keys.localStorage?.length ?? 0) +
    (keys.sessionStorage?.length ?? 0)
  );
}

function hasSummaryContent(n: NormalizedReport): boolean {
  return Boolean(n.title || n.description || n.status || n.priority);
}

function hasPageContent(n: NormalizedReport): boolean {
  return Boolean(n.url || n.pageTitle || n.referrer || n.pageLoadTime || n.timezone);
}

function hasEnvironmentContent(n: NormalizedReport): boolean {
  return Boolean(n.browser || n.os || n.device || n.viewport);
}

function hasReporterContent(n: NormalizedReport): boolean {
  return Boolean(n.reporterName || n.reporterEmail);
}

function joinSections(parts: string[]): string {
  return parts.filter((part) => part.length > 0).join('\n\n');
}

export function toMarkdown(report: Report, opts: ExportOptions): string {
  const n = normalizeReport(report, opts);
  const parts: string[] = [];

  parts.push(`# ${n.title || 'Untitled report'}`);
  parts.push(`[View in BugPin](${opts.permalink})`);

  if (opts.sections.summary && hasSummaryContent(n)) {
    const summaryLines: string[] = ['## Summary'];
    if (n.description) summaryLines.push(n.description);
    summaryLines.push('');
    summaryLines.push(`- **Status:** ${n.status}`);
    summaryLines.push(`- **Priority:** ${n.priority}`);
    summaryLines.push(`- **Source:** ${n.source}`);
    summaryLines.push(`- **Created:** ${n.createdAt}`);
    parts.push(summaryLines.join('\n'));
  }

  if (opts.sections.page && hasPageContent(n)) {
    const lines: string[] = ['## Page'];
    if (n.url) lines.push(`- **URL:** ${n.url}`);
    if (n.pageTitle) lines.push(`- **Title:** ${n.pageTitle}`);
    if (n.referrer) lines.push(`- **Referrer:** ${n.referrer}`);
    if (typeof n.pageLoadTime === 'number') lines.push(`- **Load time:** ${n.pageLoadTime}ms`);
    if (n.timezone) lines.push(`- **Timezone:** ${n.timezone}`);
    parts.push(lines.join('\n'));
  }

  if (opts.sections.environment && hasEnvironmentContent(n)) {
    const lines: string[] = ['## Environment'];
    if (n.browser) lines.push(`- **Browser:** ${n.browser.name} ${n.browser.version}`.trim());
    if (n.os) lines.push(`- **OS:** ${n.os.name}${n.os.version ? ` ${n.os.version}` : ''}`);
    if (n.device) lines.push(`- **Device:** ${n.device}`);
    if (n.viewport) lines.push(`- **Viewport:** ${n.viewport.width}x${n.viewport.height}`);
    parts.push(lines.join('\n'));
  }

  if (opts.sections.console && n.consoleErrors.length > 0) {
    const lines: string[] = [`## Console output (${n.consoleErrors.length})`];
    lines.push('```');
    for (const err of n.consoleErrors) {
      const where = err.source ? ` (${err.source}${err.line ? `:${err.line}` : ''})` : '';
      const ts = err.timestamp ? ` @ ${err.timestamp}` : '';
      lines.push(`[${err.type.toUpperCase()}] ${err.message}${where}${ts}`);
    }
    lines.push('```');
    parts.push(lines.join('\n'));
  }

  if (opts.sections.network && n.networkErrors.length > 0) {
    const lines: string[] = [`## Network errors (${n.networkErrors.length})`];
    lines.push('```');
    for (const err of n.networkErrors) {
      const status = err.status === 0 ? 'NETWORK_ERROR' : String(err.status);
      const ts = err.timestamp ? ` @ ${err.timestamp}` : '';
      lines.push(`${status} ${err.statusText} | ${err.method} ${err.url}${ts}`);
    }
    lines.push('```');
    parts.push(lines.join('\n'));
  }

  if (opts.sections.userActivity && n.userActivity.length > 0) {
    const lines: string[] = [`## User activity (${n.userActivity.length})`];
    for (const event of n.userActivity) {
      lines.push(`- ${formatActivity(event)}`);
    }
    parts.push(lines.join('\n'));
  }

  if (opts.sections.storageKeys && formatStorageCount(n.storageKeys) > 0) {
    const lines: string[] = [`## Storage keys (${formatStorageCount(n.storageKeys)})`];
    if (n.storageKeys.cookies?.length) {
      lines.push(`- **Cookies:** ${n.storageKeys.cookies.join(', ')}`);
    }
    if (n.storageKeys.localStorage?.length) {
      lines.push(`- **localStorage:** ${n.storageKeys.localStorage.join(', ')}`);
    }
    if (n.storageKeys.sessionStorage?.length) {
      lines.push(`- **sessionStorage:** ${n.storageKeys.sessionStorage.join(', ')}`);
    }
    parts.push(lines.join('\n'));
  }

  if (opts.sections.reporter && hasReporterContent(n)) {
    const lines: string[] = ['## Reporter'];
    if (n.reporterName) lines.push(`- **Name:** ${n.reporterName}`);
    if (n.reporterEmail) lines.push(`- **Email:** ${n.reporterEmail}`);
    parts.push(lines.join('\n'));
  }

  return joinSections(parts) + '\n';
}

export function toPlain(report: Report, opts: ExportOptions): string {
  const n = normalizeReport(report, opts);
  const parts: string[] = [];

  parts.push(`${n.title || 'Untitled report'}\nLink: ${opts.permalink}`);

  if (opts.sections.summary && hasSummaryContent(n)) {
    const lines: string[] = ['SUMMARY'];
    if (n.description) {
      lines.push(n.description);
      lines.push('');
    }
    lines.push(`Status: ${n.status}`);
    lines.push(`Priority: ${n.priority}`);
    lines.push(`Source: ${n.source}`);
    lines.push(`Created: ${n.createdAt}`);
    parts.push(lines.join('\n'));
  }

  if (opts.sections.page && hasPageContent(n)) {
    const lines: string[] = ['PAGE'];
    if (n.url) lines.push(`URL: ${n.url}`);
    if (n.pageTitle) lines.push(`Title: ${n.pageTitle}`);
    if (n.referrer) lines.push(`Referrer: ${n.referrer}`);
    if (typeof n.pageLoadTime === 'number') lines.push(`Load time: ${n.pageLoadTime}ms`);
    if (n.timezone) lines.push(`Timezone: ${n.timezone}`);
    parts.push(lines.join('\n'));
  }

  if (opts.sections.environment && hasEnvironmentContent(n)) {
    const lines: string[] = ['ENVIRONMENT'];
    if (n.browser) lines.push(`Browser: ${n.browser.name} ${n.browser.version}`.trim());
    if (n.os) lines.push(`OS: ${n.os.name}${n.os.version ? ` ${n.os.version}` : ''}`);
    if (n.device) lines.push(`Device: ${n.device}`);
    if (n.viewport) lines.push(`Viewport: ${n.viewport.width}x${n.viewport.height}`);
    parts.push(lines.join('\n'));
  }

  if (opts.sections.console && n.consoleErrors.length > 0) {
    const lines: string[] = [`CONSOLE OUTPUT (${n.consoleErrors.length})`];
    for (const err of n.consoleErrors) {
      const where = err.source ? ` (${err.source}${err.line ? `:${err.line}` : ''})` : '';
      const ts = err.timestamp ? ` @ ${err.timestamp}` : '';
      lines.push(`[${err.type.toUpperCase()}] ${err.message}${where}${ts}`);
    }
    parts.push(lines.join('\n'));
  }

  if (opts.sections.network && n.networkErrors.length > 0) {
    const lines: string[] = [`NETWORK ERRORS (${n.networkErrors.length})`];
    for (const err of n.networkErrors) {
      const status = err.status === 0 ? 'NETWORK_ERROR' : String(err.status);
      const ts = err.timestamp ? ` @ ${err.timestamp}` : '';
      lines.push(`${status} ${err.statusText} | ${err.method} ${err.url}${ts}`);
    }
    parts.push(lines.join('\n'));
  }

  if (opts.sections.userActivity && n.userActivity.length > 0) {
    const lines: string[] = [`USER ACTIVITY (${n.userActivity.length})`];
    for (const event of n.userActivity) {
      lines.push(`- ${formatActivity(event)}`);
    }
    parts.push(lines.join('\n'));
  }

  if (opts.sections.storageKeys && formatStorageCount(n.storageKeys) > 0) {
    const lines: string[] = [`STORAGE KEYS (${formatStorageCount(n.storageKeys)})`];
    if (n.storageKeys.cookies?.length) {
      lines.push(`Cookies: ${n.storageKeys.cookies.join(', ')}`);
    }
    if (n.storageKeys.localStorage?.length) {
      lines.push(`localStorage: ${n.storageKeys.localStorage.join(', ')}`);
    }
    if (n.storageKeys.sessionStorage?.length) {
      lines.push(`sessionStorage: ${n.storageKeys.sessionStorage.join(', ')}`);
    }
    parts.push(lines.join('\n'));
  }

  if (opts.sections.reporter && hasReporterContent(n)) {
    const lines: string[] = ['REPORTER'];
    if (n.reporterName) lines.push(`Name: ${n.reporterName}`);
    if (n.reporterEmail) lines.push(`Email: ${n.reporterEmail}`);
    parts.push(lines.join('\n'));
  }

  return joinSections(parts) + '\n';
}

const AI_PROMPT_PREAMBLE = [
  'Please investigate the following bug report. Identify the most likely root cause based on the',
  'available evidence (console errors, network failures, user activity, environment), explain your',
  'reasoning, and suggest concrete next steps a developer can take to reproduce and fix the issue.',
  'If the evidence is insufficient, list the specific information you would need to investigate further.',
].join(' ');

export function toAIPrompt(report: Report, opts: ExportOptions): string {
  const body = toPlain(report, opts);
  return `${AI_PROMPT_PREAMBLE}\n\n--- BUG REPORT ---\n\n${body}--- END BUG REPORT ---\n`;
}

export function toJson(report: Report, opts: ExportOptions): string {
  const n = normalizeReport(report, opts);
  const payload: Record<string, unknown> = {
    permalink: opts.permalink,
    id: n.id,
    title: n.title,
  };

  if (opts.sections.summary && hasSummaryContent(n)) {
    payload.summary = {
      description: n.description || undefined,
      status: n.status,
      priority: n.priority,
      source: n.source,
      createdAt: n.createdAt,
    };
  }

  if (opts.sections.page && hasPageContent(n)) {
    payload.page = {
      url: n.url,
      title: n.pageTitle,
      referrer: n.referrer,
      pageLoadTime: n.pageLoadTime,
      timezone: n.timezone,
    };
  }

  if (opts.sections.environment && hasEnvironmentContent(n)) {
    payload.environment = {
      browser: n.browser,
      os: n.os,
      device: n.device,
      viewport: n.viewport,
    };
  }

  if (opts.sections.console && n.consoleErrors.length > 0) {
    payload.consoleErrors = n.consoleErrors;
  }

  if (opts.sections.network && n.networkErrors.length > 0) {
    payload.networkErrors = n.networkErrors;
  }

  if (opts.sections.userActivity && n.userActivity.length > 0) {
    payload.userActivity = n.userActivity;
  }

  if (opts.sections.storageKeys && formatStorageCount(n.storageKeys) > 0) {
    payload.storageKeys = n.storageKeys;
  }

  if (opts.sections.reporter && hasReporterContent(n)) {
    payload.reporter = {
      name: n.reporterName,
      email: n.reporterEmail,
    };
  }

  return JSON.stringify(payload, null, 2) + '\n';
}

function formatActivity(event: UserActivity): string {
  const time = event.timestamp ? ` @ ${event.timestamp}` : '';
  switch (event.type) {
    case 'button':
      return `button "${event.text ?? ''}"${time}`;
    case 'link':
      return `link "${event.text ?? ''}"${event.url ? ` → ${event.url}` : ''}${time}`;
    case 'input': {
      const kind = event.inputType ?? 'input';
      const value = event.text ? ` "${event.text}"` : '';
      return `input ${kind}${value}${time}`;
    }
    case 'select':
      return `select "${event.text ?? ''}"${time}`;
    case 'checkbox':
      return `checkbox "${event.text ?? ''}"${time}`;
    default:
      return `${event.type} "${event.text ?? ''}"${time}`;
  }
}

export function formatExtension(format: ExportFormat): string {
  switch (format) {
    case 'markdown':
      return 'md';
    case 'plain':
      return 'txt';
    case 'aiPrompt':
      return 'prompt.txt';
    case 'json':
      return 'json';
  }
}

export function formatMimeType(format: ExportFormat): string {
  switch (format) {
    case 'markdown':
      return 'text/markdown;charset=utf-8';
    case 'plain':
    case 'aiPrompt':
      return 'text/plain;charset=utf-8';
    case 'json':
      return 'application/json;charset=utf-8';
  }
}

export function formatLabel(format: ExportFormat): string {
  switch (format) {
    case 'markdown':
      return 'Markdown';
    case 'plain':
      return 'Plain text';
    case 'aiPrompt':
      return 'AI prompt';
    case 'json':
      return 'JSON';
  }
}

export function exportFilename(reportId: string, format: ExportFormat): string {
  return `bugpin-report-${reportId}.${formatExtension(format)}`;
}

export function renderExport(report: Report, format: ExportFormat, opts: ExportOptions): string {
  switch (format) {
    case 'markdown':
      return toMarkdown(report, opts);
    case 'plain':
      return toPlain(report, opts);
    case 'aiPrompt':
      return toAIPrompt(report, opts);
    case 'json':
      return toJson(report, opts);
  }
}

export function sectionCount(report: Report, section: ExportSection): number | null {
  const metadata = report.metadata ?? ({} as Report['metadata']);
  switch (section) {
    case 'console':
      return metadata.consoleErrors?.length ?? 0;
    case 'network':
      return metadata.networkErrors?.length ?? 0;
    case 'userActivity':
      return metadata.userActivity?.length ?? 0;
    case 'storageKeys':
      return (
        (metadata.storageKeys?.cookies?.length ?? 0) +
        (metadata.storageKeys?.localStorage?.length ?? 0) +
        (metadata.storageKeys?.sessionStorage?.length ?? 0)
      );
    case 'summary':
    case 'environment':
    case 'page':
    case 'reporter':
      return null;
  }
}

export function byteSize(value: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(value).length;
  }
  return value.length;
}

export function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}
