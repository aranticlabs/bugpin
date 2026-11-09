import { describe, expect, it } from 'bun:test';
import { VideoQuotaService } from '../../src/server/services/video-quota.service';

describe('VideoQuotaService', () => {
  it('allows the exact limit and counts concurrent reservations', () => {
    const service = new VideoQuotaService({
      getVideoSizeByProjectSince: () => 0,
    });

    const first = service.reserve('prj_1', 600, 1000);
    expect(first.success).toBe(true);

    const exactLimit = service.reserve('prj_1', 400, 1000);
    expect(exactLimit.success).toBe(true);

    const exceeded = service.reserve('prj_1', 1, 1000);
    expect(exceeded).toEqual({
      success: false,
      error: 'The daily video upload limit has been reached for this project.',
      code: 'VIDEO_QUOTA_EXCEEDED',
    });

    if (first.success) first.value();
    if (exactLimit.success) exactLimit.value();

    const afterRelease = service.reserve('prj_1', 1000, 1000);
    expect(afterRelease.success).toBe(true);
  });

  it('never admits more than the limit while concurrent uploads commit and release', async () => {
    let storedBytes = 0;
    let usageQueries = 0;
    const service = new VideoQuotaService({
      getVideoSizeByProjectSince: () => {
        usageQueries += 1;
        return storedBytes;
      },
    });

    const upload = async (index: number): Promise<boolean> => {
      await Bun.sleep(index % 3);
      const reservation = service.reserve('prj_1', 300, 1000);
      if (!reservation.success) return false;
      await Bun.sleep((index * 7) % 4);
      storedBytes += 300;
      reservation.value();
      return true;
    };

    const results = await Promise.all(Array.from({ length: 20 }, (_, index) => upload(index)));

    expect(usageQueries).toBe(20);
    expect(results.filter(Boolean)).toHaveLength(3);
    expect(storedBytes).toBe(900);
  });

  it('returns a failure when usage cannot be checked', () => {
    const service = new VideoQuotaService({
      getVideoSizeByProjectSince: () => {
        throw new Error('database unavailable');
      },
    });

    expect(service.reserve('prj_1', 1, 1000)).toEqual({
      success: false,
      error: 'database unavailable',
      code: 'VIDEO_QUOTA_CHECK_FAILED',
    });
  });
});
