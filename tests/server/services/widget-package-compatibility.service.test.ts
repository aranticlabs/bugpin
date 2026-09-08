import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
  widgetVersionObservationsRepo,
  type RecentWidgetVersionObservation,
  type WidgetVersionObservation,
} from '../../../src/server/database/repositories/widget-version-observations.repo';
import {
  MIN_SUPPORTED_WIDGET_VERSION,
  widgetPackageCompatibilityService,
} from '../../../src/server/services/widget-package-compatibility.service';

const originalRepo = { ...widgetVersionObservationsRepo };

let recentObservations: RecentWidgetVersionObservation[];
let capturedUpsert:
  { observation: WidgetVersionObservation; staleBefore: string; maxPerProject: number } | undefined;

function hash(value: string): string {
  const hasher = new Bun.CryptoHasher('sha256');
  hasher.update(value);
  return hasher.digest('hex');
}

function observation(
  projectId: string,
  projectName: string,
  deploymentKey: string,
  version: string
): RecentWidgetVersionObservation {
  return {
    projectId,
    projectName,
    deploymentKey,
    version,
    lastSeenAt: new Date().toISOString(),
  };
}

beforeEach(() => {
  recentObservations = [];
  capturedUpsert = undefined;
  widgetVersionObservationsRepo.upsert = async (
    value,
    staleBefore,
    maxPerProject
  ): Promise<void> => {
    capturedUpsert = { observation: value, staleBefore, maxPerProject };
  };
  widgetVersionObservationsRepo.listRecent = async () => recentObservations;
});

afterEach(() => {
  Object.assign(widgetVersionObservationsRepo, originalRepo);
});

describe('widgetPackageCompatibilityService.observe', () => {
  it('hashes a normalized HTTP origin and applies retention bounds', async () => {
    const result = await widgetPackageCompatibilityService.observe({
      projectId: 'proj_1',
      version: '1.1.3',
      origin: 'https://EXAMPLE.com:443/path?query=yes',
    });

    expect(result.success).toBe(true);
    expect(capturedUpsert?.observation).toMatchObject({
      projectId: 'proj_1',
      version: '1.1.3',
      deploymentKey: hash('https://example.com'),
    });
    expect(capturedUpsert?.maxPerProject).toBe(100);
    expect(Date.now() - new Date(capturedUpsert!.staleBefore).getTime()).toBeLessThanOrEqual(
      30 * 24 * 60 * 60 * 1000 + 100
    );
  });

  it('uses a valid referrer origin when Origin is invalid', async () => {
    await widgetPackageCompatibilityService.observe({
      projectId: 'proj_1',
      version: '1.1.3',
      origin: 'null',
      referer: 'https://portal.example.com/account/settings',
    });

    expect(capturedUpsert?.observation.deploymentKey).toBe(hash('https://portal.example.com'));
  });

  it('uses a stable unknown identity when neither header has an HTTP origin', async () => {
    await widgetPackageCompatibilityService.observe({
      projectId: 'proj_1',
      version: '1.1.3',
      origin: 'ftp://example.com',
      referer: 'not a url',
    });

    expect(capturedUpsert?.observation.deploymentKey).toBe(hash('unknown'));
  });

  it('returns a failure when persistence fails', async () => {
    widgetVersionObservationsRepo.upsert = async () => {
      throw new Error('database unavailable');
    };

    const result = await widgetPackageCompatibilityService.observe({
      projectId: 'proj_1',
      version: '1.1.3',
    });

    expect(result).toMatchObject({
      success: false,
      code: 'OBSERVATION_ERROR',
      error: 'database unavailable',
    });
  });
});

describe('widgetPackageCompatibilityService.getStatus', () => {
  it('groups incompatible deployments and produces a deterministic warning', async () => {
    recentObservations = [
      observation('proj_beta', 'Beta', 'd'.repeat(64), MIN_SUPPORTED_WIDGET_VERSION),
      observation('proj_alpha', 'Alpha', 'b'.repeat(64), '1.1.2'),
      observation('proj_alpha', 'Alpha', 'a'.repeat(64), '1.1.1'),
      observation('proj_alpha', 'Alpha', 'c'.repeat(64), '1.1.1'),
      observation('proj_gamma', 'Gamma', 'e'.repeat(64), '2.0.0'),
    ];

    const first = await widgetPackageCompatibilityService.getStatus();
    recentObservations.reverse();
    const second = await widgetPackageCompatibilityService.getStatus();

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    if (!first.success || !second.success) return;

    expect(first.value).toMatchObject({
      minimumSupportedVersion: '1.1.3',
      incompatible: true,
      affectedProjects: [
        {
          projectId: 'proj_alpha',
          projectName: 'Alpha',
          observedVersions: ['1.1.1', '1.1.2'],
          deploymentCount: 3,
        },
      ],
    });
    expect(first.value.warningId).toHaveLength(64);
    expect(second.value.warningId).toBe(first.value.warningId);
  });

  it('returns a clean status when every observation is compatible', async () => {
    recentObservations = [
      observation('proj_1', 'Compatible', 'a'.repeat(64), MIN_SUPPORTED_WIDGET_VERSION),
      observation('proj_2', 'Newer', 'b'.repeat(64), '2.0.0'),
    ];

    const result = await widgetPackageCompatibilityService.getStatus();

    expect(result).toMatchObject({
      success: true,
      value: {
        minimumSupportedVersion: '1.1.3',
        incompatible: false,
        warningId: null,
        affectedProjects: [],
      },
    });
  });

  it('returns a failure when observations cannot be read', async () => {
    widgetVersionObservationsRepo.listRecent = async () => {
      throw new Error('read failed');
    };

    const result = await widgetPackageCompatibilityService.getStatus();

    expect(result).toMatchObject({ success: false, code: 'STATUS_ERROR', error: 'read failed' });
  });
});
