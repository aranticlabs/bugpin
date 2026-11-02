import { describe, expect, it } from 'bun:test';
import { VideoQuotaService } from '../../src/server/services/video-quota.service';

describe('VideoQuotaService', () => {
  it('allows the exact limit and counts concurrent reservations', async () => {
    const service = new VideoQuotaService({
      getVideoSizeByProjectSince: async () => 0,
    });

    const first = await service.reserve('prj_1', 600, 1000);
    expect(first.success).toBe(true);

    const exactLimit = await service.reserve('prj_1', 400, 1000);
    expect(exactLimit.success).toBe(true);

    const exceeded = await service.reserve('prj_1', 1, 1000);
    expect(exceeded).toEqual({
      success: false,
      error: 'The daily video upload limit has been reached for this project.',
      code: 'VIDEO_QUOTA_EXCEEDED',
    });

    if (first.success) first.value();
    if (exactLimit.success) exactLimit.value();

    const afterRelease = await service.reserve('prj_1', 1000, 1000);
    expect(afterRelease.success).toBe(true);
  });

  it('returns a failure when usage cannot be checked', async () => {
    const service = new VideoQuotaService({
      getVideoSizeByProjectSince: async () => {
        throw new Error('database unavailable');
      },
    });

    expect(await service.reserve('prj_1', 1, 1000)).toEqual({
      success: false,
      error: 'database unavailable',
      code: 'VIDEO_QUOTA_CHECK_FAILED',
    });
  });
});
