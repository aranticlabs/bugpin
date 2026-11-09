import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { reporterMessagesService } from '../../src/server/services/reporter-messages.service';
import { reporterMessagesRepo } from '../../src/server/database/repositories/reporter-messages.repo';
import { reportsRepo } from '../../src/server/database/repositories/reports.repo';
import { notificationsService } from '../../src/server/services/notifications.service';
import { logger } from '../../src/server/utils/logger';
import type { Report, ReporterMessage } from '../../src/shared/types';

const originalReporterMessagesRepo = { ...reporterMessagesRepo };
const originalReportsRepo = { ...reportsRepo };
const originalNotificationsService = { ...notificationsService };
const originalLogger = { ...logger };

const baseReport: Report = {
  reporterLocale: 'en',
  source: 'widget',
  id: 'rpt_1',
  projectId: 'prj_1',
  title: 'Bug report',
  status: 'open',
  priority: 'medium',
  reporterEmail: 'reporter@example.com',
  metadata: {
    url: 'https://example.com',
    browser: { name: 'Chrome', version: '1', userAgent: 'UA' },
    device: { type: 'desktop', os: 'macOS' },
    viewport: { width: 100, height: 100, devicePixelRatio: 1 },
    timestamp: new Date().toISOString(),
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const baseMessage: ReporterMessage = {
  id: 'msg_1',
  reportId: 'rpt_1',
  userId: 'usr_1',
  userName: 'Admin User',
  message: 'We are looking into this issue.',
  sentAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
};

let reportById: Report | null = baseReport;
let notifyReporterMessageCalls = 0;

const createMock = mock(
  async (_reportId: string, _userId: string, _message: string) => baseMessage
);
const findByReportIdMock = mock(async (_reportId: string) => [baseMessage]);

beforeEach(() => {
  reportById = baseReport;
  notifyReporterMessageCalls = 0;

  reportsRepo.findById = async () => reportById;

  reporterMessagesRepo.create = createMock;
  reporterMessagesRepo.findByReportId = findByReportIdMock;

  notificationsService.notifyReporterMessage = async () => {
    notifyReporterMessageCalls += 1;
  };

  createMock.mockClear();
  findByReportIdMock.mockClear();

  logger.info = () => undefined;
  logger.error = () => undefined;
  logger.warn = () => undefined;
  logger.debug = () => undefined;
});

afterEach(() => {
  Object.assign(reporterMessagesRepo, originalReporterMessagesRepo);
  Object.assign(reportsRepo, originalReportsRepo);
  Object.assign(notificationsService, originalNotificationsService);
  Object.assign(logger, originalLogger);
});

describe('reporterMessagesService.send', () => {
  it('saves and returns message for report with reporterEmail', async () => {
    const result = await reporterMessagesService.send('rpt_1', 'usr_1', 'Looking into it.');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.id).toBe('msg_1');
      expect(result.value.reportId).toBe('rpt_1');
    }
    expect(createMock).toHaveBeenCalledWith('rpt_1', 'usr_1', 'Looking into it.');
  });

  it('triggers reporter message notification', async () => {
    await reporterMessagesService.send('rpt_1', 'usr_1', 'Looking into it.');
    await Promise.resolve();
    expect(notifyReporterMessageCalls).toBe(1);
  });

  it('returns failure when report has no reporterEmail', async () => {
    reportById = { ...baseReport, reporterEmail: undefined };
    const result = await reporterMessagesService.send('rpt_1', 'usr_1', 'Hello');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('NO_REPORTER_EMAIL');
    }
    expect(createMock).not.toHaveBeenCalled();
  });

  it('returns failure when report does not exist', async () => {
    reportById = null;
    const result = await reporterMessagesService.send('rpt_missing', 'usr_1', 'Hello');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('NOT_FOUND');
    }
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe('reporterMessagesService.listByReport', () => {
  it('returns messages from repo', async () => {
    const result = await reporterMessagesService.listByReport('rpt_1');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0].id).toBe('msg_1');
    }
    expect(findByReportIdMock).toHaveBeenCalledWith('rpt_1');
  });

  it('returns empty array when no messages exist', async () => {
    findByReportIdMock.mockImplementationOnce(async () => []);
    const result = await reporterMessagesService.listByReport('rpt_1');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toHaveLength(0);
    }
  });

  it('returns NOT_FOUND for non-existent report', async () => {
    reportById = null;
    const result = await reporterMessagesService.listByReport('rpt_missing');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('NOT_FOUND');
    }
  });
});
