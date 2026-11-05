import { filesRepo } from '../database/repositories/files.repo.js';
import type { IFilesRepository } from '../database/repositories/interfaces.js';
import { Result, type Result as ResultType } from '../utils/result.js';

const QUOTA_WINDOW_MS = 24 * 60 * 60 * 1000;

type VideoUsageRepository = Pick<IFilesRepository, 'getVideoSizeByProjectSince'>;

export class VideoQuotaService {
  private readonly reservedBytesByProject = new Map<string, number>();

  constructor(
    private readonly filesRepository: VideoUsageRepository,
    private readonly now: () => number = Date.now
  ) {}

  /**
   * Checks stored usage and records the reservation without yielding to the event loop, so a
   * concurrent upload cannot release its reservation between this check and this reservation
   * while its stored file is still missing from the usage total this check read.
   */
  reserve(projectId: string, incomingBytes: number, limitBytes: number): ResultType<() => void> {
    if (limitBytes <= 0 || incomingBytes <= 0) {
      return Result.ok(() => undefined);
    }

    const storedBytesResult = Result.try(
      () =>
        this.filesRepository.getVideoSizeByProjectSince(
          projectId,
          new Date(this.now() - QUOTA_WINDOW_MS).toISOString()
        ),
      'VIDEO_QUOTA_CHECK_FAILED'
    );
    if (!storedBytesResult.success) {
      return storedBytesResult;
    }

    const reservedBytes = this.reservedBytesByProject.get(projectId) ?? 0;
    if (storedBytesResult.value + reservedBytes + incomingBytes > limitBytes) {
      return Result.fail(
        'The daily video upload limit has been reached for this project.',
        'VIDEO_QUOTA_EXCEEDED'
      );
    }

    this.reservedBytesByProject.set(projectId, reservedBytes + incomingBytes);
    let released = false;

    return Result.ok(() => {
      if (released) return;
      released = true;

      const remainingBytes =
        (this.reservedBytesByProject.get(projectId) ?? incomingBytes) - incomingBytes;
      if (remainingBytes > 0) {
        this.reservedBytesByProject.set(projectId, remainingBytes);
      } else {
        this.reservedBytesByProject.delete(projectId);
      }
    });
  }
}

export const videoQuotaService = new VideoQuotaService(filesRepo);
