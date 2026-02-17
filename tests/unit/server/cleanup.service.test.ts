import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { cleanupService } from '../../../src/server/services/cleanup.service';
import { reportsRepo } from '../../../src/server/database/repositories/reports.repo';
import { filesRepo } from '../../../src/server/database/repositories/files.repo';
import { settingsRepo } from '../../../src/server/database/repositories/settings.repo';
import { logger } from '../../../src/server/utils/logger';
import type { AppSettings } from '../../../src/shared/types';

const originalReportsRepo = { ...reportsRepo };
const originalFilesRepo = { ...filesRepo };
const originalSettingsRepo = { ...settingsRepo };
const originalLogger = { ...logger };

let deletedReportIds: string[] = [];
let deletedFileReportIds: string[] = [];

beforeEach(() => {
  deletedReportIds = [];
  deletedFileReportIds = [];

  settingsRepo.getAll = async () =>
    ({
      retentionDays: 30,
    }) as AppSettings;

  reportsRepo.findIdsOlderThan = async () => [];
  reportsRepo.delete = async (id: string) => {
    deletedReportIds.push(id);
    return true;
  };

  filesRepo.deleteByReportId = async (reportId: string) => {
    deletedFileReportIds.push(reportId);
  };

  logger.info = () => undefined;
  logger.warn = () => undefined;
  logger.error = () => undefined;
  logger.debug = () => undefined;
});

afterEach(() => {
  Object.assign(reportsRepo, originalReportsRepo);
  Object.assign(filesRepo, originalFilesRepo);
  Object.assign(settingsRepo, originalSettingsRepo);
  Object.assign(logger, originalLogger);

  // Stop any running scheduler
  cleanupService.stopCleanupScheduler();
});

describe('cleanupService.cleanupOldReports', () => {
  it('skips cleanup when retention is set to 0', async () => {
    settingsRepo.getAll = async () =>
      ({
        retentionDays: 0,
      }) as AppSettings;

    const result = await cleanupService.cleanupOldReports();

    expect(result).toEqual({ deleted: 0, errors: 0 });
    expect(deletedReportIds).toHaveLength(0);
  });

  it('returns early when no old reports found', async () => {
    reportsRepo.findIdsOlderThan = async () => [];

    const result = await cleanupService.cleanupOldReports();

    expect(result).toEqual({ deleted: 0, errors: 0 });
    expect(deletedReportIds).toHaveLength(0);
  });

  it('deletes old reports and their files', async () => {
    reportsRepo.findIdsOlderThan = async () => ['rpt_1', 'rpt_2'];

    const result = await cleanupService.cleanupOldReports();

    expect(result).toEqual({ deleted: 2, errors: 0 });
    expect(deletedReportIds).toEqual(['rpt_1', 'rpt_2']);
    expect(deletedFileReportIds).toEqual(['rpt_1', 'rpt_2']);
  });

  it('counts errors when report deletion fails', async () => {
    reportsRepo.findIdsOlderThan = async () => ['rpt_1', 'rpt_2'];
    reportsRepo.delete = async (id: string) => {
      deletedReportIds.push(id);
      return id !== 'rpt_1'; // First one fails
    };

    const result = await cleanupService.cleanupOldReports();

    expect(result).toEqual({ deleted: 1, errors: 1 });
  });

  it('counts errors when an exception is thrown', async () => {
    reportsRepo.findIdsOlderThan = async () => ['rpt_1', 'rpt_2'];
    reportsRepo.delete = async (id: string) => {
      if (id === 'rpt_1') {
        throw new Error('Database error');
      }
      deletedReportIds.push(id);
      return true;
    };

    const result = await cleanupService.cleanupOldReports();

    expect(result).toEqual({ deleted: 1, errors: 1 });
    expect(deletedReportIds).toEqual(['rpt_2']);
  });
});

describe('cleanupService.startCleanupScheduler', () => {
  it('starts the scheduler', () => {
    // This test just verifies the scheduler can be started without error
    cleanupService.startCleanupScheduler();

    // Stop it immediately to clean up
    cleanupService.stopCleanupScheduler();
  });

  it('warns when scheduler is already running', () => {
    let warnCalled = false;
    logger.warn = () => {
      warnCalled = true;
    };

    cleanupService.startCleanupScheduler();
    cleanupService.startCleanupScheduler(); // Second call should warn

    expect(warnCalled).toBe(true);

    cleanupService.stopCleanupScheduler();
  });
});

describe('cleanupService.stopCleanupScheduler', () => {
  it('stops the scheduler', () => {
    cleanupService.startCleanupScheduler();
    cleanupService.stopCleanupScheduler();

    // Should be able to start again without warning
    let warnCalled = false;
    logger.warn = () => {
      warnCalled = true;
    };

    cleanupService.startCleanupScheduler();
    expect(warnCalled).toBe(false);

    cleanupService.stopCleanupScheduler();
  });

  it('does nothing when scheduler is not running', () => {
    // Should not throw
    cleanupService.stopCleanupScheduler();
  });
});
