import { widgetVersionObservationsRepo } from '../database/repositories/widget-version-observations.repo.js';
import { Result } from '../utils/result.js';
import { compareVersions, isNewer } from '../utils/version-compare.js';

// Raise only when a server release intentionally stops supporting older widget packages.
export const MIN_SUPPORTED_WIDGET_VERSION = '1.1.3';

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_OBSERVATIONS_PER_PROJECT = 100;

export interface WidgetVersionObservationInput {
  projectId: string;
  version: string;
  origin?: string;
  referer?: string;
}

export interface IncompatibleWidgetProject {
  projectId: string;
  projectName: string;
  observedVersions: string[];
  deploymentCount: number;
}

export interface WidgetPackageCompatibilityStatus {
  minimumSupportedVersion: string;
  incompatible: boolean;
  warningId: string | null;
  affectedProjects: IncompatibleWidgetProject[];
}

function sha256(value: string): string {
  const hasher = new Bun.CryptoHasher('sha256');
  hasher.update(value);
  return hasher.digest('hex');
}

function httpOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
}

function staleBefore(now: Date): string {
  return new Date(now.getTime() - RETENTION_MS).toISOString();
}

export const widgetPackageCompatibilityService = {
  async observe(input: WidgetVersionObservationInput): Promise<Result<void>> {
    try {
      const now = new Date();
      const deploymentOrigin = httpOrigin(input.origin) ?? httpOrigin(input.referer) ?? 'unknown';
      await widgetVersionObservationsRepo.upsert(
        {
          projectId: input.projectId,
          deploymentKey: sha256(deploymentOrigin),
          version: input.version,
          lastSeenAt: now.toISOString(),
        },
        staleBefore(now),
        MAX_OBSERVATIONS_PER_PROJECT
      );
      return Result.ok(undefined);
    } catch (error) {
      return Result.fail(
        error instanceof Error ? error.message : String(error),
        'OBSERVATION_ERROR'
      );
    }
  },

  async getStatus(): Promise<Result<WidgetPackageCompatibilityStatus>> {
    try {
      const observations = await widgetVersionObservationsRepo.listRecent(staleBefore(new Date()));
      const affected = observations.filter((observation) =>
        isNewer(MIN_SUPPORTED_WIDGET_VERSION, observation.version)
      );
      const projects = new Map<
        string,
        { projectName: string; versions: Set<string>; deploymentCount: number }
      >();

      for (const observation of affected) {
        const project = projects.get(observation.projectId) ?? {
          projectName: observation.projectName,
          versions: new Set<string>(),
          deploymentCount: 0,
        };
        project.versions.add(observation.version);
        project.deploymentCount += 1;
        projects.set(observation.projectId, project);
      }

      const affectedProjects = [...projects.entries()]
        .map(([projectId, project]) => ({
          projectId,
          projectName: project.projectName,
          observedVersions: [...project.versions].sort(compareVersions),
          deploymentCount: project.deploymentCount,
        }))
        .sort(
          (first, second) =>
            first.projectName.localeCompare(second.projectName) ||
            first.projectId.localeCompare(second.projectId)
        );

      const warningId =
        affected.length === 0
          ? null
          : sha256(
              [
                MIN_SUPPORTED_WIDGET_VERSION,
                ...affected
                  .map(
                    (observation) =>
                      `${observation.projectId}:${observation.deploymentKey}:${observation.version}`
                  )
                  .sort(),
              ].join('|')
            );

      return Result.ok({
        minimumSupportedVersion: MIN_SUPPORTED_WIDGET_VERSION,
        incompatible: affected.length > 0,
        warningId,
        affectedProjects,
      });
    } catch (error) {
      return Result.fail(error instanceof Error ? error.message : String(error), 'STATUS_ERROR');
    }
  },
};
