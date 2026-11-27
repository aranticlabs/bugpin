import {
  portalReportsRepo,
  type ListRow,
  type PortalFileRow,
  type PortalScope,
} from '../database/repositories/portal-reports.repo.js';
import { reportHistoryRepo } from '../database/repositories/report-history.repo.js';
import { settingsCacheService } from './settings-cache.service.js';
import { createStoredFileHandle, type StoredFileHandle } from '../storage/files.js';
import {
  portalCursorSchema,
  type PortalReportQuery,
  type PortalReportCursor,
} from '../utils/portal-schemas.js';
import { Result } from '../utils/result.js';
import { REPORT_STATUSES } from '@shared/types';
import { stripUrlQueryAndFragment } from '@shared/privacy';
import type {
  PortalFile,
  PortalLatestReply,
  PortalProject,
  PortalReportBoard,
  PortalReportDetail,
  PortalReportEnvironment,
  PortalReportList,
  PortalReportSummary,
  PortalMessage,
  PortalStatusEvent,
} from '@shared/portal-types';
import type { FileRecord, ReportMessage, ReportMetadata, ReportStatus } from '@shared/types';

function toPortalFile(reportId: string, file: PortalFileRow | FileRecord): PortalFile {
  return {
    id: file.id,
    type: file.type,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    width: file.width ?? null,
    height: file.height ?? null,
    url: `/api/portal/reports/${encodeURIComponent(reportId)}/files/${encodeURIComponent(file.id)}`,
  };
}

function toPortalMessage(
  message: Pick<
    ReportMessage,
    'id' | 'authorKind' | 'authorName' | 'reporterId' | 'body' | 'createdAt'
  >,
  reporterId: string,
  files: PortalFile[]
): PortalMessage {
  const previous = isPreviousReporter(message, reporterId);
  return {
    id: message.id,
    authorKind: message.authorKind,
    authorName: previous ? '' : message.authorName,
    isPreviousReporter: previous,
    isOwn: message.authorKind === 'reporter' && message.reporterId === reporterId,
    body: message.body,
    createdAt: message.createdAt,
    files,
  };
}

function isPreviousReporter(
  message: { authorKind: string; reporterId: string | null },
  reporterId: string
): boolean {
  return message.authorKind === 'reporter' && message.reporterId !== reporterId;
}

function latestReply(row: ListRow, perspective: string): PortalLatestReply | null {
  if (!row.latestAuthorKind || row.latestBody === null || !row.latestCreatedAt) return null;
  const message = { authorKind: row.latestAuthorKind, reporterId: row.latestReporterId };
  const previous = isPreviousReporter(message, perspective);
  return {
    authorKind: row.latestAuthorKind,
    authorName: previous ? '' : (row.latestAuthorName ?? ''),
    isOwn: row.latestAuthorKind === 'reporter' && row.latestReporterId === perspective,
    isPreviousReporter: previous,
    body: row.latestBody,
    fileCount: row.latestFileCount,
    createdAt: row.latestCreatedAt,
  };
}

function toSummary(row: ListRow, scope: PortalScope): PortalReportSummary {
  // The team view shows each report as its current owner sees it.
  const perspective = scope.kind === 'reporter' ? scope.reporterId : (row.ownerId ?? '');
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    project: { id: row.projectId, name: row.projectName },
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    unread: row.unread === 1,
    replyCount: row.replyCount,
    latestReply: latestReply(row, perspective),
  };
}

function text(value: unknown, maxLength = 200): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : null;
}

function dimension(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : null;
}

/** Keeps http(s) addresses only, without credentials, query or fragment */
function webAddress(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  url.username = '';
  url.password = '';
  return stripUrlQueryAndFragment(url.href) || null;
}

/** Maps captured metadata through an allowlist, so diagnostics never reach the portal */
function toEnvironment(raw: string | null): PortalReportEnvironment | null {
  let metadata: Partial<ReportMetadata>;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    metadata = parsed as Partial<ReportMetadata>;
  } catch {
    return null;
  }
  if (metadata.portal === true) return null;
  const url = text(metadata.url, 2048);
  const browserName = text(metadata.browser?.name, 80);
  const browserVersion = text(metadata.browser?.version, 40);
  const osName = text(metadata.device?.os, 80);
  const osVersion = text(metadata.device?.osVersion, 40);
  const width = dimension(metadata.viewport?.width);
  const height = dimension(metadata.viewport?.height);
  const environment: PortalReportEnvironment = {
    pageUrl: url ? webAddress(url) : null,
    browser: browserName ? [browserName, browserVersion].filter(Boolean).join(' ') : null,
    os: osName ? [osName, osVersion].filter(Boolean).join(' ') : null,
    viewport: width && height ? { width, height } : null,
    timezone: text(metadata.timezone, 80),
  };
  return Object.values(environment).some((value) => value !== null) ? environment : null;
}

function isStatus(value: string | null): value is ReportStatus {
  return REPORT_STATUSES.some((status) => status === value);
}

function statusEvents(reportId: string): PortalStatusEvent[] {
  return reportHistoryRepo.statusChanges(reportId).flatMap((row) =>
    isStatus(row.oldValue) && isStatus(row.newValue) && row.oldValue !== row.newValue
      ? [
          {
            id: row.id,
            from: row.oldValue,
            to: row.newValue,
            actorName: row.actorName,
            createdAt: row.createdAt,
          },
        ]
      : []
  );
}

