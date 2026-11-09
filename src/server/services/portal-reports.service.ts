import {
  portalReportsRepo,
  type PortalFileRow,
} from '../database/repositories/portal-reports.repo.js';
import { settingsCacheService } from './settings-cache.service.js';
import { createStoredFileHandle, type StoredFileHandle } from '../storage/files.js';
import {
  portalCursorSchema,
  type PortalReportQuery,
  type PortalReportCursor,
} from '../utils/portal-schemas.js';
import { Result } from '../utils/result.js';
import { REPORT_STATUSES } from '@shared/types';
import type {
  PortalFile,
  PortalProject,
  PortalReportBoard,
  PortalReportDetail,
  PortalReportList,
  PortalMessage,
} from '@shared/portal-types';
import type { FileRecord, ReportMessage } from '@shared/types';

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
  const isPreviousReporter = message.authorKind === 'reporter' && message.reporterId !== reporterId;
  return {
    id: message.id,
    authorKind: message.authorKind,
    authorName: isPreviousReporter ? '' : message.authorName,
    isPreviousReporter,
    isOwn: message.authorKind === 'reporter' && message.reporterId === reporterId,
    body: message.body,
    createdAt: message.createdAt,
    files,
  };
}

export const portalReportsService = {
  access(reportId: string, reporterId: string): Result<void> {
    return portalReportsRepo.detail(reportId, reporterId)
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
  async projects(reporterId: string): Promise<Result<PortalProject[]>> {
    const settings = await settingsCacheService.getAll();
    return Result.ok(
      portalReportsRepo.projects(reporterId).map((project) => ({
        id: project.id,
        name: project.name,
        allowNewFeedback: project.allowNewFeedback === 1,
        maxImageMb: project.maxImageMb ?? settings.screenshot.maxImageUploadSizeMb,
        maxVideoMb: project.maxVideoMb ?? settings.screenshot.maxVideoUploadSizeMb,
      }))
    );
  },

  list(reporterId: string, input: PortalReportQuery): Result<PortalReportList | PortalReportBoard> {
    let cursor: PortalReportCursor | undefined;
    if (input.cursor) {
      try {
        const decoded = portalCursorSchema.safeParse(
          JSON.parse(Buffer.from(input.cursor, 'base64url').toString())
        );
        if (!decoded.success) return Result.fail('Invalid cursor', 'VALIDATION_ERROR');
        cursor = decoded.data;
      } catch {
        return Result.fail('Invalid cursor', 'VALIDATION_ERROR');
      }
    }
    const page = (status = input.status): PortalReportList => {
      const result = portalReportsRepo.list(reporterId, { ...input, status, cursor });
      const rows = result.rows.slice(0, input.limit);
      const last = rows.at(-1);
      return {
        reports: rows.map((row) => ({
          id: row.id,
          title: row.title,
          status: row.status,
          project: { id: row.projectId, name: row.projectName },
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          unread: row.unread === 1,
        })),
        nextCursor:
          result.rows.length > input.limit && last
            ? Buffer.from(JSON.stringify({ updatedAt: last.updatedAt, id: last.id })).toString(
                'base64url'
              )
            : null,
        total: result.total,
        unreadCount: result.unreadCount,
      };
    };
    if (!input.groupByStatus) return Result.ok(page());
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

  async detail(reportId: string, reporterId: string): Promise<Result<PortalReportDetail>> {
    const settings = await settingsCacheService.getAll();
    return portalReportsRepo.transaction(() => {
      const row = portalReportsRepo.detail(reportId, reporterId);
      if (!row) return Result.fail('Report not found', 'NOT_FOUND');
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
          toPortalMessage(message, reporterId, byMessage.get(message.id) ?? [])
        ),
        canReply:
          row.status !== 'closed' &&
          row.notifyReporter !== 0 &&
          (row.messagingEnabled === null
            ? (settings.reporterNotifications?.messagingEnabled ?? true)
            : row.messagingEnabled === 1),
        canSubmitNewFeedback: row.allowNewFeedback === 1,
      };
      portalReportsRepo.markSeen(reportId, new Date().toISOString());
      return Result.ok(report);
    });
  },

  file(
    reportId: string,
    fileId: string,
    reporterId: string
  ): Result<{
    file: PortalFileRow & { filename: string };
    handle: StoredFileHandle;
  }> {
    const file = portalReportsRepo.file(reportId, fileId, reporterId);
    if (!file) return Result.fail('File not found', 'NOT_FOUND');
    return Result.ok({ file, handle: createStoredFileHandle(file.path) });
  },
};
