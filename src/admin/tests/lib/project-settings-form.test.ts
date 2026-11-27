import { describe, expect, it } from 'vitest';
import {
  buildProjectSettingsUpdate,
  projectSettingsToForm,
} from '../../components/project/settings/projectSettingsForm';
import type { ProjectSettings } from '@shared/types';

describe('project portal settings updates', () => {
  it.each<ProjectSettings | undefined>([
    undefined,
    {},
    { reporterPortal: { enabled: false, allowNewReports: false } },
    { reporterPortal: { enabled: true, allowNewReports: false } },
    { reporterPortal: { enabled: true, allowNewReports: true } },
  ])('omits an unchanged normalized portal while saving unrelated settings: %j', (saved) => {
    const form = projectSettingsToForm(saved, null);
    const update = buildProjectSettingsUpdate(
      saved,
      { ...form, defaultAssigneeUserId: 'user-2' },
      undefined
    );
    expect(update).not.toHaveProperty('reporterPortal');
    expect(update.defaultAssigneeUserId).toBe('user-2');
  });

  it('includes a changed portal and supports disabling new submissions or the portal', () => {
    const saved = { reporterPortal: { enabled: true, allowNewReports: true } };
    const form = projectSettingsToForm(saved, null);
    for (const reporterPortal of [
      { enabled: true, allowNewReports: false },
      { enabled: false, allowNewReports: false },
    ])
      expect(
        buildProjectSettingsUpdate(saved, { ...form, reporterPortal }, undefined).reporterPortal
      ).toEqual(reporterPortal);
    const inherited = projectSettingsToForm(undefined, null);
    expect(inherited.useCustomReporterPortal).toBe(false);
    expect(buildProjectSettingsUpdate(undefined, inherited, undefined)).not.toHaveProperty(
      'reporterPortal'
    );
    expect(
      buildProjectSettingsUpdate(
        undefined,
        {
          ...inherited,
          useCustomReporterPortal: true,
          reporterPortal: { enabled: true, allowNewReports: false },
        },
        undefined
      ).reporterPortal
    ).toEqual({ enabled: true, allowNewReports: false });
  });

  it('clears a portal override so the project inherits the defaults again', () => {
    const saved = { reporterPortal: { enabled: true, allowNewReports: false } };
    const form = projectSettingsToForm(saved, null);
    expect(form.useCustomReporterPortal).toBe(true);
    expect(
      buildProjectSettingsUpdate(saved, { ...form, useCustomReporterPortal: false }, undefined)
        .reporterPortal
    ).toBeNull();
  });
});
