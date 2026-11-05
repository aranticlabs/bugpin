import {
  DEFAULT_DIAGNOSTIC_SETTINGS,
  type DiagnosticSettings,
  type PrivacySettings,
  type ProjectSettings,
  type ReportMetadata,
  type UserActivityCapturePolicy,
} from '@shared/types';
import { redactSensitiveText, stripUrlQueryAndFragment } from '@shared/privacy';
import { logger } from '../utils/logger.js';

export interface DiagnosticCapturePolicy {
  consoleCapture: boolean;
  networkCapture: boolean;
  storageKeysCapture: boolean;
  userActivityCapture: UserActivityCapturePolicy;
}

function sanitizeUrl(value: string | undefined, minimizeUrls: boolean): string | undefined {
  if (!value) return undefined;
  const sanitized = minimizeUrls ? stripUrlQueryAndFragment(value) : value;
  return redactSensitiveText(sanitized);
}

function sanitizeMetadata(metadata: ReportMetadata, minimizeUrls: boolean): ReportMetadata {
  return {
    ...metadata,
    url: sanitizeUrl(metadata.url, minimizeUrls),
    title: metadata.title ? redactSensitiveText(metadata.title) : undefined,
    referrer: sanitizeUrl(metadata.referrer, minimizeUrls),
    consoleErrors: metadata.consoleErrors?.map((entry) => ({
      ...entry,
      message: redactSensitiveText(entry.message),
      source: sanitizeUrl(entry.source, minimizeUrls),
    })),
    networkErrors: metadata.networkErrors?.map((entry) => ({
      ...entry,
      url: sanitizeUrl(entry.url, minimizeUrls) ?? '',
      statusText: redactSensitiveText(entry.statusText),
    })),
    userActivity: metadata.userActivity?.map((entry) => ({
      ...entry,
      text: entry.text ? redactSensitiveText(entry.text) : undefined,
      url: sanitizeUrl(entry.url, minimizeUrls),
    })),
    storageKeys: metadata.storageKeys
      ? {
          cookies: metadata.storageKeys.cookies.map(redactSensitiveText),
          localStorage: metadata.storageKeys.localStorage.map(redactSensitiveText),
          sessionStorage: metadata.storageKeys.sessionStorage.map(redactSensitiveText),
        }
      : undefined,
  };
}

export const privacyPolicyService = {
  resolveUserActivityPolicy(
    privacy: PrivacySettings | undefined,
    projectSettings: ProjectSettings,
    defaults: DiagnosticSettings = DEFAULT_DIAGNOSTIC_SETTINGS
  ): UserActivityCapturePolicy {
    const activityCapture = projectSettings.activityCapture ?? defaults.activityCapture;
    if (privacy?.euPrivacyMode || !activityCapture) {
      return 'disabled';
    }

    return 'automatic';
  },

  /** Project values win; unset ones fall back to the instance defaults. */
  resolveDiagnosticPolicy(
    privacy: PrivacySettings | undefined,
    projectSettings: ProjectSettings,
    defaults: DiagnosticSettings = DEFAULT_DIAGNOSTIC_SETTINGS
  ): DiagnosticCapturePolicy {
    return {
      consoleCapture: projectSettings.consoleCapture ?? defaults.consoleCapture,
      networkCapture: projectSettings.networkCapture ?? defaults.networkCapture,
      storageKeysCapture: projectSettings.storageKeysCapture ?? defaults.storageKeysCapture,
      userActivityCapture: this.resolveUserActivityPolicy(privacy, projectSettings, defaults),
    };
  },

  applySubmissionPolicy(
    metadata: ReportMetadata,
    privacy: PrivacySettings | undefined,
    projectSettings: ProjectSettings,
    defaults: DiagnosticSettings = DEFAULT_DIAGNOSTIC_SETTINGS
  ): ReportMetadata {
    const policy = this.resolveDiagnosticPolicy(privacy, projectSettings, defaults);
    const submittedActivityCount = metadata.userActivity?.length ?? 0;
    const filtered = sanitizeMetadata(metadata, privacy?.euPrivacyMode === true);

    if (!policy.consoleCapture) {
      delete filtered.consoleErrors;
    }
    if (!policy.networkCapture) {
      delete filtered.networkErrors;
    }
    if (!policy.storageKeysCapture) {
      delete filtered.storageKeys;
    }

    if (policy.userActivityCapture === 'disabled') {
      delete filtered.userActivity;
    }

    if (submittedActivityCount > 0 && !filtered.userActivity) {
      logger.warn('Discarded user activity that did not satisfy the current privacy policy', {
        policy: policy.userActivityCapture,
        activityCount: submittedActivityCount,
      });
    }

    return filtered;
  },
};