function encodeCursor(cursor: PortalReportCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

export const portalReportsService = {
  access(reportId: string, reporterId: string): Result<void> {
    return portalReportsRepo.detail(reportId, { kind: 'reporter', reporterId })
      ? Result.ok(undefined)
      : Result.fail('Report not found', 'NOT_FOUND');
  },

  message(message: ReportMessage, reporterId: string): PortalMessage {
    return toPortalMessage(
      message,
      reporterId,
      message.files.map((file) => toPortalFile(message.reportId, file))
    );
  },
  async projects(scope: PortalScope): Promise<Result<PortalProject[]>> {
    const settings = await settingsCacheService.getAll();
    return Result.ok(
      portalReportsRepo.projects(scope).map((project) => ({
        id: project.id,
        name: project.name,
        allowNewReports: scope.kind === 'reporter' && project.allowNewReports === 1,
        maxImageMb: project.maxImageMb ?? settings.screenshot.maxImageUploadSizeMb,
        maxVideoMb: project.maxVideoMb ?? settings.screenshot.maxVideoUploadSizeMb,
      }))
    );
  },

  list(scope: PortalScope, input: PortalReportQuery): Result<PortalReportList | PortalReportBoard> {
    let cursor: PortalReportCursor | undefined;
    if (input.cursor) {
      try {
        const decoded = portalCursorSchema.safeParse(
          JSON.parse(Buffer.from(input.cursor, 'base64url').toString())
        );
        if (!decoded.success || decoded.data.sort !== input.sort)
          return Result.fail('Invalid cursor', 'VALIDATION_ERROR');
        cursor = decoded.data;
      } catch {
        return Result.fail('Invalid cursor', 'VALIDATION_ERROR');
      }
    }
    const page = (status = input.status) => {
      const result = portalReportsRepo.list(scope, { ...input, status, cursor });
      const rows = result.rows.slice(0, input.limit);
      const last = rows.at(-1);
      return {
        reports: rows.map((row) => toSummary(row, scope)),
        nextCursor:
          result.rows.length > input.limit && last
            ? encodeCursor({
                sort: input.sort,
                at: input.sort === 'updated' ? last.updatedAt : last.createdAt,
                id: last.id,
              })
            : null,
        total: result.total,
        unreadCount: result.unreadCount,
      };
    };
    if (!input.groupByStatus) {
      const statusCounts = Object.fromEntries(
        REPORT_STATUSES.map((status) => [status, 0])
      ) as PortalReportList['statusCounts'];
      for (const row of portalReportsRepo.statusCounts(scope, input))
        if (isStatus(row.status)) statusCounts[row.status] = row.count;
      return Result.ok({ ...page(), statusCounts });
    }
    const columns = {} as PortalReportBoard['columns'];
    let unreadCount = 0;
    for (const status of REPORT_STATUSES) {
      const column =
        input.status && status !== input.status
          ? { reports: [], nextCursor: null, total: 0, unreadCount: 0 }
          : page(status);
      columns[status] = {
        reports: column.reports,
        nextCursor: column.nextCursor,
        total: column.total,
      };
      unreadCount += column.unreadCount;
    }
    return Result.ok({ columns, unreadCount });
  },

  async detail(reportId: string, scope: PortalScope): Promise<Result<PortalReportDetail>> {
    const settings = await settingsCacheService.getAll();
    return portalReportsRepo.transaction(() => {
      const row = portalReportsRepo.detail(reportId, scope);
      if (!row) return Result.fail('Report not found', 'NOT_FOUND');
      const readOnly = scope.kind === 'operator';
      // The team view shows the thread as the current owner sees it.
      const perspective = scope.kind === 'reporter' ? scope.reporterId : (row.ownerId ?? '');
      const files = portalReportsRepo.files(reportId);
      const messages = portalReportsRepo.messages(reportId);
      const byMessage = new Map<string | null, PortalFile[]>();
      for (const file of files) {
        const group = byMessage.get(file.messageId) ?? [];
        group.push(toPortalFile(reportId, file));
        byMessage.set(file.messageId, group);
      }
      const report: PortalReportDetail = {
        id: row.id,
        title: row.title,
        description: row.description,
        status: row.status,
        project: { id: row.projectId, name: row.projectName },
        assigneeName: row.assigneeName,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        files: byMessage.get(null) ?? [],
        messages: messages.map((message) =>
          toPortalMessage(message, perspective, byMessage.get(message.id) ?? [])
        ),
        statusEvents: statusEvents(reportId),
        // Captured details describe the original reporter's device, so a new owner never sees them.
        environment: row.handedOver ? null : toEnvironment(row.metadata),
        canReply:
          !readOnly &&
          row.status !== 'closed' &&
          row.notifyReporter !== 0 &&
          (row.messagingEnabled === null
            ? (settings.reporterNotifications?.messagingEnabled ?? true)
            : row.messagingEnabled === 1),
        canSubmitNewReport: !readOnly && row.allowNewReports === 1,
      };
      if (!readOnly) portalReportsRepo.markSeen(reportId, new Date().toISOString());
      return Result.ok(report);
    });
  },

  file(
    reportId: string,
    fileId: string,
    scope: PortalScope
  ): Result<{
    file: PortalFileRow & { filename: string };
    handle: StoredFileHandle;
  }> {
    const file = portalReportsRepo.file(reportId, fileId, scope);
    if (!file) return Result.fail('File not found', 'NOT_FOUND');
    return Result.ok({ file, handle: createStoredFileHandle(file.path) });
  },
};
