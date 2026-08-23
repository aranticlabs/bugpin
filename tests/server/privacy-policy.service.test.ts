import { describe, expect, it } from 'bun:test';
import { privacyPolicyService } from '../../src/server/services/privacy-policy.service';
import type { PrivacySettings, ProjectSettings, ReportMetadata } from '../../src/shared/types';

const standardPrivacy: PrivacySettings = { euPrivacyMode: false };
const euPrivacy: PrivacySettings = { euPrivacyMode: true };

const metadata: ReportMetadata = {
  url: 'https://example.com',
  timestamp: '2026-08-21T12:00:00.000Z',
  consoleErrors: [{ type: 'error', message: 'Boom', timestamp: '2026-08-21T12:00:00.000Z' }],
  networkErrors: [
    {
      url: 'https://example.com/api',
      method: 'GET',
      status: 500,
      statusText: 'Error',
      timestamp: '2026-08-21T12:00:00.000Z',
    },
  ],
  userActivity: [{ type: 'button', text: 'Save', timestamp: '2026-08-21T12:00:00.000Z' }],
  storageKeys: { cookies: ['session'], localStorage: ['theme'], sessionStorage: [] },
};

function projectSettings(overrides: ProjectSettings = {}): ProjectSettings {
  return overrides;
}

describe('privacyPolicyService', () => {
  it('keeps automatic activity capture as the default operating mode', () => {
    expect(privacyPolicyService.resolveUserActivityPolicy(standardPrivacy, projectSettings())).toBe(
      'automatic'
    );
    expect(privacyPolicyService.resolveUserActivityPolicy(undefined, projectSettings())).toBe(
      'automatic'
    );
  });

  it('always disables activity capture in EU Privacy Mode', () => {
    expect(privacyPolicyService.resolveUserActivityPolicy(euPrivacy, projectSettings())).toBe(
      'disabled'
    );
    expect(
      privacyPolicyService.resolveUserActivityPolicy(euPrivacy, { activityCapture: true })
    ).toBe('disabled');
  });

  it('allows project settings to make activity capture more restrictive', () => {
    expect(
      privacyPolicyService.resolveUserActivityPolicy(standardPrivacy, {
        activityCapture: false,
      })
    ).toBe('disabled');
  });

  it('removes activity in EU Privacy Mode', () => {
    const filtered = privacyPolicyService.applySubmissionPolicy(metadata, euPrivacy, {
      activityCapture: true,
    });

    expect(filtered.userActivity).toBeUndefined();
  });

  it('strips URL query strings and fragments in EU Privacy Mode', () => {
    const filtered = privacyPolicyService.applySubmissionPolicy(
      {
        ...metadata,
        url: 'https://example.com/app?session=abc123#inbox',
        referrer: 'https://example.com/landing?utm_campaign=x',
        consoleErrors: [
          {
            type: 'error',
            message: 'Boom',
            source: 'https://cdn.example.com/app.js?session=abc123#frame',
            timestamp: new Date().toISOString(),
          },
        ],
        networkErrors: [
          {
            url: 'https://api.example.com/orders?customer=42',
            method: 'GET',
            status: 500,
            statusText: 'Error',
            timestamp: new Date().toISOString(),
          },
        ],
      },
      euPrivacy,
      projectSettings()
    );

    expect(filtered.url).toBe('https://example.com/app');
    expect(filtered.referrer).toBe('https://example.com/landing');
    expect(filtered.consoleErrors?.[0]?.source).toBe('https://cdn.example.com/app.js');
    expect(filtered.networkErrors?.[0]?.url).toBe('https://api.example.com/orders');
  });

  it('keeps full URLs in standard mode', () => {
    const filtered = privacyPolicyService.applySubmissionPolicy(
      { ...metadata, url: 'https://example.com/app?session=abc123' },
      standardPrivacy,
      projectSettings()
    );

    expect(filtered.url).toBe('https://example.com/app?session=abc123');
  });

  it('redacts sensitive text defensively in standard mode', () => {
    const filtered = privacyPolicyService.applySubmissionPolicy(
      {
        ...metadata,
        consoleErrors: [
          {
            type: 'error',
            message: 'Contact person@example.com with card 4111 1111 1111 1111',
            timestamp: new Date().toISOString(),
          },
        ],
        userActivity: [
          {
            type: 'link',
            text: 'Open person@example.com',
            url: 'https://example.com/account?email=person@example.com#profile',
            timestamp: new Date().toISOString(),
          },
        ],
      },
      standardPrivacy,
      projectSettings()
    );

    expect(filtered.consoleErrors?.[0]?.message).toContain('[bugpin:redacted-email]');
    expect(filtered.consoleErrors?.[0]?.message).toContain('[bugpin:redacted-card]');
    expect(filtered.userActivity?.[0]?.text).toContain('[bugpin:redacted-email]');
    expect(filtered.userActivity?.[0]?.url).toContain('[bugpin:redacted-email]');
  });

  it('keeps automatic activity and enforces diagnostic category restrictions', () => {
    const filtered = privacyPolicyService.applySubmissionPolicy(metadata, standardPrivacy, {
      consoleCapture: false,
      networkCapture: false,
      storageKeysCapture: false,
    });

    expect(filtered.userActivity).toEqual(metadata.userActivity);
    expect(filtered.consoleErrors).toBeUndefined();
    expect(filtered.networkErrors).toBeUndefined();
    expect(filtered.storageKeys).toBeUndefined();
  });
});
